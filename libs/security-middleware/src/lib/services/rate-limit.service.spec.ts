import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';
import { SecurityRequest, RateLimitConfig } from '../types/security.types';
import { RedisConnectionPool } from '../utils/redis-connection-pool';
import { CircuitBreakerState } from '../utils/redis-circuit-breaker';

// Mock os module at the top level
jest.mock('os', () => ({
  loadavg: jest.fn(() => [2.0, 1.8, 1.5]),
  cpus: jest.fn(() => new Array(4)),
  totalmem: jest.fn(() => 8589934592), // 8GB
  freemem: jest.fn(() => 3435973836),  // ~3.2GB free = ~60% used
}));

// Constants for test data consistency
const TEST_CONSTANTS = {
  IP_ADDRESS: '192.168.1.100',
  WHITELISTED_IP: '127.0.0.1',
  USER_AGENT: 'test-agent',
  USER_ID: 'user-123',
  PATH: '/api/test',
  METHOD: 'GET',
  HEALTH_PATH: '/health',
  ANONYMOUS_LIMIT: 100,
  AUTHENTICATED_LIMIT: 200,
  WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  BURST_LIMIT: 20,
  BURST_LIMIT_AUTH: 50,
  PRECISION: 60,
  CPU_THRESHOLD: 80,
  MEMORY_THRESHOLD: 85,
  LOAD_FACTOR: 0.5,
  REDIS_PORT: 6379,
  REDIS_HOST: 'localhost',
  KEY_PREFIX: 'rate_limit:',
} as const;

// Mock Redis Connection Pool
jest.mock('../utils/redis-connection-pool');
const MockedRedisConnectionPool = RedisConnectionPool as jest.MockedClass<typeof RedisConnectionPool>;

