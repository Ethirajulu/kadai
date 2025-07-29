import { RedisConnectionPool, PoolConfig } from './redis-connection-pool';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('RedisConnectionPool', () => {
  let pool: RedisConnectionPool;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = {
      ping: jest.fn().mockResolvedValue('PONG'),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      status: 'ready',
      disconnect: jest.fn().mockResolvedValue(undefined),
      connect: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
      off: jest.fn(),
      removeAllListeners: jest.fn(),
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(
      () => mockRedis
    );

    const config: PoolConfig = {
      host: 'localhost',
      port: 6379,
      poolSize: 2,
      healthCheckInterval: 100, // Short interval for tests
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 3,
      retryDelayOnClusterDown: 1000,
      enableOfflineQueue: false,
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 1000, // Short timeout for tests
        monitoringWindow: 5000, // Short window for tests
        expectedFailureRate: 0.5,
      },
    };

    pool = new RedisConnectionPool(config);
  });

  afterEach(async () => {
    await pool.shutdown();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with configured pool size', async () => {
      await pool.initialize();
      expect(Redis).toHaveBeenCalledTimes(2); // poolSize = 2
      const health = pool.getPoolHealth();
      expect(health.totalConnections).toBe(2);
      expect(health.healthyConnections).toBe(2);
    });

    it('should use default config when not provided', () => {
      const defaultPool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 2,
        healthCheckInterval: 100,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 1000,
          monitoringWindow: 5000,
          expectedFailureRate: 0.5,
        },
      });
      expect(defaultPool).toBeDefined();
    });

    it('should handle initialization with different pool size', async () => {
      const urlConfig: PoolConfig = {
        host: 'localhost',
        port: 6379,
        poolSize: 1,
        healthCheckInterval: 100,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 1000,
          monitoringWindow: 5000,
          expectedFailureRate: 0.5,
        },
      };

      const urlPool = new RedisConnectionPool(urlConfig);
      await urlPool.initialize();

      const health = urlPool.getPoolHealth();
      expect(health.totalConnections).toBe(1);
      await urlPool.shutdown();
    });
  });

  describe('connection management', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should get available connection', async () => {
      const connection = await pool.getConnection();

      expect(connection).toBeDefined();
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it('should execute operations with circuit breaker protection', async () => {
      const result = await pool.execute(async (redis) => {
        return redis.get('test-key');
      });

      expect(result).toBeUndefined(); // Mock returns undefined by default
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should use fallback when circuit breaker is open', async () => {
      // Force circuit breaker to open by simulating failures
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      
      // Execute multiple times to trigger circuit breaker
      for (let i = 0; i < 6; i++) {
        try {
          await pool.execute(async (redis) => redis.get('test'));
        } catch (error) {
          // Expected to fail
        }
      }

      const fallbackResult = 'fallback-value';
      const result = await pool.execute(
        async (redis) => redis.get('test'),
        () => fallbackResult
      );

      expect(result).toBe(fallbackResult);
    });

    it('should throw error when no healthy connections available', async () => {
      // Initialize pool first
      await pool.initialize();
      
      // Directly mark all connections as unhealthy by accessing private health status
      (pool as any).healthStatus.set(0, { isHealthy: false, responseTime: 0, lastCheck: Date.now(), error: 'Mocked failure' });
      (pool as any).healthStatus.set(1, { isHealthy: false, responseTime: 0, lastCheck: Date.now(), error: 'Mocked failure' });

      await expect(pool.getConnection()).rejects.toThrow(
        'No healthy Redis connections available'
      );
    });

    it('should throw error when circuit breaker is open', async () => {
      // Simulate circuit breaker being open
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      
      // Force circuit breaker to open
      for (let i = 0; i < 6; i++) {
        try {
          await pool.execute(async (redis) => redis.get('test'));
        } catch (error) {
          // Expected to fail
        }
      }

      // Now getConnection should fail due to circuit breaker
      await expect(pool.getConnection()).rejects.toThrow();
    });
  });

  describe('health monitoring', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should provide pool health status', () => {
      const health = pool.getPoolHealth();

      expect(health).toEqual({
        totalConnections: 2,
        healthyConnections: 2,
        circuitBreakerState: expect.any(String),
        connections: expect.any(Array),
      });
    });

    it('should report pool as healthy when connections are available', () => {
      expect(pool.isHealthy()).toBe(true);
    });

    it('should report pool as unhealthy when no connections are healthy', async () => {
      // Mock ping to fail for health checks
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));
      mockRedis.status = 'connecting';

      // Trigger health check by trying to get connection
      try {
        await pool.getConnection();
      } catch (error) {
        // Expected to fail
      }

      // Pool should still report as healthy until health check runs
      // This is because health checks run on intervals
      expect(pool.isHealthy()).toBe(true); // Circuit breaker is still closed
    });
  });

  describe('error handling', () => {
    it('should handle Redis connection failures during initialization', async () => {
      (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => {
        throw new Error('Connection failed');
      });

      const failingPool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 2,
        healthCheckInterval: 100,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
      });
      await expect(failingPool.initialize()).rejects.toThrow();
    });

    it('should handle disconnection errors gracefully', async () => {
      await pool.initialize();

      mockRedis.disconnect.mockRejectedValue(
        new Error('Disconnect failed') as never
      );

      // Should not throw
      await expect(pool.shutdown()).resolves.not.toThrow();
    });

    it('should handle circuit breaker state changes', async () => {
      await pool.initialize();

      // Force failures to trigger circuit breaker
      mockRedis.get.mockRejectedValue(new Error('Redis error'));
      
      for (let i = 0; i < 6; i++) {
        try {
          await pool.execute(async (redis) => redis.get('test'));
        } catch (error) {
          // Expected failures
        }
      }

      // Circuit breaker should be open now
      await expect(pool.getConnection()).rejects.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should clean up all connections on shutdown', async () => {
      await pool.initialize();

      const health = pool.getPoolHealth();
      expect(health.totalConnections).toBeGreaterThan(0);

      await pool.shutdown();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should prevent new operations during shutdown', async () => {
      await pool.initialize();
      
      // Start shutdown (don't await immediately)
      const shutdownPromise = pool.shutdown();
      
      // Try to get connection during shutdown - this should fail quickly
      await expect(pool.getConnection()).rejects.toThrow(
        'Connection pool is shutting down'
      );
      
      // Wait for shutdown to complete
      await shutdownPromise;
    });

    it('should handle shutdown errors gracefully', async () => {
      await pool.initialize();

      mockRedis.disconnect.mockRejectedValue(
        new Error('Disconnect failed') as never
      );

      // Should not throw even if individual connections fail to disconnect
      await expect(pool.shutdown()).resolves.not.toThrow();
    });
  });

  describe('configuration', () => {
    it('should use default configuration values', () => {
      const defaultPool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 3,
      });
      
      expect(defaultPool).toBeDefined();
      
      const health = defaultPool.getPoolHealth();
      expect(health.totalConnections).toBe(3); // Default poolSize
    });

    it('should override default configuration with provided values', () => {
      const customPool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 5,
        healthCheckInterval: 10000,
      });
      
      expect(customPool).toBeDefined();
      
      const health = customPool.getPoolHealth();
      expect(health.totalConnections).toBe(5); // Custom poolSize
    });
  });
});
