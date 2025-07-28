import {
  RedisCircuitBreaker,
  CircuitBreakerState,
} from './redis-circuit-breaker';
import Redis from 'ioredis';

jest.mock('ioredis');

describe('RedisCircuitBreaker', () => {
  let circuitBreaker: RedisCircuitBreaker;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    mockRedis = {
      ping: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      on: jest.fn(),
      off: jest.fn(),
      disconnect: jest.fn(),
      status: 'ready',
    } as any;

    circuitBreaker = new RedisCircuitBreaker('redis://localhost:6379', {
      failureThreshold: 3,
    });

    (circuitBreaker as any).redis = mockRedis;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isAvailable()).toBe(true);
    });

    it('should use default options when none provided', () => {
      const defaultBreaker = new RedisCircuitBreaker('redis://localhost:6379');
      expect(defaultBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('state transitions', () => {
    it('should transition to OPEN when failure threshold is reached', async () => {
      mockRedis.ping.mockRejectedValue(new Error('Connection failed'));

      // Trigger failures to reach threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(() => mockRedis.ping());
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.isAvailable()).toBe(false);
    });

    it('should transition to HALF_OPEN after reset timeout', async () => {
      // Force to OPEN state
      circuitBreaker.open();
      
      // Manually set next attempt time to past to allow transition
      (circuitBreaker as any).metrics.nextAttemptTime = Date.now() - 1000;

      // Execute an operation which should transition to HALF_OPEN
      mockRedis.ping.mockResolvedValue('PONG');
      const result = await circuitBreaker.execute(() => mockRedis.ping());

      expect(result).toBe('PONG');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition to CLOSED on successful operation in HALF_OPEN', async () => {
      (circuitBreaker as any).state = CircuitBreakerState.HALF_OPEN;
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await circuitBreaker.execute(() => mockRedis.ping());

      expect(result).toBe('PONG');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      (circuitBreaker as any).state = CircuitBreakerState.HALF_OPEN;
      mockRedis.ping.mockRejectedValue(new Error('Still failing'));

      try {
        await circuitBreaker.execute(() => mockRedis.ping());
      } catch {
        // Expected to fail
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('execute method', () => {
    it('should execute successfully when circuit is CLOSED', async () => {
      mockRedis.get.mockResolvedValue('test-value');

      const result = await circuitBreaker.execute(() =>
        mockRedis.get('test-key')
      );

      expect(result).toBe('test-value');
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should reject immediately when circuit is OPEN', async () => {
      circuitBreaker.open();

      await expect(
        circuitBreaker.execute(() => mockRedis.get('test-key'))
      ).rejects.toThrow('Circuit breaker');

      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should handle Redis operation failures', async () => {
      const error = new Error('Redis operation failed');
      mockRedis.set.mockRejectedValue(error);

      await expect(
        circuitBreaker.execute(() => mockRedis.set('key', 'value'))
      ).rejects.toThrow('Redis operation failed');
    });

    it('should reset failure count on successful operation', async () => {
      // Simulate some failures first
      mockRedis.ping.mockRejectedValue(new Error('Failure'));
      try {
        await circuitBreaker.execute(() => mockRedis.ping());
      } catch {
        // Expected to fail
      }

      const metricsAfterFailure = circuitBreaker.getMetrics();
      expect(metricsAfterFailure.totalFailures).toBe(1);

      // Force to HALF_OPEN state to test success reset
      (circuitBreaker as any).metrics.state = CircuitBreakerState.HALF_OPEN;
      
      // Now succeed
      mockRedis.ping.mockResolvedValue('PONG');
      await circuitBreaker.execute(() => mockRedis.ping());

      const metricsAfterSuccess = circuitBreaker.getMetrics();
      expect(metricsAfterSuccess.totalFailures).toBe(0);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('health monitoring', () => {
    it('should provide circuit breaker availability status', () => {
      expect(circuitBreaker.isAvailable()).toBe(true);
    });

    it('should report unavailable when circuit is open', () => {
      circuitBreaker.open();
      expect(circuitBreaker.isAvailable()).toBe(false);
    });

    it('should report available after recovery timeout in open state', () => {
      circuitBreaker.open();
      
      // Set next attempt time to past
      (circuitBreaker as any).metrics.nextAttemptTime = Date.now() - 1000;
      
      expect(circuitBreaker.isAvailable()).toBe(true);
    });

    it('should allow manual circuit control', () => {
      // Test manual open
      circuitBreaker.open();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      
      // Test manual close
      circuitBreaker.close();
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when circuit is CLOSED', () => {
      const health = circuitBreaker.getHealthStatus();

      expect(health.state).toBe(CircuitBreakerState.CLOSED);
      expect(health.isHealthy).toBe(true);
      expect(health.metrics.totalFailures).toBe(0);
    });

    it('should return unhealthy status when circuit is OPEN', () => {
      circuitBreaker.open();

      const health = circuitBreaker.getHealthStatus();

      expect(health.state).toBe(CircuitBreakerState.OPEN);
      expect(health.isHealthy).toBe(false);
    });

    it('should include metrics in health status', async () => {
      // Generate some activity
      try {
        await circuitBreaker.execute(() => Promise.reject(new Error('test')));
      } catch {
        // Expected failure
      }

      const health = circuitBreaker.getHealthStatus();

      expect(health.metrics).toBeDefined();
      expect(health.metrics.totalRequests).toBeGreaterThan(0);
      expect(health.config).toBeDefined();
      expect(health.name).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle concurrent execute calls', async () => {
      mockRedis.get.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('value'), 100))
      );

      const promises = Array(5)
        .fill(null)
        .map(() =>
          circuitBreaker.execute(() => mockRedis.get('concurrent-key'))
        );

      const results = await Promise.all(promises);
      expect(results.every((r) => r === 'value')).toBe(true);
    });

    it('should handle rapid state changes', async () => {
      // Rapid failures
      mockRedis.ping.mockRejectedValue(new Error('Rapid failure'));

      const promises = Array(10)
        .fill(null)
        .map(() =>
          circuitBreaker.execute(() => mockRedis.ping()).catch(() => null)
        );

      await Promise.all(promises);
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should provide circuit breaker state information', () => {
      const metrics = circuitBreaker.getMetrics();
      
      expect(metrics).toHaveProperty('totalRequests');
      expect(metrics).toHaveProperty('totalFailures');
      expect(metrics).toHaveProperty('lastFailureTime');
      expect(metrics).toHaveProperty('state');
      expect(metrics).toHaveProperty('nextAttemptTime');
      expect(metrics.state).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('timeout handling', () => {
    it('should handle operation failures gracefully', async () => {
      const timeoutBreaker = new RedisCircuitBreaker('test-timeout', {
        failureThreshold: 1,
      });

      // Mock an operation that fails with timeout error
      mockRedis.get.mockRejectedValue(new Error('Operation timeout'));

      await expect(
        timeoutBreaker.execute(() => mockRedis.get('timeout-key'))
      ).rejects.toThrow('Operation timeout');

      // Should transition to OPEN after failure
      expect(timeoutBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });
  });
});
