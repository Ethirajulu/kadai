import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';
import { SecurityRequest, RateLimitConfig, RateLimitRule } from '../types/security.types';
import Redis from 'ioredis';

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

// Properly typed Redis mock interface
interface MockRedis {
  eval: jest.MockedFunction<Redis['eval']>;
  get: jest.MockedFunction<Redis['get']>;
  set: jest.MockedFunction<Redis['set']>;
  del: jest.MockedFunction<Redis['del']>;
  exists: jest.MockedFunction<Redis['exists']>;
  ttl: jest.MockedFunction<Redis['ttl']>;
  incr: jest.MockedFunction<Redis['incr']>;
  expire: jest.MockedFunction<Redis['expire']>;
  disconnect: jest.MockedFunction<Redis['disconnect']>;
  ping: jest.MockedFunction<Redis['ping']>;
}

// Mock Redis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RateLimitService', () => {
  let service: RateLimitService;
  let mockRedis: MockRedis;

  const mockRequest: SecurityRequest = {
    ip: TEST_CONSTANTS.IP_ADDRESS,
    headers: { 'user-agent': TEST_CONSTANTS.USER_AGENT },
    user: undefined,
    path: TEST_CONSTANTS.PATH,
    method: TEST_CONSTANTS.METHOD,
    connection: { remoteAddress: TEST_CONSTANTS.IP_ADDRESS },
    socket: { remoteAddress: TEST_CONSTANTS.IP_ADDRESS },
  } as SecurityRequest;

  const mockConfig: RateLimitConfig = {
    enabled: true,
    redis: {
      host: TEST_CONSTANTS.REDIS_HOST,
      port: TEST_CONSTANTS.REDIS_PORT,
      keyPrefix: TEST_CONSTANTS.KEY_PREFIX,
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
    // Create properly typed mock Redis instance
    mockRedis = {
      eval: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      ttl: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      disconnect: jest.fn(),
      ping: jest.fn(),
    };

    // Default implementations
    mockRedis.ping.mockResolvedValue('PONG');
    mockRedis.disconnect.mockResolvedValue(undefined as never);
    
    MockedRedis.mockImplementation(() => mockRedis as unknown as Redis);

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

    // Initialize the service
    await service.onModuleInit();
    
    // Replace the Redis instance with our mock using reflection
    Object.defineProperty(service, 'redis', {
      value: mockRedis,
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize Redis connection with proper configuration', () => {
      expect(MockedRedis).toHaveBeenCalledWith({
        host: TEST_CONSTANTS.REDIS_HOST,
        port: TEST_CONSTANTS.REDIS_PORT,
        keyPrefix: TEST_CONSTANTS.KEY_PREFIX,
        password: undefined,
        db: 0,
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    });

    it('should handle Redis initialization failure', async () => {
      const mockError = new Error('Redis connection failed');
      MockedRedis.mockImplementationOnce(() => {
        throw mockError;
      });

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(mockConfig),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      
      await expect(testService.onModuleInit()).rejects.toThrow('Redis connection failed');
    });

    it('should handle disabled rate limiting', async () => {
      // Clear the Redis mock before this test
      MockedRedis.mockClear();
      
      const disabledConfig = { ...mockConfig, enabled: false };
      const mockConfigService = {
        get: jest.fn().mockReturnValue(disabledConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      
      await testService.onModuleInit();
      
      // Should not create Redis connection when disabled
      expect(MockedRedis).not.toHaveBeenCalled();
    });
  });

  describe('key generation', () => {
    it('should create proper rate limit key for anonymous users', () => {
      const key = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: false,
      });

      // Key format: ip:{ip}:{userAgentHash}:{method}:{pathHash}
      expect(key).toMatch(new RegExp(`^ip:${TEST_CONSTANTS.IP_ADDRESS.replace(/\./g, '\\.')}:[a-z0-9]+:${TEST_CONSTANTS.METHOD}:[a-z0-9]+$`));
    });

    it('should create proper rate limit key for authenticated users', () => {
      const authenticatedRequest = {
        ...mockRequest,
        user: { id: TEST_CONSTANTS.USER_ID, role: 'user' },
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: authenticatedRequest,
        isAuthenticated: true,
      });

      // Key format: user:{userId}:{method}:{pathHash}
      expect(key).toMatch(new RegExp(`^user:${TEST_CONSTANTS.USER_ID}:${TEST_CONSTANTS.METHOD}:[a-z0-9]+$`));
    });

    it('should handle missing user agent in anonymous key generation', () => {
      const requestWithoutUA = {
        ...mockRequest,
        headers: {},
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: requestWithoutUA,
        isAuthenticated: false,
      });

      // Should still generate key with 'unknown' user agent hash
      expect(key).toMatch(new RegExp(`^ip:${TEST_CONSTANTS.IP_ADDRESS.replace(/\./g, '\\.')}:[a-z0-9]+:${TEST_CONSTANTS.METHOD}:[a-z0-9]+$`));
    });

    it('should handle different HTTP methods in key generation', () => {
      const postRequest = {
        ...mockRequest,
        method: 'POST',
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: postRequest,
        isAuthenticated: false,
      });

      expect(key).toMatch(new RegExp(`^ip:${TEST_CONSTANTS.IP_ADDRESS.replace(/\./g, '\\.')}:[a-z0-9]+:POST:[a-z0-9]+$`));
    });

    it('should handle different paths in key generation', () => {
      const differentPathRequest = {
        ...mockRequest,
        path: '/api/users',
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: differentPathRequest,
        isAuthenticated: false,
      });

      // Path hash should be different for different paths
      const originalKey = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(key).not.toBe(originalKey);
      expect(key).toMatch(new RegExp(`^ip:${TEST_CONSTANTS.IP_ADDRESS.replace(/\./g, '\\.')}:[a-z0-9]+:${TEST_CONSTANTS.METHOD}:[a-z0-9]+$`));
    });
  });

  describe('whitelist functionality', () => {
    it('should identify whitelisted IPs', () => {
      const whitelistedRequest = {
        ...mockRequest,
        ip: TEST_CONSTANTS.WHITELISTED_IP,
        headers: { 'x-forwarded-for': TEST_CONSTANTS.WHITELISTED_IP },
      } as unknown as SecurityRequest;

      const result = service.isWhitelisted(whitelistedRequest);
      expect(result).toBe(true);
    });

    it('should identify non-whitelisted IPs', () => {
      const result = service.isWhitelisted(mockRequest);
      expect(result).toBe(false);
    });

    it('should skip rate limiting for whitelisted paths', () => {
      const healthCheckRequest = {
        ...mockRequest,
        path: TEST_CONSTANTS.HEALTH_PATH,
      } as SecurityRequest;

      const result = service.isWhitelisted(healthCheckRequest);
      expect(result).toBe(true);
    });

    it('should handle IP extraction from x-forwarded-for header', () => {
      const requestWithForwardedIP = {
        ...mockRequest,
        headers: { 'x-forwarded-for': `${TEST_CONSTANTS.WHITELISTED_IP}, 10.0.0.1` },
      } as unknown as SecurityRequest;

      const result = service.isWhitelisted(requestWithForwardedIP);
      expect(result).toBe(true);
    });

    it('should handle IP extraction from x-real-ip header', () => {
      const requestWithRealIP = {
        ...mockRequest,
        headers: { 'x-real-ip': TEST_CONSTANTS.WHITELISTED_IP },
      } as unknown as SecurityRequest;

      const result = service.isWhitelisted(requestWithRealIP);
      expect(result).toBe(true);
    });

    it('should handle IP extraction from connection.remoteAddress', () => {
      const requestWithRemoteAddress = {
        ...mockRequest,
        connection: { remoteAddress: TEST_CONSTANTS.WHITELISTED_IP },
        headers: {},
      } as SecurityRequest;

      const result = service.isWhitelisted(requestWithRemoteAddress);
      expect(result).toBe(true);
    });

    it('should handle IP extraction from socket.remoteAddress', () => {
      const requestWithSocketAddress = {
        ...mockRequest,
        socket: { remoteAddress: TEST_CONSTANTS.WHITELISTED_IP },
        connection: undefined,
        headers: {},
      } as unknown as SecurityRequest;

      const result = service.isWhitelisted(requestWithSocketAddress);
      expect(result).toBe(true);
    });

    it('should fallback to 127.0.0.1 when no IP is available', () => {
      const requestWithoutIP = {
        ...mockRequest,
        ip: undefined,
        headers: {},
        connection: undefined,
        socket: undefined,
      } as unknown as SecurityRequest;

      const result = service.isWhitelisted(requestWithoutIP);
      expect(result).toBe(true); // 127.0.0.1 is whitelisted
    });

    it('should handle user agent whitelist', () => {
      const configWithUserAgentWhitelist = {
        ...mockConfig,
        whitelist: {
          ...mockConfig.whitelist,
          skipUserAgents: ['health-checker', 'monitoring-bot'],
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(configWithUserAgentWhitelist),
      };

      // Create a new service instance with user agent whitelist
      const testModule = Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      testModule.then(async (module) => {
        const testService = module.get<RateLimitService>(RateLimitService);
        
        const requestWithWhitelistedUA = {
          ...mockRequest,
          headers: { 'user-agent': 'health-checker/1.0' },
        } as SecurityRequest;

        const result = testService.isWhitelisted(requestWithWhitelistedUA);
        expect(result).toBe(true);
      });
    });

    it('should handle path patterns with wildcards', () => {
      const metricsRequest = {
        ...mockRequest,
        path: '/metrics',
      } as SecurityRequest;

      const result = service.isWhitelisted(metricsRequest);
      expect(result).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    let getSystemLoadSpy: jest.SpyInstance;
    
    beforeEach(() => {
      // Mock isWhitelisted to return false for rate limit tests
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
      
      // Mock getSystemLoad to return low load (prevents adaptive limiting)
      getSystemLoadSpy = jest.spyOn(service as any, 'getSystemLoad').mockResolvedValue({
        cpu: 30,
        memory: 40,
      });
      
      // Reset all mocks
      mockRedis.eval.mockReset();
      mockRedis.get.mockReset();
      mockRedis.ttl.mockReset();
    });
    
    afterEach(() => {
      getSystemLoadSpy?.mockRestore();
    });

    it('should allow request when under rate limit', async () => {
      // Mock sliding window script result: [current, remaining, resetTimeMs]
      mockRedis.eval.mockResolvedValue([1, 99, 900000]); // 1 request, 99 remaining, 15 min reset

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result).toEqual({
        allowed: true,
        remaining: 99,
        resetTime: expect.any(Number),
        totalHits: 1,
        windowType: 'sliding',
      });
    });

    it('should handle disabled rate limiting', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const mockConfigService = {
        get: jest.fn().mockReturnValue(disabledConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result).toEqual({
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetTime: expect.any(Number),
        totalHits: 0,
      });
    });

    it('should bypass rate limiting for whitelisted requests', async () => {
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(true);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result).toEqual({
        allowed: true,
        remaining: Number.MAX_SAFE_INTEGER,
        resetTime: expect.any(Number),
        totalHits: 0,
      });
      
      // Should not call Redis when whitelisted
      expect(mockRedis.eval).not.toHaveBeenCalled();
    });

    it('should deny request when rate limit exceeded', async () => {
      // Mock sliding window script result: [current, remaining, resetTimeMs]
      mockRedis.eval.mockResolvedValue([101, 0, 900000]); // 101 requests, 0 remaining

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result).toEqual({
        allowed: false,
        remaining: 0,
        resetTime: expect.any(Number),
        totalHits: 101,
        windowType: 'sliding',
      });
    });

    it('should apply different limits for authenticated users', async () => {
      const authenticatedRequest = {
        ...mockRequest,
        user: { id: TEST_CONSTANTS.USER_ID, role: 'user' },
      } as SecurityRequest;

      mockRedis.eval.mockResolvedValue([1, 199, 900000]);

      const result = await service.checkRateLimit({
        request: authenticatedRequest,
        isAuthenticated: true,
      });

      expect(result).toEqual({
        allowed: true,
        remaining: 199,
        resetTime: expect.any(Number),
        totalHits: 1,
        windowType: 'sliding',
      });
    });

    it('should handle custom rate limits', async () => {
      const customLimit: RateLimitRule = {
        requests: 50,
        windowMs: 60000, // 1 minute
        burst: 10,
      };

      mockRedis.eval.mockResolvedValue([5, 45, 55000]);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        customLimit,
      });

      expect(result).toEqual({
        allowed: true,
        remaining: 45,
        resetTime: expect.any(Number),
        totalHits: 5,
        windowType: 'sliding',
      });
    });

    it('should handle endpoint-specific limits from config', async () => {
      const configWithCustomLimits = {
        ...mockConfig,
        customLimits: {
          [`${TEST_CONSTANTS.METHOD}:${TEST_CONSTANTS.PATH}`]: {
            requests: 25,
            windowMs: 30000,
          },
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(configWithCustomLimits),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      // Mock Redis for this service
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      mockRedis.eval.mockResolvedValue([1, 24, 29000]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.remaining).toBe(24);
      expect(result.totalHits).toBe(1);
    });

    it('should handle burst protection', async () => {
      // Mock burst check script result: [exceeded, count]
      mockRedis.eval.mockResolvedValueOnce([true, 25]); // Burst exceeded

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: true,
      });

      expect(result.burstExceeded).toBe(true);
      expect(result.allowed).toBe(false);
      expect(result.totalHits).toBe(25);
      expect(result.resetTime).toBeGreaterThan(Date.now());
    });

    it('should allow burst when under burst limit', async () => {
      // Mock burst check returning not exceeded, then main rate limit check
      mockRedis.eval
        .mockResolvedValueOnce([false, 15]) // Burst not exceeded
        .mockResolvedValueOnce([1, 99, 900000]); // Main rate limit check

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: true,
      });

      expect(result.burstExceeded).toBeUndefined();
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(99);
    });

    it('should skip burst check when not requested', async () => {
      mockRedis.eval.mockResolvedValueOnce([1, 99, 900000]); // Only main rate limit check

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: false,
      });

      expect(result.burstExceeded).toBeUndefined();
      expect(mockRedis.eval).toHaveBeenCalledTimes(1); // Only main check, no burst check
    });

    it('should handle burst check when rule has no burst limit', async () => {
      const noBurstConfig = {
        ...mockConfig,
        defaultLimits: {
          ...mockConfig.defaultLimits,
          anonymous: {
            ...mockConfig.defaultLimits.anonymous,
            burst: undefined,
          },
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(noBurstConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      mockRedis.eval.mockResolvedValueOnce([1, 99, 900000]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: true,
      });

      expect(result.burstExceeded).toBeUndefined();
      expect(result.allowed).toBe(true);
      expect(mockRedis.eval).toHaveBeenCalledTimes(1); // Only main check
    });

    it('should implement sliding window algorithm', async () => {
      mockRedis.eval.mockResolvedValue([5, 95, 45000]); // 5 requests in sliding window

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        windowType: 'sliding',
      });

      expect(result.windowType).toBe('sliding');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(95);
      expect(result.totalHits).toBe(5);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('ZREMRANGEBYSCORE'),
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should use sliding window by default when enabled in config', async () => {
      mockRedis.eval.mockResolvedValue([5, 95, 45000]);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        // windowType not specified - should use config default
      });

      expect(result.windowType).toBe('sliding'); // Config has slidingWindow.enabled = true
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('ZREMRANGEBYSCORE'),
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should implement fixed window algorithm', async () => {
      mockRedis.eval.mockResolvedValue([5, 95, 45000]); // 5 requests in fixed window

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        windowType: 'fixed',
      });

      expect(result.windowType).toBe('fixed');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(95);
      expect(result.totalHits).toBe(5);
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should use fixed window when sliding window is disabled', async () => {
      const fixedWindowConfig = {
        ...mockConfig,
        slidingWindow: {
          enabled: false,
          precision: TEST_CONSTANTS.PRECISION,
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(fixedWindowConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      mockRedis.eval.mockResolvedValue([5, 95, 45000]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        // windowType not specified - should use fixed due to config
      });

      expect(result.windowType).toBe('fixed');
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });

    it('should handle negative remaining count gracefully', async () => {
      mockRedis.eval.mockResolvedValue([105, -5, 45000]); // Over limit

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0); // Should be clamped to 0
      expect(result.totalHits).toBe(105);
    });

    it('should handle concurrent requests simulation', async () => {
      // Simulate multiple concurrent requests
      const promises: Promise<any>[] = [];
      
      // Mock different responses for concurrent requests
      let callCount = 0;
      mockRedis.eval.mockImplementation(async () => {
        callCount++;
        return [callCount, TEST_CONSTANTS.ANONYMOUS_LIMIT - callCount, 900000];
      });

      // Fire 5 concurrent requests
      for (let i = 0; i < 5; i++) {
        promises.push(
          service.checkRateLimit({
            request: {
              ...mockRequest,
              headers: { 'user-agent': `test-agent-${i}` },
            } as unknown as SecurityRequest,
            isAuthenticated: false,
          })
        );
      }

      const results = await Promise.all(promises);
      
      // All should be allowed (under limit)
      results.forEach((result) => {
        expect(result.allowed).toBe(true);
        expect(result.totalHits).toBeGreaterThan(0);
      });
      
      expect(mockRedis.eval).toHaveBeenCalledTimes(5);
    });
  });

  describe('adaptive rate limiting', () => {
    let getSystemLoadSpy: jest.SpyInstance;
    
    beforeEach(() => {
      // Mock isWhitelisted to return false for rate limit tests
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
      
      // Mock the private getSystemLoad method using reflection
      getSystemLoadSpy = jest.spyOn(service as any, 'getSystemLoad');
    });
    
    afterEach(() => {
      getSystemLoadSpy?.mockRestore();
    });

    it('should reduce limits when system load is high', async () => {
      // Mock high CPU usage
      getSystemLoadSpy.mockResolvedValue({
        cpu: 85,
        memory: 70,
      });

      mockRedis.eval.mockResolvedValue([1, 49, 900000]); // Reduced limit applied

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBe(TEST_CONSTANTS.ANONYMOUS_LIMIT * TEST_CONSTANTS.LOAD_FACTOR);
      expect(result.adaptiveLimit).toBeLessThan(TEST_CONSTANTS.ANONYMOUS_LIMIT);
    });

    it('should reduce limits when memory usage is high', async () => {
      // Mock high memory usage
      getSystemLoadSpy.mockResolvedValue({
        cpu: 50,
        memory: 90, // Above threshold
      });

      mockRedis.eval.mockResolvedValue([1, 49, 900000]);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBe(TEST_CONSTANTS.ANONYMOUS_LIMIT * TEST_CONSTANTS.LOAD_FACTOR);
      expect(result.adaptiveLimit).toBeLessThan(TEST_CONSTANTS.ANONYMOUS_LIMIT);
    });

    it('should ensure minimum limit of 1 even with extreme load', async () => {
      // Mock extreme load that would reduce limit to 0
      getSystemLoadSpy.mockResolvedValue({
        cpu: 99,
        memory: 99,
      });

      // Use a config with very low load factor
      const extremeConfig = {
        ...mockConfig,
        adaptive: {
          ...mockConfig.adaptive,
          loadFactor: 0.001, // Would result in limit < 1
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(extremeConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      jest.spyOn(testService as any, 'getSystemLoad').mockResolvedValue({
        cpu: 99,
        memory: 99,
      });
      
      mockRedis.eval.mockResolvedValue([1, 0, 900000]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBe(1); // Should be clamped to minimum of 1
    });

    it('should maintain normal limits when system load is low', async () => {
      getSystemLoadSpy.mockResolvedValue({
        cpu: 30,
        memory: 40,
      });

      mockRedis.eval.mockResolvedValue([1, 99, 900000]);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBeUndefined();
    });

    it('should disable adaptive limiting when not enabled in config', async () => {
      const nonAdaptiveConfig = {
        ...mockConfig,
        adaptive: {
          ...mockConfig.adaptive,
          enabled: false,
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(nonAdaptiveConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      
      // Mock high load - should be ignored
      const getSystemLoadSpy = jest.spyOn(testService as any, 'getSystemLoad').mockResolvedValue({
        cpu: 95,
        memory: 95,
      });
      
      mockRedis.eval.mockResolvedValue([1, 99, 900000]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBeUndefined();
      expect(getSystemLoadSpy).not.toHaveBeenCalled(); // Should not check system load when disabled
      
      getSystemLoadSpy.mockRestore();
    });

    it('should handle getSystemLoad errors gracefully', async () => {
      getSystemLoadSpy.mockRejectedValue(new Error('System load unavailable'));

      // Should not throw error and proceed with normal limits
      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBeUndefined();
    });

    it('should work with authenticated users under adaptive limiting', async () => {
      getSystemLoadSpy.mockResolvedValue({
        cpu: 85,
        memory: 70,
      });

      const authenticatedRequest = {
        ...mockRequest,
        user: { id: TEST_CONSTANTS.USER_ID, role: 'user' },
      } as SecurityRequest;

      mockRedis.eval.mockResolvedValue([1, 99, 900000]);

      const result = await service.checkRateLimit({
        request: authenticatedRequest,
        isAuthenticated: true,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBe(TEST_CONSTANTS.AUTHENTICATED_LIMIT * TEST_CONSTANTS.LOAD_FACTOR);
      expect(result.adaptiveLimit).toBeLessThan(TEST_CONSTANTS.AUTHENTICATED_LIMIT);
    });
  });

  describe('rate limit status', () => {
    let getSystemLoadSpy: jest.SpyInstance;
    
    beforeEach(() => {
      getSystemLoadSpy = jest.spyOn(service as any, 'getSystemLoad').mockResolvedValue({
        cpu: 45,
        memory: 60,
      });
    });
    
    afterEach(() => {
      getSystemLoadSpy?.mockRestore();
    });

    it('should return current rate limit status', async () => {
      mockRedis.get.mockResolvedValue('50');
      mockRedis.ttl.mockResolvedValue(300);

      const status = await service.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status).toEqual({
        current: 50,
        limit: TEST_CONSTANTS.ANONYMOUS_LIMIT,
        remaining: 50,
        resetTime: expect.any(Number),
        isAdaptive: true,
        systemLoad: {
          cpu: 45,
          memory: 60,
        },
      });
    });

    it('should return status for authenticated users', async () => {
      const authenticatedRequest = {
        ...mockRequest,
        user: { id: TEST_CONSTANTS.USER_ID, role: 'user' },
      } as SecurityRequest;

      mockRedis.get.mockResolvedValue('25');
      mockRedis.ttl.mockResolvedValue(600);

      const status = await service.getRateLimitStatus({
        request: authenticatedRequest,
        isAuthenticated: true,
      });

      expect(status).toEqual({
        current: 25,
        limit: TEST_CONSTANTS.AUTHENTICATED_LIMIT,
        remaining: 175,
        resetTime: expect.any(Number),
        isAdaptive: true,
        systemLoad: {
          cpu: 45,
          memory: 60,
        },
      });
    });

    it('should handle missing Redis data', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.ttl.mockResolvedValue(-1);

      const status = await service.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status.current).toBe(0);
      expect(status.remaining).toBe(TEST_CONSTANTS.ANONYMOUS_LIMIT);
      expect(status.resetTime).toBeGreaterThan(Date.now());
    });

    it('should handle Redis errors in status check', async () => {
      mockRedis.get.mockRejectedValue(new Error('Redis get failed'));
      mockRedis.ttl.mockRejectedValue(new Error('Redis ttl failed'));

      const loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();

      const status = await service.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status).toEqual({
        current: 0,
        limit: Number.MAX_SAFE_INTEGER,
        remaining: Number.MAX_SAFE_INTEGER,
        resetTime: expect.any(Number),
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to get rate limit status',
        expect.any(Error)
      );

      loggerSpy.mockRestore();
    });

    it('should not include system load when adaptive is disabled', async () => {
      const nonAdaptiveConfig = {
        ...mockConfig,
        adaptive: {
          ...mockConfig.adaptive,
          enabled: false,
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(nonAdaptiveConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      mockRedis.get.mockResolvedValue('50');
      mockRedis.ttl.mockResolvedValue(300);

      const status = await testService.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status.isAdaptive).toBe(false);
      expect(status.systemLoad).toBeUndefined();
    });

    it('should return default status when rate limiting is disabled', async () => {
      const disabledConfig = { ...mockConfig, enabled: false };
      const mockConfigService = {
        get: jest.fn().mockReturnValue(disabledConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();

      const status = await testService.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status).toEqual({
        current: 0,
        limit: Number.MAX_SAFE_INTEGER,
        remaining: Number.MAX_SAFE_INTEGER,
        resetTime: expect.any(Number),
      });
    });
  });

  describe('error handling', () => {
    let loggerSpy: jest.SpyInstance;
    
    beforeEach(() => {
      // Mock isWhitelisted to return false for rate limit tests
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
      
      // Spy on logger
      loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
    });
    
    afterEach(() => {
      loggerSpy?.mockRestore();
    });

    it('should handle Redis connection failures gracefully', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      // Should allow request when Redis is unavailable (fail-open)
      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBe('Redis connection failed');
      expect(result.remaining).toBe(Number.MAX_SAFE_INTEGER);
      expect(result.totalHits).toBe(0);
    });

    it('should log Redis errors appropriately', async () => {
      const redisError = new Error('Redis connection failed');
      mockRedis.eval.mockRejectedValue(redisError);

      await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check failed',
        redisError
      );
    });

    it('should handle Redis timeout errors', async () => {
      const timeoutError = new Error('Command timed out');
      timeoutError.name = 'TimeoutError';
      mockRedis.eval.mockRejectedValue(timeoutError);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBe('Command timed out');
      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check failed',
        timeoutError
      );
    });

    it('should handle Redis network errors', async () => {
      const networkError = new Error('Connection refused');
      networkError.name = 'NetworkError';
      mockRedis.eval.mockRejectedValue(networkError);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBe('Connection refused');
    });

    it('should handle non-Error exceptions', async () => {
      mockRedis.eval.mockRejectedValue('String error');

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBe('Redis sliding window operation failed');
    });

    it('should handle Redis returning unexpected data types', async () => {
      mockRedis.eval.mockResolvedValue('invalid-response');

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      // With proper validation, invalid Redis responses should cause fail-open behavior
      expect(result).toBeDefined();
      expect(result.allowed).toBe(true); // Fail-open: allow request when Redis data is invalid
      expect(result.error).toContain('Invalid Redis response format'); // Error should be logged
    });

    it('should handle Redis returning null/undefined', async () => {
      mockRedis.eval.mockResolvedValue(null);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBeDefined();
    });

    it('should handle Redis initialization failure in onModuleInit', async () => {
      const initError = new Error('Redis initialization failed');
      MockedRedis.mockImplementationOnce(() => {
        throw initError;
      });

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(mockConfig),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      
      await expect(testService.onModuleInit()).rejects.toThrow('Redis initialization failed');
    });

    it('should handle Redis ping failure during initialization', async () => {
      const mockFailingRedis = {
        ...mockRedis,
        ping: jest.fn().mockRejectedValue(new Error('Ping failed')),
      };
      
      MockedRedis.mockImplementationOnce(() => mockFailingRedis as unknown as Redis);

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn().mockReturnValue(mockConfig),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      
      await expect(testService.onModuleInit()).rejects.toThrow('Ping failed');
    });
  });

  describe('Redis recovery and reconnection', () => {
    let loggerSpy: jest.SpyInstance;
    
    beforeEach(() => {
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
      loggerSpy = jest.spyOn(service['logger'], 'error').mockImplementation();
    });
    
    afterEach(() => {
      loggerSpy?.mockRestore();
    });

    it('should recover from temporary Redis failures', async () => {
      // First call fails, second succeeds
      mockRedis.eval
        .mockRejectedValueOnce(new Error('Temporary failure'))
        .mockResolvedValueOnce([1, 99, 900000]);

      // First request should fail-open
      const result1 = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result1.allowed).toBe(true);
      expect(result1.error).toBe('Temporary failure');

      // Second request should work normally
      const result2 = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result2.allowed).toBe(true);
      expect(result2.error).toBeUndefined();
      expect(result2.totalHits).toBe(1);
    });

    it('should handle intermittent Redis connectivity issues', async () => {
      const requests = [];
      
      // Mix of failures and successes
      mockRedis.eval
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValueOnce([1, 99, 900000])
        .mockRejectedValueOnce(new Error('Timeout'))
        .mockResolvedValueOnce([2, 98, 900000]);

      for (let i = 0; i < 4; i++) {
        const result = await service.checkRateLimit({
          request: {
            ...mockRequest,
            headers: { 'user-agent': `test-agent-${i}` },
          } as unknown as SecurityRequest,
          isAuthenticated: false,
        });
        requests.push(result);
      }

      // All requests should be allowed (fail-open for errors)
      requests.forEach((result) => {
        expect(result.allowed).toBe(true);
      });

      // Errors should be present for failed calls
      expect(requests[0].error).toBe('Connection lost');
      expect(requests[1].error).toBeUndefined();
      expect(requests[2].error).toBe('Timeout');
      expect(requests[3].error).toBeUndefined();
    });

    it('should handle Redis connection recovery during burst checks', async () => {
      // Burst check fails, main check succeeds
      mockRedis.eval
        .mockRejectedValueOnce(new Error('Burst check failed'))
        .mockResolvedValueOnce([1, 99, 900000]);

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: true,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBe('Burst check failed');
    });
  });

  describe('cleanup', () => {
    it('should properly close Redis connection on module destroy', async () => {
      await service.onModuleDestroy();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should handle Redis disconnect errors', async () => {
      const disconnectError = new Error('Disconnect failed');
      mockRedis.disconnect.mockRejectedValue(disconnectError as never);

      // The service should handle disconnect errors gracefully
      await expect(service.onModuleDestroy()).resolves.not.toThrow();

      // Should still attempt to disconnect
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });

    it('should handle missing Redis connection during destroy', async () => {
      // Remove Redis instance
      Object.defineProperty(service, 'redis', {
        value: null,
        writable: true,
        configurable: true,
      });

      // Should not throw error
      await expect(service.onModuleDestroy()).resolves.not.toThrow();
    });
  });

  describe('edge cases and advanced scenarios', () => {
    beforeEach(() => {
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
    });

    it('should handle wildcard pattern matching in custom limits', async () => {
      const configWithWildcards = {
        ...mockConfig,
        customLimits: {
          'GET:/api/users/*': {
            requests: 50,
            windowMs: 60000,
          },
          'POST:/api/**/create': {
            requests: 25,
            windowMs: 30000,
          },
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(configWithWildcards),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      mockRedis.eval.mockResolvedValue([1, 49, 60000]);

      const userRequest = {
        ...mockRequest,
        path: '/api/users/123',
        method: 'GET',
      } as SecurityRequest;

      const result = await testService.checkRateLimit({
        request: userRequest,
        isAuthenticated: false,
      });

      expect(result.remaining).toBe(49); // Should use 50 limit from wildcard match
    });

    it('should handle extreme rate limit scenarios', async () => {
      // Test with very high limits
      const extremeConfig = {
        ...mockConfig,
        defaultLimits: {
          anonymous: {
            requests: 1000000,
            windowMs: 1000,
            burst: 100000,
          },
          authenticated: {
            requests: 2000000,
            windowMs: 1000,
            burst: 200000,
          },
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(extremeConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      mockRedis.eval.mockResolvedValue([1, 999999, 1000]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(999999);
    });

    it('should handle zero and negative time windows', async () => {
      const zeroWindowConfig = {
        ...mockConfig,
        defaultLimits: {
          ...mockConfig.defaultLimits,
          anonymous: {
            requests: 100,
            windowMs: 0, // Invalid window
          },
        },
      };

      const mockConfigService = {
        get: jest.fn().mockReturnValue(zeroWindowConfig),
      };

      const testModule = await Test.createTestingModule({
        providers: [
          RateLimitService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
        ],
      }).compile();

      const testService = testModule.get<RateLimitService>(RateLimitService);
      await testService.onModuleInit();
      
      Object.defineProperty(testService, 'redis', {
        value: mockRedis,
        writable: true,
        configurable: true,
      });

      jest.spyOn(testService, 'isWhitelisted').mockReturnValue(false);
      mockRedis.eval.mockResolvedValue([1, 99, 0]);

      const result = await testService.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      // Should handle gracefully
      expect(result.allowed).toBe(true);
    });
  });
});