// Helper function to create SecurityRequest mock
const createMockSecurityRequest = (overrides: Partial<SecurityRequest> = {}): SecurityRequest => {
  const defaultConnection = { remoteAddress: TEST_CONSTANTS.IP_ADDRESS } as any;
  const defaultSocket = { 
    remoteAddress: TEST_CONSTANTS.IP_ADDRESS,
    destroySoon: jest.fn(),
    write: jest.fn(),
    connect: jest.fn(),
    setEncoding: jest.fn(),
    end: jest.fn(),
    destroy: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    setTimeout: jest.fn(),
    setNoDelay: jest.fn(),
    setKeepAlive: jest.fn(),
    address: jest.fn(),
    unref: jest.fn(),
    ref: jest.fn(),
    readable: true,
    writable: true,
    destroyed: false,
    pending: false,
    connecting: false,
    readyState: 'open',
    localAddress: '127.0.0.1',
    localPort: 3000,
    remotePort: 80,
    remoteFamily: 'IPv4',
    bytesRead: 0,
    bytesWritten: 0,
    // Add EventEmitter methods
    addListener: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    setMaxListeners: jest.fn(),
    getMaxListeners: jest.fn(),
    listeners: jest.fn(),
    rawListeners: jest.fn(),
    emit: jest.fn(),
    listenerCount: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn(),
    // Add Stream methods
    _read: jest.fn(),
    read: jest.fn(),
    push: jest.fn(),
    unshift: jest.fn(),
    wrap: jest.fn(),
    pipe: jest.fn(),
    unpipe: jest.fn(),
    _write: jest.fn(),
    _writev: jest.fn(),
    cork: jest.fn(),
    uncork: jest.fn(),
    _flush: jest.fn(),
    _final: jest.fn(),
    _destroy: jest.fn(),
    _undestroy: jest.fn(),
  } as any;

  return {
    ip: TEST_CONSTANTS.IP_ADDRESS,
    headers: { 'user-agent': TEST_CONSTANTS.USER_AGENT },
    user: undefined,
    path: TEST_CONSTANTS.PATH,
    method: TEST_CONSTANTS.METHOD,
    connection: defaultConnection,
    socket: defaultSocket,
    url: TEST_CONSTANTS.PATH,
    originalUrl: TEST_CONSTANTS.PATH,
    body: {},
    params: {},
    query: {},
    cookies: {},
    get: jest.fn(),
    header: jest.fn(),
    accepts: jest.fn(),
    acceptsCharsets: jest.fn(),
    acceptsEncodings: jest.fn(),
    acceptsLanguages: jest.fn(),
    range: jest.fn(),
    param: jest.fn(),
    is: jest.fn(),
    xhr: false,
    protocol: 'http',
    secure: false,
    fresh: false,
    stale: true,
    subdomains: [],
    route: {},
    baseUrl: '',
    hostname: 'localhost',
    // Add minimal stream properties for Request interface
    readable: true,
    readableEnded: false,
    readableFlowing: null,
    readableHighWaterMark: 16384,
    readableLength: 0,
    readableObjectMode: false,
    destroyed: false,
    _read: jest.fn(),
    read: jest.fn(),
    setEncoding: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    isPaused: jest.fn(),
    unpipe: jest.fn(),
    unshift: jest.fn(),
    wrap: jest.fn(),
    push: jest.fn(),
    _destroy: jest.fn(),
    destroy: jest.fn(),
    _undestroy: jest.fn(),
    pipe: jest.fn(),
    addListener: jest.fn(),
    on: jest.fn(),
    once: jest.fn(),
    removeListener: jest.fn(),
    off: jest.fn(),
    removeAllListeners: jest.fn(),
    setMaxListeners: jest.fn(),
    getMaxListeners: jest.fn(),
    listeners: jest.fn(),
    rawListeners: jest.fn(),
    emit: jest.fn(),
    listenerCount: jest.fn(),
    prependListener: jest.fn(),
    prependOnceListener: jest.fn(),
    eventNames: jest.fn(),
    setTimeout: jest.fn(),
    // Additional Express Request properties
    app: {} as any,
    res: {} as any,
    next: {} as any,
    ...overrides,
  } as SecurityRequest;
};

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockConnectionPool: jest.Mocked<RedisConnectionPool>;

  const mockRequest: SecurityRequest = createMockSecurityRequest();

  const mockConfig: RateLimitConfig = {
    enabled: true,
    redis: {
      host: TEST_CONSTANTS.REDIS_HOST,
      port: TEST_CONSTANTS.REDIS_PORT,
      keyPrefix: TEST_CONSTANTS.KEY_PREFIX,
      connectTimeout: 10000,
      lazyConnect: true,
      maxRetriesPerRequest: 3,
      retryDelayOnFailover: 100,
      poolSize: 3,
      healthCheckInterval: 30000,
      enableOfflineQueue: false,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringWindow: 300000,
        expectedFailureRate: 0.5,
      },
    },
    defaultLimits: {
      anonymous: {
        requests: TEST_CONSTANTS.ANONYMOUS_LIMIT,
        windowMs: TEST_CONSTANTS.WINDOW_MS,
        burst: TEST_CONSTANTS.BURST_LIMIT,
      },
      authenticated: {
        requests: TEST_CONSTANTS.AUTHENTICATED_LIMIT,
        windowMs: TEST_CONSTANTS.WINDOW_MS,
        burst: TEST_CONSTANTS.BURST_LIMIT_AUTH,
      },
    },
    slidingWindow: {
      enabled: true,
      precision: TEST_CONSTANTS.PRECISION,
    },
    adaptive: {
      enabled: true,
      cpuThreshold: TEST_CONSTANTS.CPU_THRESHOLD,
      memoryThreshold: TEST_CONSTANTS.MEMORY_THRESHOLD,
      loadFactor: TEST_CONSTANTS.LOAD_FACTOR,
    },
    whitelist: {
      ips: [TEST_CONSTANTS.WHITELISTED_IP, '::1'],
      skipPaths: [TEST_CONSTANTS.HEALTH_PATH, '/metrics'],
    },
    headers: {
      includeHeaders: true,
    },
  };

  beforeEach(async () => {
    // Create mock connection pool
    mockConnectionPool = {
      initialize: jest.fn(),
      shutdown: jest.fn(),
      execute: jest.fn(),
      getConnection: jest.fn(),
      isHealthy: jest.fn(),
      getPoolHealth: jest.fn(),
    } as any;

    MockedRedisConnectionPool.mockImplementation(() => mockConnectionPool);

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'security.rateLimit') return mockConfig;
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize Redis connection pool when enabled', async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);

      await service.onModuleInit();

      expect(MockedRedisConnectionPool).toHaveBeenCalledWith(
        expect.objectContaining({
          host: TEST_CONSTANTS.REDIS_HOST,
          port: TEST_CONSTANTS.REDIS_PORT,
          poolSize: 3,
          circuitBreaker: expect.objectContaining({
            failureThreshold: 5,
            recoveryTimeout: 60000,
          }),
        })
      );
      expect(mockConnectionPool.initialize).toHaveBeenCalled();
    });

    it('should handle Redis pool initialization failure', async () => {
      const mockError = new Error('Redis pool initialization failed');
      mockConnectionPool.initialize.mockRejectedValue(mockError);

      await expect(service.onModuleInit()).rejects.toThrow('Redis pool initialization failed');
    });

    it('should skip initialization when rate limiting is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const mockConfigService = {
        get: jest.fn().mockReturnValue(disabledConfig),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const disabledService = module.get<RateLimitService>(RateLimitService);
      await disabledService.onModuleInit();

      expect(MockedRedisConnectionPool).not.toHaveBeenCalled();
    });

    it('should shutdown connection pool properly', async () => {
      mockConnectionPool.shutdown.mockResolvedValue(undefined);

      // First initialize
      await service.onModuleInit();

      // Then shutdown
      await service.onModuleDestroy();

      expect(mockConnectionPool.shutdown).toHaveBeenCalled();
    });

    it('should handle shutdown errors gracefully', async () => {
      const mockError = new Error('Shutdown failed');
      mockConnectionPool.shutdown.mockRejectedValue(mockError);

      await service.onModuleInit();

      // Should not throw during shutdown (test logs error but continues)
      await service.onModuleDestroy();
      expect(mockConnectionPool.shutdown).toHaveBeenCalled();
    });
  });

  describe('Rate Limit Checking with Circuit Breaker', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should allow request when rate limiting is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const mockConfigService = {
        get: jest.fn().mockReturnValue(disabledConfig),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const disabledService = module.get<RateLimitService>(RateLimitService);

      const result = await disabledService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should allow whitelisted requests', async () => {
      const whitelistedRequest = createMockSecurityRequest({
        ip: TEST_CONSTANTS.WHITELISTED_IP,
        connection: { remoteAddress: TEST_CONSTANTS.WHITELISTED_IP } as any,
        socket: { ...createMockSecurityRequest().socket, remoteAddress: TEST_CONSTANTS.WHITELISTED_IP } as any,
      });

      const result = await service.checkRateLimit({
        request: whitelistedRequest,
        isAuthenticated: false,
      });

      expect(result).toBeDefined();
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('should check rate limit with circuit breaker protection', async () => {
      mockConnectionPool.execute.mockImplementation((operation, fallback) => {
        // Simulate successful Redis operation
        return Promise.resolve({
          allowed: true,
          remaining: 99,
          resetTime: Date.now() + 900000,
          totalHits: 1,
        });
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(mockConnectionPool.execute).toHaveBeenCalled();
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should handle Redis unavailability with graceful degradation', async () => {
      mockConnectionPool.execute.mockRejectedValue(new Error('Redis connection failed'));

      mockConnectionPool.getPoolHealth.mockReturnValue({
        totalConnections: 3,
        healthyConnections: 0,
        circuitBreakerState: CircuitBreakerState.OPEN,
        connections: [],
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toContain('Service degraded: Redis connection failed');
    });

    it('should use fallback when circuit breaker is open', async () => {
      mockConnectionPool.execute.mockImplementation((operation, fallback) => {
        if (fallback) {
          return Promise.resolve(fallback());
        }
        return Promise.reject(new Error('Circuit breaker open'));
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
    });

    it('should handle sliding window rate limiting', async () => {
      mockConnectionPool.execute.mockImplementation(() => {
        return Promise.resolve({
          allowed: false,
          remaining: 0,
          resetTime: Date.now() + 300000,
          totalHits: 100,
        });
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        windowType: 'sliding',
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.windowType).toBe('sliding');
    });

    it('should handle fixed window rate limiting', async () => {
      mockConnectionPool.execute.mockImplementation(() => {
        return Promise.resolve({
          allowed: false,
          remaining: 0,
          resetTime: Date.now() + 300000,
          totalHits: 100,
        });
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        windowType: 'fixed',
      });

      expect(result.allowed).toBe(false);
      expect(result.windowType).toBe('fixed');
    });

    it('should handle burst limit checking', async () => {
      // Mock burst check to return exceeded
      let callCount = 0;
      mockConnectionPool.execute.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: burst check
          return Promise.resolve({ exceeded: true, count: 25 });
        } else {
          // Subsequent calls: main rate limit check
          return Promise.resolve({
            allowed: true,
            remaining: 50,
            resetTime: Date.now() + 300000,
            totalHits: 50,
          });
        }
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: true,
      });

      expect(result.allowed).toBe(false);
      expect(result.burstExceeded).toBe(true);
      expect(result.totalHits).toBe(25);
    });
  });

  describe('Adaptive Rate Limiting', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should apply adaptive limiting under high system load', async () => {
      // Configure mocks for high system load (above thresholds)
      const os = require('os');
      os.loadavg.mockReturnValue([8.0, 7.0, 6.0]);  // 200% CPU load (above 80% threshold)
      os.cpus.mockReturnValue(new Array(4));         // 4 cores
      os.totalmem.mockReturnValue(8589934592);       // 8GB total
      os.freemem.mockReturnValue(429496729);         // ~0.4GB free = 95% used (above 85% threshold)

      mockConnectionPool.execute.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 300000,
        totalHits: 50, // Reduced from 100 due to adaptive limiting
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBeDefined();
      expect(result.adaptiveLimit).toBeLessThan(TEST_CONSTANTS.ANONYMOUS_LIMIT);
    });

    it('should not apply adaptive limiting under normal system load', async () => {
      // Configure mocks for normal system load (below thresholds)
      const os = require('os');
      os.loadavg.mockReturnValue([2.0, 1.8, 1.5]);  // 50% CPU load (below 80% threshold)
      os.cpus.mockReturnValue(new Array(4));         // 4 cores  
      os.totalmem.mockReturnValue(8589934592);       // 8GB total
      os.freemem.mockReturnValue(3435973836);        // ~3.2GB free = 60% used (below 85% threshold)

      mockConnectionPool.execute.mockResolvedValue({
        allowed: true,
        remaining: 50,
        resetTime: Date.now() + 300000,
        totalHits: 50,
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      // Under normal load, adaptive limit should not be applied
      expect(result.adaptiveLimit).toBeUndefined();
    });
  });

  describe('Health Monitoring', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should return Redis health status', () => {
      mockConnectionPool.isHealthy.mockReturnValue(true);
      mockConnectionPool.getPoolHealth.mockReturnValue({
        totalConnections: 3,
        healthyConnections: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
        connections: [],
      });

      const health = service.getRedisHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.circuitBreakerState).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return service health status', () => {
      mockConnectionPool.isHealthy.mockReturnValue(true);
      mockConnectionPool.getPoolHealth.mockReturnValue({
        totalConnections: 3,
        healthyConnections: 3,
        circuitBreakerState: CircuitBreakerState.CLOSED,
        connections: [],
      });

      const health = service.getServiceHealth();

      expect(health.isHealthy).toBe(true);
      expect(health.enabled).toBe(true);
      expect(health.initialized).toBe(true);
    });

    it('should indicate unhealthy when Redis is down', () => {
      mockConnectionPool.isHealthy.mockReturnValue(false);
      mockConnectionPool.getPoolHealth.mockReturnValue({
        totalConnections: 3,
        healthyConnections: 0,
        circuitBreakerState: CircuitBreakerState.OPEN,
        connections: [],
      });

      const health = service.getRedisHealth();

      expect(health.isHealthy).toBe(false);
      expect(health.circuitBreakerState).toBe(CircuitBreakerState.OPEN);
    });
  });

  describe('Rate Limit Status', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should get rate limit status with circuit breaker protection', async () => {
      mockConnectionPool.execute.mockResolvedValue({
        current: 10,
        limit: 100,
        remaining: 90,
        resetTime: Date.now() + 300000,
        isAdaptive: false,
      });

      const status = await service.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status.current).toBe(10);
      expect(status.remaining).toBe(90);
      expect(mockConnectionPool.execute).toHaveBeenCalled();
    });

    it('should return default status when Redis is unavailable', async () => {
      mockConnectionPool.execute.mockImplementation((operation, fallback) => {
        if (fallback) {
          return Promise.resolve(fallback());
        }
        return Promise.reject(new Error('Redis unavailable'));
      });

      const status = await service.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status.current).toBe(0);
      expect(status.remaining).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('Key Generation', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should generate user-based key for authenticated requests', () => {
      const authenticatedRequest = createMockSecurityRequest({
        user: { id: TEST_CONSTANTS.USER_ID, role: 'user' },
      });

      const key = service.createRateLimitKey({
        request: authenticatedRequest,
        isAuthenticated: true,
      });

      expect(key).toContain(`user:${TEST_CONSTANTS.USER_ID}`);
      expect(key).toContain(TEST_CONSTANTS.METHOD);
    });

    it('should generate IP-based key for anonymous requests', () => {
      const key = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(key).toContain(`ip:${TEST_CONSTANTS.IP_ADDRESS}`);
      expect(key).toContain(TEST_CONSTANTS.METHOD);
    });

    it('should include user agent hash in anonymous keys', () => {
      const key = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(key).toMatch(/ip:.*:.*:GET:/); // Should have user agent hash
    });
  });

  describe('Whitelist Checking', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should whitelist by IP address', () => {
      const whitelistedRequest = createMockSecurityRequest({
        ip: TEST_CONSTANTS.WHITELISTED_IP,
        connection: { remoteAddress: TEST_CONSTANTS.WHITELISTED_IP } as any,
        socket: { ...createMockSecurityRequest().socket, remoteAddress: TEST_CONSTANTS.WHITELISTED_IP } as any,
      });

      const isWhitelisted = service.isWhitelisted(whitelistedRequest);
      expect(isWhitelisted).toBe(true);
    });

    it('should whitelist by path', () => {
      const healthRequest = createMockSecurityRequest({
        path: TEST_CONSTANTS.HEALTH_PATH,
      });

      const isWhitelisted = service.isWhitelisted(healthRequest);
      expect(isWhitelisted).toBe(true);
    });

    it('should not whitelist regular requests', () => {
      const isWhitelisted = service.isWhitelisted(mockRequest);
      expect(isWhitelisted).toBe(false);
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockConnectionPool.initialize.mockResolvedValue(undefined);
      await service.onModuleInit();
    });

    it('should handle system load detection errors', async () => {
      // Configure mocks to throw error during system load detection
      const os = require('os');
      os.loadavg.mockImplementation(() => {
        throw new Error('System load unavailable');
      });

      mockConnectionPool.execute.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 300000,
        totalHits: 1,
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      // Should still work with fallback system load values
      expect(result.allowed).toBe(true);
    });

    it('should handle Redis validation errors gracefully', async () => {
      mockConnectionPool.execute.mockRejectedValue(new Error('Invalid Redis response format'));

      mockConnectionPool.getPoolHealth.mockReturnValue({
        totalConnections: 3,
        healthyConnections: 0,
        circuitBreakerState: CircuitBreakerState.OPEN,
        connections: [],
      });

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toContain('Service degraded: Invalid Redis response format');
    });
  });
});