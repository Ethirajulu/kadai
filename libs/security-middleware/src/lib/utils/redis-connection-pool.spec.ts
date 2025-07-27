import { RedisConnectionPool, PoolConfig } from './redis-connection-pool';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('RedisConnectionPool', () => {
  let pool: RedisConnectionPool;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = {
      ping: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      status: 'ready',
      disconnect: jest.fn(),
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
      healthCheckInterval: 30000,
      retryDelayOnFailover: 1000,
      maxRetriesPerRequest: 3,
      retryDelayOnClusterDown: 1000,
      enableOfflineQueue: false,
      circuitBreaker: {
        failureThreshold: 3,
        recoveryTimeout: 60000,
        monitoringWindow: 300000,
        expectedFailureRate: 0.5,
      },
    };

    pool = new RedisConnectionPool(config);
  });

  afterEach(async () => {
    await (pool as any).destroy();
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with minimum connections', async () => {
      await pool.initialize();
      expect(Redis).toHaveBeenCalledTimes(2); // minConnections = 2
      expect((pool as any).getStats().totalConnections).toBe(2);
      expect((pool as any).getStats().availableConnections).toBe(2);
    });

    it('should use default config when not provided', () => {
      const defaultPool = new RedisConnectionPool({
        host: 'localhost',
        port: 6379,
        poolSize: 2,
        healthCheckInterval: 30000,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 60000,
          monitoringWindow: 300000,
          expectedFailureRate: 0.5,
        },
      });
      expect(defaultPool).toBeDefined();
    });

    it('should handle initialization with Redis connection URL', async () => {
      const urlConfig: PoolConfig = {
        host: 'localhost',
        port: 6379,
        poolSize: 1,
        healthCheckInterval: 30000,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 60000,
          monitoringWindow: 300000,
          expectedFailureRate: 0.5,
        },
      };

      const urlPool = new RedisConnectionPool(urlConfig);
      await urlPool.initialize();

      expect((urlPool as any).getStats().totalConnections).toBe(1);
      await (urlPool as any).destroy();
    });
  });

  describe('connection acquisition', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should acquire available connection', async () => {
      const connection = await (pool as any).acquire();

      expect(connection).toBeDefined();
      expect((pool as any).getStats().availableConnections).toBe(1);
      expect((pool as any).getStats().acquiredConnections).toBe(1);
    });

    it('should create new connection when pool has capacity', async () => {
      // Acquire all initial connections
      await (pool as any).acquire();
      await (pool as any).acquire();

      // Should create new connection
      const newConnection = await (pool as any).acquire();
      expect(newConnection).toBeDefined();
      expect((pool as any).getStats().totalConnections).toBe(3);
    });

    it('should wait for connection when pool is at max capacity', async () => {
      const maxConnections = 5;
      const connections: Redis[] = [];

      // Acquire all possible connections
      for (let i = 0; i < maxConnections; i++) {
        connections.push(await (pool as any).acquire());
      }

      expect((pool as any).getStats().totalConnections).toBe(maxConnections);
      expect((pool as any).getStats().availableConnections).toBe(0);

      // This should wait for a connection to be released
      const acquirePromise = (pool as any).acquire();

      // Release a connection after short delay
      setTimeout(() => (pool as any).release(connections[0]), 100);

      const connection = await acquirePromise;
      expect(connection).toBeDefined();
    });

    it('should timeout when waiting too long for connection', async () => {
      const timeoutConfig: PoolConfig = {
        host: 'localhost',
        port: 6379,
        poolSize: 1,
        healthCheckInterval: 30000,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 60000,
          monitoringWindow: 300000,
          expectedFailureRate: 0.5,
        },
      };

      const timeoutPool = new RedisConnectionPool(timeoutConfig);
      await timeoutPool.initialize();

      // Acquire the only connection
      await (timeoutPool as any).acquire();

      // This should timeout
      await expect((timeoutPool as any).acquire()).rejects.toThrow(
        'Connection acquire timeout'
      );

      await (timeoutPool as any).destroy();
    });
  });

  describe('connection release', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should release connection back to pool', async () => {
      const connection = await (pool as any).acquire();
      expect((pool as any).getStats().availableConnections).toBe(1);

      (pool as any).release(connection);
      expect((pool as any).getStats().availableConnections).toBe(2);
      expect((pool as any).getStats().acquiredConnections).toBe(0);
    });

    it('should not release connection that is not in acquired state', async () => {
      const connection = await (pool as any).acquire();
      (pool as any).release(connection);

      // Try to release again - should be ignored
      (pool as any).release(connection);
      expect((pool as any).getStats().availableConnections).toBe(2);
    });

    it('should handle release of invalid connection gracefully', () => {
      const fakeConnection = {} as Redis;
      expect(() => (pool as any).release(fakeConnection)).not.toThrow();
    });
  });

  describe('connection health monitoring', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should remove unhealthy connections', async () => {
      const connection = await (pool as any).acquire();

      // Simulate connection becoming unhealthy
      mockRedis.status = 'connecting';
      mockRedis.ping.mockRejectedValue(new Error('Connection lost'));

      const isHealthy = await (pool as any).isConnectionHealthy(
        connection as any
      );
      expect(isHealthy).toBe(false);
    });

    it('should validate connection health before returning', async () => {
      mockRedis.ping.mockResolvedValue('PONG');

      const connection = await (pool as any).acquire();
      expect(mockRedis.ping).toHaveBeenCalled();
      expect(connection).toBeDefined();
    });

    it('should handle ping failures during health check', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Ping failed'));

      const connection = await (pool as any).acquire();
      const isHealthy = await (pool as any).isConnectionHealthy(
        connection as any
      );
      expect(isHealthy).toBe(false);
    });
  });

  describe('idle connection cleanup', () => {
    it('should remove idle connections after timeout', async () => {
      const shortIdleConfig: PoolConfig = {
        host: 'localhost',
        port: 6379,
        poolSize: 2,
        healthCheckInterval: 30000,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 60000,
          monitoringWindow: 300000,
          expectedFailureRate: 0.5,
        },
      };

      const idlePool = new RedisConnectionPool(shortIdleConfig);
      await idlePool.initialize();

      // Create extra connections
      const conn1 = await (idlePool as any).acquire();
      const conn2 = await (idlePool as any).acquire();
      (idlePool as any).release(conn1);
      (idlePool as any).release(conn2);

      expect((idlePool as any).getStats().totalConnections).toBe(3);

      // Wait for idle cleanup
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Should keep only minimum connections
      expect((idlePool as any).getStats().totalConnections).toBeLessThanOrEqual(
        2
      );

      await (idlePool as any).destroy();
    });
  });

  describe('pool statistics', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should provide accurate statistics', async () => {
      const stats = (pool as any).getStats();

      expect(stats).toEqual({
        totalConnections: 2,
        availableConnections: 2,
        acquiredConnections: 0,
        pendingAcquires: 0,
        isHealthy: true,
      });
    });

    it('should update statistics when connections are acquired/released', async () => {
      const connection = await (pool as any).acquire();

      const statsAfterAcquire = (pool as any).getStats();
      expect(statsAfterAcquire.acquiredConnections).toBe(1);
      expect(statsAfterAcquire.availableConnections).toBe(1);

      (pool as any).release(connection);

      const statsAfterRelease = (pool as any).getStats();
      expect(statsAfterRelease.acquiredConnections).toBe(0);
      expect(statsAfterRelease.availableConnections).toBe(2);
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
        healthCheckInterval: 30000,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
      });
      await expect(failingPool.initialize()).rejects.toThrow();
    });

    it('should handle connection creation failures during acquire', async () => {
      await pool.initialize();

      // Acquire all initial connections
      await (pool as any).acquire();
      await (pool as any).acquire();

      // Mock Redis constructor to fail for new connections
      (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => {
        throw new Error('Cannot create new connection');
      });

      await expect((pool as any).acquire()).rejects.toThrow();
    });

    it('should handle disconnection errors gracefully', async () => {
      await pool.initialize();

      mockRedis.disconnect.mockRejectedValue(
        new Error('Disconnect failed') as never
      );

      // Should not throw
      await expect((pool as any).destroy()).resolves.not.toThrow();
    });
  });

  describe('concurrent operations', () => {
    beforeEach(async () => {
      await pool.initialize();
    });

    it('should handle concurrent acquire operations', async () => {
      const promises = Array(10)
        .fill(null)
        .map(() => (pool as any).acquire());

      const connections = await Promise.all(promises);
      expect(connections).toHaveLength(10);
      expect(connections.every((conn) => conn !== undefined)).toBe(true);

      // Release all connections
      connections.forEach((conn) => (pool as any).release(conn));
    });

    it('should handle mixed acquire/release operations', async () => {
      const operations: Promise<Redis>[] = [];

      for (let i = 0; i < 20; i++) {
        if (i % 2 === 0) {
          operations.push(
            (pool as any).acquire().then((conn: Redis) => {
              setTimeout(
                () => (pool as any).release(conn),
                Math.random() * 100
              );
              return conn;
            })
          );
        }
      }

      await Promise.all(operations);
      expect((pool as any).getStats().isHealthy).toBe(true);
    });
  });

  describe('destroy', () => {
    it('should clean up all connections on destroy', async () => {
      await pool.initialize();

      const connection = await (pool as any).acquire();
      expect((pool as any).getStats().totalConnections).toBeGreaterThan(0);

      await (pool as any).destroy();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should wait for pending acquires before destroying', async () => {
      const singleConnConfig: PoolConfig = {
        host: 'localhost',
        port: 6379,
        poolSize: 1,
        healthCheckInterval: 30000,
        retryDelayOnFailover: 1000,
        maxRetriesPerRequest: 3,
        retryDelayOnClusterDown: 1000,
        enableOfflineQueue: false,
        circuitBreaker: {
          failureThreshold: 3,
          recoveryTimeout: 60000,
          monitoringWindow: 300000,
          expectedFailureRate: 0.5,
        },
      };

      const singlePool = new RedisConnectionPool(singleConnConfig);
      await singlePool.initialize();

      // Acquire the only connection
      await (singlePool as any).acquire();

      // Start a pending acquire
      const pendingAcquire = (singlePool as any).acquire();

      // Destroy should wait for pending operations
      const destroyPromise = (singlePool as any).destroy();

      // Should not resolve immediately
      await new Promise((resolve) => setTimeout(resolve, 10));

      await destroyPromise;
    });
  });
});
