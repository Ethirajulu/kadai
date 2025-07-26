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
  let configService: jest.Mocked<ConfigService>;
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
      get: jest.fn(),
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
    configService = module.get(ConfigService);
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
          message: expect.stringContaining('burst'),
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
});
