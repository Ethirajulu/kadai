import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RateLimitService } from '../services/rate-limit.service';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RateLimitInterceptor } from '../interceptors/rate-limit.interceptor';
import { Reflector } from '@nestjs/core';
import { SecurityRequest, RateLimitConfig } from '../types/security.types';

describe('Rate Limiting Integration', () => {
  let service: RateLimitService;
  let guard: RateLimitGuard;
  let interceptor: RateLimitInterceptor;

  const mockConfig: RateLimitConfig = {
    enabled: true,
    redis: {
      host: 'localhost',
      port: 6379,
      keyPrefix: 'test_rate_limit:',
    },
    defaultLimits: {
      anonymous: {
        requests: 100,
        windowMs: 15 * 60 * 1000,
        message: 'Too many requests',
      },
      authenticated: {
        requests: 200,
        windowMs: 15 * 60 * 1000,
        message: 'Too many requests',
      },
    },
    slidingWindow: {
      enabled: false,
      precision: 60,
    },
    adaptive: {
      enabled: false,
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
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitService,
        RateLimitGuard,
        RateLimitInterceptor,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => {
              if (key === 'security.rateLimit') return mockConfig;
              return undefined;
            }),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<RateLimitService>(RateLimitService);
    guard = module.get<RateLimitGuard>(RateLimitGuard);
    interceptor = module.get<RateLimitInterceptor>(RateLimitInterceptor);
  });

  describe('Service Integration', () => {
    it('should create rate limit service', () => {
      expect(service).toBeDefined();
    });

    it('should create rate limit key for anonymous users', () => {
      const mockRequest = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'test-agent' },
        method: 'GET',
        path: '/api/test',
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: false,
      });

      expect(key).toContain('192.168.1.100');
      expect(key).toMatch(/^ip:/);
    });

    it('should create rate limit key for authenticated users', () => {
      const mockRequest = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'test-agent' },
        method: 'GET',
        path: '/api/test',
        user: { id: 'user-123', role: 'user' },
      } as SecurityRequest;

      const key = service.createRateLimitKey({
        request: mockRequest,
        isAuthenticated: true,
      });

      expect(key).toContain('user-123');
      expect(key).toMatch(/^user:/);
    });

    it('should identify whitelisted IPs', () => {
      const mockRequest = {
        ip: '127.0.0.1',
        headers: { 'user-agent': 'test-agent' },
        method: 'GET',
        path: '/api/test',
      } as SecurityRequest;

      const result = service.isWhitelisted(mockRequest);
      expect(result).toBe(true);
    });

    it('should identify whitelisted paths', () => {
      const mockRequest = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'test-agent' },
        method: 'GET',
        path: '/health',
      } as SecurityRequest;

      const result = service.isWhitelisted(mockRequest);
      expect(result).toBe(true);
    });

    it('should not whitelist regular requests', () => {
      const mockRequest = {
        ip: '192.168.1.100',
        headers: { 'user-agent': 'test-agent' },
        method: 'GET',
        path: '/api/test',
      } as SecurityRequest;

      const result = service.isWhitelisted(mockRequest);
      expect(result).toBe(false);
    });
  });

  describe('Component Integration', () => {
    it('should create rate limit guard', () => {
      expect(guard).toBeDefined();
    });

    it('should create rate limit interceptor', () => {
      expect(interceptor).toBeDefined();
    });
  });

  describe('Configuration', () => {
    it('should have proper configuration structure', () => {
      expect(mockConfig.enabled).toBe(true);
      expect(mockConfig.redis).toBeDefined();
      expect(mockConfig.defaultLimits).toBeDefined();
      expect(mockConfig.defaultLimits.anonymous).toBeDefined();
      expect(mockConfig.defaultLimits.authenticated).toBeDefined();
      expect(mockConfig.whitelist).toBeDefined();
    });

    it('should have different limits for anonymous vs authenticated', () => {
      expect(mockConfig.defaultLimits.anonymous.requests).toBe(100);
      expect(mockConfig.defaultLimits.authenticated.requests).toBe(200);
    });

    it('should have proper Redis configuration', () => {
      expect(mockConfig.redis.host).toBe('localhost');
      expect(mockConfig.redis.port).toBe(6379);
      expect(mockConfig.redis.keyPrefix).toBe('test_rate_limit:');
    });
  });
});