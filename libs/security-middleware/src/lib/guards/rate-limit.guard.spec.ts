import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from '../services/rate-limit.service';
import { SecurityRequest } from '../types/security.types';

describe('RateLimitGuard', () => {
  let guard: RateLimitGuard;
  let rateLimitService: jest.Mocked<RateLimitService>;
  let reflector: jest.Mocked<Reflector>;

  const mockRequest = (overrides: Partial<SecurityRequest> = {}) =>
    ({
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'test-agent',
        authorization: undefined,
        'x-forwarded-for': undefined,
        'x-real-ip': undefined,
      },
      user: undefined,
      path: '/api/test',
      method: 'GET',
      connection: { remoteAddress: '127.0.0.1' },
      socket: { remoteAddress: '127.0.0.1' },
      ...overrides,
    } as SecurityRequest);

  const mockExecutionContext = (request: any) =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          setHeader: jest.fn(),
          getHeader: jest.fn(),
          header: jest.fn(),
        }),
      }),
      getHandler: () => ({ name: 'testHandler' }),
      getClass: () => ({ name: 'TestController' }),
    } as ExecutionContext);

  beforeEach(async () => {
    const mockRateLimitService = {
      checkRateLimit: jest.fn(),
      getRateLimitStatus: jest.fn(),
      createRateLimitKey: jest.fn(),
      isWhitelisted: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.rateLimit.fallback.authenticated') return 100;
        if (key === 'security.rateLimit.fallback.anonymous') return 50;
        return defaultValue;
      }),
    };

    const mockReflector = {
      getAllAndOverride: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitGuard,
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<RateLimitGuard>(RateLimitGuard);
    rateLimitService = module.get(RateLimitService);
    reflector = module.get(Reflector);
  });

  describe('canActivate', () => {
    beforeEach(() => {
      rateLimitService.isWhitelisted.mockReturnValue(false);
      reflector.getAllAndOverride.mockReturnValue(undefined);
    });

    it('should be defined', () => {
      expect(guard).toBeDefined();
    });

    it('should allow request when rate limit is not exceeded', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(rateLimitService.checkRateLimit).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when rate limit is exceeded', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalHits: 101,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
      expect(rateLimitService.checkRateLimit).toHaveBeenCalled();
    });

    it('should apply different limits for authenticated vs anonymous users', async () => {
      const authenticatedRequest = mockRequest({
        user: { id: 'user-123', role: 'user' },
        headers: { authorization: 'Bearer token123' },
      });
      const context = mockExecutionContext(authenticatedRequest);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 199,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          isAuthenticated: true,
        })
      );
    });

    it('should skip rate limiting for whitelisted IPs', async () => {
      const request = mockRequest({ ip: '192.168.1.100' });
      const context = mockExecutionContext(request);

      rateLimitService.isWhitelisted.mockReturnValue(true);

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(rateLimitService.checkRateLimit).not.toHaveBeenCalled();
    });

    it('should handle burst protection', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalHits: 50,
        burstExceeded: true,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            message: expect.stringContaining('burst'),
          }),
        })
      );
    });
  });

  describe('adaptive rate limiting', () => {
    it('should adjust limits based on system load', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      // Mock high system load
      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 49, // Reduced limit due to high load
        resetTime: Date.now() + 60000,
        totalHits: 1,
        adaptiveLimit: 50, // Reduced from normal 100
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  describe('sliding window implementation', () => {
    it('should use sliding window for rate limiting', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 95,
        resetTime: Date.now() + 45000, // 45 seconds until reset
        totalHits: 5,
        windowType: 'sliding',
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
    });
  });

  // NEW TESTS FOR MISSING BRANCHES
  describe('custom rate limit decorators', () => {
    it('should use custom rate limit from decorator', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      const customLimit = { requests: 50, window: 60000 };
      reflector.getAllAndOverride.mockReturnValue(customLimit);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 49,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          customLimit,
        })
      );
    });

    it('should handle undefined custom limit', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      reflector.getAllAndOverride.mockReturnValue(undefined);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(rateLimitService.checkRateLimit).toHaveBeenCalledWith(
        expect.objectContaining({
          customLimit: undefined,
        })
      );
    });
  });

  describe('error handling', () => {
    it('should handle rate limit service errors in production', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      rateLimitService.checkRateLimit.mockRejectedValue(
        new Error('Service unavailable')
      );

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });

    it('should throw error in development when rate limit service fails', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      rateLimitService.checkRateLimit.mockRejectedValue(
        new Error('Service unavailable')
      );

      await expect(guard.canActivate(context)).rejects.toThrow(
        new ForbiddenException('Rate limiting service unavailable')
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should re-throw ForbiddenException errors', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      const forbiddenError = new ForbiddenException('Rate limit exceeded');
      rateLimitService.checkRateLimit.mockRejectedValue(forbiddenError);

      await expect(guard.canActivate(context)).rejects.toThrow(forbiddenError);
    });

    it('should handle non-Error exceptions', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      rateLimitService.checkRateLimit.mockRejectedValue('String error');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('rate limit headers', () => {
    it('should add all rate limit headers when request is allowed', async () => {
      const request = mockRequest();
      const response = { setHeader: jest.fn() };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
        getHandler: () => ({ name: 'testHandler' }),
        getClass: () => ({ name: 'TestController' }),
      } as ExecutionContext;

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 95,
        resetTime: Date.now() + 60000,
        totalHits: 5,
        windowType: 'sliding',
      });

      await guard.canActivate(context);

      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        expect.any(String)
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '95'
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String)
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Window-Type',
        'sliding'
      );
    });

    it('should add retry headers when rate limit is exceeded', async () => {
      const request = mockRequest();
      const response = { setHeader: jest.fn() };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
        getHandler: () => ({ name: 'testHandler' }),
        getClass: () => ({ name: 'TestController' }),
      } as ExecutionContext;

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 30000,
        totalHits: 100,
        burstExceeded: true,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );

      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-RetryAfter',
        expect.any(String)
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Burst-Exceeded',
        'true'
      );
    });

    it('should add adaptive limit headers when available', async () => {
      const request = mockRequest();
      const response = { setHeader: jest.fn() };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
        getHandler: () => ({ name: 'testHandler' }),
        getClass: () => ({ name: 'TestController' }),
      } as ExecutionContext;

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 45,
        resetTime: Date.now() + 60000,
        totalHits: 5,
        adaptiveLimit: 50,
      });

      await guard.canActivate(context);

      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Adaptive-Limit',
        '50'
      );
    });

    it('should handle negative remaining values in headers', async () => {
      const request = mockRequest();
      const response = { setHeader: jest.fn() };
      const context = {
        switchToHttp: () => ({
          getRequest: () => request,
          getResponse: () => response,
        }),
        getHandler: () => ({ name: 'testHandler' }),
        getClass: () => ({ name: 'TestController' }),
      } as ExecutionContext;

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: -5,
        resetTime: Date.now() + 60000,
        totalHits: 105,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );

      expect(response.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '0'
      );
    });
  });

  describe('error message creation', () => {
    it('should create burst exceeded error message', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 30000,
        totalHits: 50,
        burstExceeded: true,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            message: expect.stringContaining('burst'),
          }),
        })
      );
    });

    it('should create adaptive limit error message', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 30000,
        totalHits: 50,
        adaptiveLimit: 40,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            message: expect.stringContaining('system load'),
          }),
        })
      );
    });

    it('should create standard error message', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 30000,
        totalHits: 100,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            message: expect.stringContaining('Rate limit exceeded'),
          }),
        })
      );
    });
  });

  describe('rate limit calculation', () => {
    it('should use adaptive limit when available', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 45,
        resetTime: Date.now() + 60000,
        totalHits: 5,
        adaptiveLimit: 50,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.rateLimitInfo?.limit).toBe(50);
    });

    it('should use custom limit when available and no adaptive limit', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      const customLimit = { requests: 75, window: 60000 };
      reflector.getAllAndOverride.mockReturnValue(customLimit);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 74,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.rateLimitInfo?.limit).toBe(75);
    });

    it('should use authenticated fallback limit for authenticated users', async () => {
      const request = mockRequest({ user: { id: 'user-123', role: 'user' } });
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.rateLimitInfo?.limit).toBe(100); // authenticated fallback
    });

    it('should use anonymous fallback limit for unauthenticated users', async () => {
      const request = mockRequest({ user: undefined });
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 49,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.rateLimitInfo?.limit).toBe(50); // anonymous fallback
    });
  });

  describe('security flags', () => {
    it('should set rateLimited flag when rate limit is exceeded', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalHits: 100,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
      expect(request.securityFlags?.rateLimited).toBe(true);
    });

    it('should set burstExceeded flag when burst is exceeded', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalHits: 50,
        burstExceeded: true,
      });

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
      expect(request.securityFlags?.burstExceeded).toBe(true);
    });

    it('should initialize securityFlags if not present', async () => {
      const request = mockRequest();
      delete (request as any).securityFlags;
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(request.securityFlags).toBeDefined();
      expect(request.securityFlags?.rateLimited).toBe(false);
    });
  });

  describe('logging', () => {
    it('should log debug message for whitelisted requests', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.isWhitelisted.mockReturnValue(true);

      const loggerSpy = jest.spyOn(guard['logger'], 'debug');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limiting skipped for whitelisted request')
      );
    });

    it('should log warning for rate limit exceeded', async () => {
      const request = mockRequest({ user: { id: 'user-123', role: 'user' } });
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: false,
        remaining: 0,
        resetTime: Date.now() + 60000,
        totalHits: 100,
      });

      const loggerSpy = jest.spyOn(guard['logger'], 'warn');

      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit exceeded for authenticated user')
      );
    });

    it('should log debug message for successful rate limit check', async () => {
      const request = mockRequest();
      const context = mockExecutionContext(request);

      rateLimitService.checkRateLimit.mockResolvedValue({
        allowed: true,
        remaining: 99,
        resetTime: Date.now() + 60000,
        totalHits: 1,
      });

      const loggerSpy = jest.spyOn(guard['logger'], 'debug');

      const result = await guard.canActivate(context);
      expect(result).toBe(true);
      expect(loggerSpy).toHaveBeenCalledWith(
        expect.stringContaining('Rate limit check passed')
      );
    });
  });
});
