import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from './rate-limit.service';
import { SecurityRequest, RateLimitConfig } from '../types/security.types';
import Redis from 'ioredis';

// Mock Redis
jest.mock('ioredis');
const MockedRedis = Redis as jest.MockedClass<typeof Redis>;

describe('RateLimitService', () => {
  let service: RateLimitService;
  let configService: jest.Mocked<ConfigService>;
  let mockRedis: jest.Mocked<Redis>;

  const mockRequest: SecurityRequest = {
    ip: '192.168.1.100',
    headers: { 'user-agent': 'test-agent' },
    user: undefined,
    path: '/api/test',
    method: 'GET',
  } as SecurityRequest;

  const mockConfig: RateLimitConfig = {
    enabled: true,
    redis: {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'rate_limit:',
    },
    defaultLimits: {
      anonymous: {
        requests: 100,
        windowMs: 15 * 60 * 1000,
        burst: 20,
      },
      authenticated: {
        requests: 200,
        windowMs: 15 * 60 * 1000,
        burst: 50,
      },
    },
    slidingWindow: {
      enabled: true,
      precision: 60, // 1 minute precision
    },
    adaptive: {
      enabled: true,
      cpuThreshold: 80,
      memoryThreshold: 85,
      loadFactor: 0.5,
    },
    whitelist: {
      ips: ['127.0.0.1', '::1'],
      skipPaths: ['/health', '/metrics'],
    },
    headers: {
      includeHeaders: true,
    },
  };

  beforeEach(async () => {
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
      ping: jest.fn().mockResolvedValue('PONG'),
    } as any;

    MockedRedis.mockImplementation(() => mockRedis);

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
    configService = module.get(ConfigService);

    // Mock the getClientIP method to return the expected IP
    jest.spyOn(service as any, 'getClientIP').mockReturnValue('192.168.1.100');

    // Initialize the service
    await service.onModuleInit();
    // Inject the mockRedis instance so all internal calls use the mock
    (service as any).redis = mockRedis;
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
        host: 'localhost',
        port: 6379,
        keyPrefix: 'rate_limit:',
        password: undefined,
        db: 0,
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });
    });
  });

  describe('key generation', () => {
    it('should create proper rate limit key for anonymous users', () => {
      const key = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: false,
      });

      // Key format: ip:{ip}:{userAgentHash}:{method}:{pathHash}
      expect(key).toMatch(/^ip:192\.168\.1\.100:[a-z0-9]+:GET:[a-z0-9]+$/);
    });

    it('should create proper rate limit key for authenticated users', () => {
      const authenticatedRequest = {
        ...mockRequest,
        user: { id: 'user-123', role: 'user' },
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: authenticatedRequest,
        isAuthenticated: true,
      });

      // Key format: user:{userId}:{method}:{pathHash}
      expect(key).toMatch(/^user:user-123:GET:[a-z0-9]+$/);
    });
  });

  describe('whitelist functionality', () => {
    it('should identify whitelisted IPs', () => {
      const whitelistedRequest = {
        ...mockRequest,
        ip: '127.0.0.1',
      } as SecurityRequest;

      // Mock getClientIP to return whitelisted IP
      jest.spyOn(service as any, 'getClientIP').mockReturnValue('127.0.0.1');

      const result = service.isWhitelisted(whitelistedRequest);
      expect(result).toBe(true);
    });

    it('should identify non-whitelisted IPs', () => {
      // Mock getClientIP to return non-whitelisted IP
      jest
        .spyOn(service as any, 'getClientIP')
        .mockReturnValue('192.168.1.100');

      const result = service.isWhitelisted(mockRequest);
      expect(result).toBe(false);
    });

    it('should skip rate limiting for whitelisted paths', () => {
      const healthCheckRequest = {
        ...mockRequest,
        path: '/health',
      } as SecurityRequest;

      const result = service.isWhitelisted(healthCheckRequest);
      expect(result).toBe(true);
    });
  });

  describe('checkRateLimit', () => {
    beforeEach(() => {
      // Mock isWhitelisted to return false for rate limit tests
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
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
        adaptiveLimit: 50,
      });
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
        adaptiveLimit: 50,
      });
    });

    it('should apply different limits for authenticated users', async () => {
      const authenticatedRequest = {
        ...mockRequest,
        user: { id: 'user-123', role: 'user' },
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
        adaptiveLimit: 100,
      });
    });

    it('should handle burst protection', async () => {
      // Mock burst check script result: [exceeded, count]
      mockRedis.eval
        .mockResolvedValueOnce([true, 25]) // Burst exceeded
        .mockResolvedValueOnce([1, 99, 900000]); // Main rate limit check

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        checkBurst: true,
      });

      expect(result.burstExceeded).toBe(true);
      expect(result.allowed).toBe(false);
    });

    it('should implement sliding window algorithm', async () => {
      mockRedis.eval.mockResolvedValue([5, 95, 45000]); // 5 requests in sliding window

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        windowType: 'sliding',
      });

      expect(result.windowType).toBe('sliding');
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
      expect(mockRedis.eval).toHaveBeenCalledWith(
        expect.stringContaining('INCR'),
        1,
        expect.any(String),
        expect.any(String),
        expect.any(String),
        expect.any(String)
      );
    });
  });

  describe('adaptive rate limiting', () => {
    beforeEach(() => {
      // Mock isWhitelisted to return false for rate limit tests
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
    });

    it('should reduce limits when system load is high', async () => {
      // Mock high CPU usage
      jest.spyOn(service as any, 'getSystemLoad').mockResolvedValue({
        cpu: 85,
        memory: 70,
      });

      mockRedis.eval.mockResolvedValue([1, 49, 900000]); // Reduced limit applied

      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
        adaptive: true,
      });

      expect(result.adaptiveLimit).toBeLessThan(100);
    });

    it('should maintain normal limits when system load is low', async () => {
      jest.spyOn(service as any, 'getSystemLoad').mockResolvedValue({
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
  });

  describe('rate limit status', () => {
    it('should return current rate limit status', async () => {
      mockRedis.get.mockResolvedValue('50');
      mockRedis.ttl.mockResolvedValue(300);

      const status = await service.getRateLimitStatus({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(status).toEqual({
        current: 50,
        limit: 100,
        remaining: 50,
        resetTime: expect.any(Number),
        isAdaptive: true,
        systemLoad: expect.any(Object),
      });
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      // Mock isWhitelisted to return false for rate limit tests
      jest.spyOn(service, 'isWhitelisted').mockReturnValue(false);
    });

    it('should handle Redis connection failures gracefully', async () => {
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      // Should allow request when Redis is unavailable (fail-open)
      const result = await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(result.allowed).toBe(true);
      expect(result.error).toBeDefined();
    });

    it('should log Redis errors appropriately', async () => {
      const loggerSpy = jest
        .spyOn(service['logger'], 'error')
        .mockImplementation();
      mockRedis.eval.mockRejectedValue(new Error('Redis connection failed'));

      await service.checkRateLimit({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check failed',
        expect.any(Error)
      );

      loggerSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('should properly close Redis connection on module destroy', async () => {
      await service.onModuleDestroy();
      expect(mockRedis.disconnect).toHaveBeenCalled();
    });
  });
});
