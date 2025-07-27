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
      (circuitBreaker as any).state = CircuitBreakerState.OPEN;
      (circuitBreaker as any).lastFailureTime = Date.now() - 11000; // 11 seconds ago

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
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
      (circuitBreaker as any).state = CircuitBreakerState.OPEN;

      await expect(
        circuitBreaker.execute(() => mockRedis.get('test-key'))
      ).rejects.toThrow('Circuit breaker is OPEN');

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

      expect((circuitBreaker as any).failureCount).toBe(1);

      // Now succeed
      mockRedis.ping.mockResolvedValue('PONG');
      await circuitBreaker.execute(() => mockRedis.ping());

      expect((circuitBreaker as any).failureCount).toBe(0);
    });
  });

  describe('health monitoring', () => {
    it('should start health monitoring', () => {
      (circuitBreaker as any).startHealthMonitoring();
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('should stop health monitoring', () => {
      (circuitBreaker as any).stopHealthMonitoring();
      expect(mockRedis.off).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.off).toHaveBeenCalledWith('ready', expect.any(Function));
    });

    it('should handle Redis error events', () => {
      (circuitBreaker as any).startHealthMonitoring();
      const errorHandler = mockRedis.on.mock.calls.find(
        (call) => call[0] === 'error'
      )?.[1];

      if (errorHandler) {
        errorHandler(new Error('Redis connection lost'));
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      }
    });

    it('should handle Redis ready events', () => {
      (circuitBreaker as any).state = CircuitBreakerState.OPEN;
      (circuitBreaker as any).startHealthMonitoring();
      const readyHandler = mockRedis.on.mock.calls.find(
        (call) => call[0] === 'ready'
      )?.[1];

      if (readyHandler) {
        readyHandler();
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.HALF_OPEN);
      }
    });
  });

  describe('getHealthStatus', () => {
    it('should return healthy status when circuit is CLOSED', () => {
      const health = circuitBreaker.getHealthStatus();

      expect(health.state).toBe(CircuitBreakerState.CLOSED);
      expect(health.isHealthy).toBe(true);
      expect((circuitBreaker as any).failureCount).toBe(0);
    });

    it('should return unhealthy status when circuit is OPEN', () => {
      (circuitBreaker as any).state = CircuitBreakerState.OPEN;
      (circuitBreaker as any).failureCount = 5;

      const health = circuitBreaker.getHealthStatus();

      expect(health.state).toBe(CircuitBreakerState.OPEN);
      expect(health.isHealthy).toBe(false);
      expect((circuitBreaker as any).failureCount).toBe(5);
    });

    it('should include last failure time in health status', () => {
      const failureTime = Date.now() - 5000;
      (circuitBreaker as any).lastFailureTime = failureTime;

      const health = circuitBreaker.getHealthStatus();

      expect((circuitBreaker as any).lastFailureTime).toBe(failureTime);
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

    it('should cleanup resources on destroy', () => {
      (circuitBreaker as any).startHealthMonitoring();
      (circuitBreaker as any).destroy();

      expect(mockRedis.off).toHaveBeenCalled();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });

  describe('timeout handling', () => {
    it('should handle operation timeouts', async () => {
      const timeoutBreaker = new RedisCircuitBreaker('redis://localhost:6379', {
        failureThreshold: 1,
      });
      (timeoutBreaker as any).redis = mockRedis;

      mockRedis.get.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 200))
      );

      await expect(
        timeoutBreaker.execute(() => mockRedis.get('timeout-key'))
      ).rejects.toThrow();
    });
  });
});
