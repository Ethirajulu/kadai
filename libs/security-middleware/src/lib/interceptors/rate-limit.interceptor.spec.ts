import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { RateLimitInterceptor } from './rate-limit.interceptor';
import { RateLimitService } from '../services/rate-limit.service';
import { SecurityRequest } from '../types/security.types';

describe('RateLimitInterceptor', () => {
  let interceptor: RateLimitInterceptor;
  let rateLimitService: RateLimitService;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  const mockRateLimitService = {
    getRateLimitStatus: jest.fn(),
  };

  const mockRequest = {
    method: 'GET',
    path: '/api/test',
    ip: '192.168.1.1',
    user: { id: 'user123' },
    headers: {
      'user-agent': 'Mozilla/5.0 (Test Browser)',
    },
  } as unknown as SecurityRequest;

  const mockResponse = {
    setHeader: jest.fn(),
    getHeader: jest.fn(),
    statusCode: 200,
  } as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RateLimitInterceptor,
        {
          provide: RateLimitService,
          useValue: mockRateLimitService,
        },
      ],
    }).compile();

    interceptor = module.get<RateLimitInterceptor>(RateLimitInterceptor);
    rateLimitService = module.get<RateLimitService>(RateLimitService);

    // Mock ExecutionContext
    mockExecutionContext = {
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      }),
    } as unknown as ExecutionContext;

    // Mock CallHandler
    mockCallHandler = {
      handle: jest.fn().mockReturnValue(of({ success: true })),
    } as CallHandler;

    jest.clearAllMocks();
  });

  describe('intercept', () => {
    it('should handle successful response and update rate limit headers', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 95,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined); // No existing headers

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: (data) => {
            expect(data).toEqual({ success: true });
            resolve();
          },
        });
      });

      expect(mockCallHandler.handle).toHaveBeenCalled();
      expect(rateLimitService.getRateLimitStatus).toHaveBeenCalledWith({
        request: mockRequest,
        isAuthenticated: true,
      });
    });

    it('should handle error response and still update rate limit headers', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 0,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      const error = new Error('Test error');
      mockCallHandler.handle = jest
        .fn()
        .mockReturnValue(throwError(() => error));
      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          error: (err) => {
            expect(err).toBe(error);
            resolve();
          },
        });
      });

      expect(rateLimitService.getRateLimitStatus).toHaveBeenCalled();
    });

    it('should skip header update if headers are already set', async () => {
      mockResponse.getHeader.mockReturnValue('100'); // Existing header

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: () => resolve(),
        });
      });

      expect(rateLimitService.getRateLimitStatus).not.toHaveBeenCalled();
    });

    it('should handle unauthenticated requests', async () => {
      const unauthenticatedRequest = {
        ...mockRequest,
        user: null,
      };

      const mockStatus = {
        limit: 50,
        remaining: 45,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(unauthenticatedRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      });

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      await new Promise<void>((resolve) => {
        result.subscribe({
          next: () => resolve(),
        });
      });

      expect(rateLimitService.getRateLimitStatus).toHaveBeenCalledWith({
        request: unauthenticatedRequest,
        isAuthenticated: false,
      });
    });
  });

  describe('updateRateLimitHeaders', () => {
    it('should set all rate limit headers correctly', async () => {
      const mockStatus = {
        limit: 200,
        remaining: 150,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Limit',
        '200'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Remaining',
        '150'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Reset',
        expect.any(String)
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Policy',
        'authenticated:200req/15min,burst:50req/1min'
      );
    });

    it('should handle adaptive rate limiting with system load', async () => {
      const mockStatus = {
        limit: 150,
        remaining: 100,
        resetTime: Date.now() + 900000,
        isAdaptive: true,
        systemLoad: {
          cpu: 75.5,
          memory: 60.2,
        },
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Adaptive',
        'true'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-System-Load',
        JSON.stringify({
          cpu: 76,
          memory: 60,
        })
      );
    });

    it('should set Retry-After header when remaining is 0', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 0,
        resetTime: Date.now() + 300000, // 5 minutes from now
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );

      // Check that Retry-After is set to a reasonable value
      const retryAfterCall = mockResponse.setHeader.mock.calls.find(
        (call: any) => call[0] === 'Retry-After'
      );
      expect(retryAfterCall).toBeDefined();
      const retryAfterValue = parseInt(retryAfterCall[1]);
      expect(retryAfterValue).toBeGreaterThan(0);
      expect(retryAfterValue).toBeLessThanOrEqual(300); // Should be <= 5 minutes
    });

    it('should handle service errors gracefully', async () => {
      mockRateLimitService.getRateLimitStatus.mockRejectedValue(
        new Error('Service error')
      );
      mockResponse.getHeader.mockReturnValue(undefined);

      const loggerSpy = jest.spyOn(interceptor['logger'], 'warn');

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to update rate limit headers',
        expect.any(Error)
      );
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
    });

    it('should skip header update if headers already exist', async () => {
      mockResponse.getHeader.mockReturnValue('100'); // Existing header

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(rateLimitService.getRateLimitStatus).not.toHaveBeenCalled();
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
    });

    // NEW TESTS FOR MISSING BRANCHES
    it('should handle adaptive rate limiting with system load', async () => {
      const mockStatus = {
        limit: 150,
        remaining: 100,
        resetTime: Date.now() + 900000,
        isAdaptive: true,
        systemLoad: {
          cpu: 75.5,
          memory: 60.2,
        },
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-Adaptive',
        'true'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-RateLimit-System-Load',
        JSON.stringify({
          cpu: 76,
          memory: 60,
        })
      );
    });

    it('should handle adaptive rate limiting without system load', async () => {
      const mockStatus = {
        limit: 150,
        remaining: 100,
        resetTime: Date.now() + 900000,
        isAdaptive: true,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).not.toHaveBeenCalledWith(
        'X-RateLimit-Adaptive',
        'true'
      );
      expect(mockResponse.setHeader).not.toHaveBeenCalledWith(
        'X-RateLimit-System-Load',
        expect.any(String)
      );
    });

    it('should set Retry-After header when remaining is 0', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 0,
        resetTime: Date.now() + 300000, // 5 minutes from now
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );

      // Check that Retry-After is set to a reasonable value
      const retryAfterCall = mockResponse.setHeader.mock.calls.find(
        (call: any) => call[0] === 'Retry-After'
      );
      expect(retryAfterCall).toBeDefined();
      const retryAfterValue = parseInt(retryAfterCall[1]);
      expect(retryAfterValue).toBeGreaterThan(0);
      expect(retryAfterValue).toBeLessThanOrEqual(300); // Should be <= 5 minutes
    });

    it('should not set Retry-After header when remaining is greater than 0', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 50,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).not.toHaveBeenCalledWith(
        'Retry-After',
        expect.any(String)
      );
    });
  });

  describe('getRateLimitPolicy', () => {
    it('should return authenticated policy for authenticated users', () => {
      const policy = (interceptor as any).getRateLimitPolicy(true);
      expect(policy).toBe('authenticated:200req/15min,burst:50req/1min');
    });

    it('should return anonymous policy for unauthenticated users', () => {
      const policy = (interceptor as any).getRateLimitPolicy(false);
      expect(policy).toBe('anonymous:100req/15min,burst:20req/1min');
    });
  });

  describe('logRateLimitMetrics', () => {
    it('should log rate limit metrics for successful requests', () => {
      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).logRateLimitMetrics(
        mockRequest,
        mockResponse,
        150,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check completed',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          clientId: 'user123',
          duration: 150,
          result: 'success',
          statusCode: 200,
          isAuthenticated: true,
        })
      );
    });

    it('should log rate limit metrics for error requests', () => {
      const errorResponse = {
        ...mockResponse,
        statusCode: 429,
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).logRateLimitMetrics(
        mockRequest,
        errorResponse,
        200,
        'error'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check completed',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          clientId: 'user123',
          duration: 200,
          result: 'error',
          statusCode: 429,
          isAuthenticated: true,
        })
      );
    });

    it('should handle requests without user information', () => {
      const requestWithoutUser = {
        ...mockRequest,
        user: null,
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).logRateLimitMetrics(
        requestWithoutUser,
        mockResponse,
        100,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check completed',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          clientId: '192.168.1.1',
          duration: 100,
          result: 'success',
          statusCode: 200,
          isAuthenticated: false,
        })
      );
    });

    // NEW TESTS FOR MISSING BRANCHES
    it('should handle null request gracefully', () => {
      const loggerSpy = jest.spyOn(interceptor['logger'], 'warn');

      (interceptor as any).logRateLimitMetrics(
        null,
        mockResponse,
        100,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Invalid request or response for rate limit metrics'
      );
    });

    it('should handle null response gracefully', () => {
      const loggerSpy = jest.spyOn(interceptor['logger'], 'warn');

      (interceptor as any).logRateLimitMetrics(
        mockRequest,
        null,
        100,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Invalid request or response for rate limit metrics'
      );
    });

    it('should log warning when rate limit is exceeded', () => {
      const requestWithRateLimit = {
        ...mockRequest,
        securityFlags: { rateLimited: true },
        rateLimitInfo: {
          remaining: 0,
          limit: 100,
          resetTime: Date.now() + 900000,
          totalHits: 100,
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'warn');

      (interceptor as any).logRateLimitMetrics(
        requestWithRateLimit,
        mockResponse,
        150,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit exceeded',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          duration: 150,
          result: 'success',
          isAuthenticated: true,
        })
      );
    });

    it('should log warning when rate limit is approaching', () => {
      const requestWithLowRemaining = {
        ...mockRequest,
        securityFlags: { rateLimited: false },
        rateLimitInfo: {
          remaining: 5,
          limit: 100,
          resetTime: Date.now() + 900000,
          totalHits: 95,
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'warn');

      (interceptor as any).logRateLimitMetrics(
        requestWithLowRemaining,
        mockResponse,
        150,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit approaching',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          duration: 150,
          result: 'success',
          isAuthenticated: true,
        })
      );
    });

    it('should handle requests without rateLimitInfo', () => {
      const requestWithoutRateLimitInfo = {
        ...mockRequest,
        securityFlags: { rateLimited: false },
        rateLimitInfo: undefined,
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).logRateLimitMetrics(
        requestWithoutRateLimitInfo,
        mockResponse,
        150,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check completed',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          duration: 150,
          result: 'success',
          isAuthenticated: true,
          rateLimitInfo: undefined,
        })
      );
    });

    it('should handle requests with remaining >= 10', () => {
      const requestWithHighRemaining = {
        ...mockRequest,
        securityFlags: { rateLimited: false },
        rateLimitInfo: {
          remaining: 15,
          limit: 100,
          resetTime: Date.now() + 900000,
          totalHits: 85,
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).logRateLimitMetrics(
        requestWithHighRemaining,
        mockResponse,
        150,
        'success'
      );

      expect(loggerSpy).toHaveBeenCalledWith(
        'Rate limit check completed',
        expect.objectContaining({
          method: 'GET',
          path: '/api/test',
          duration: 150,
          result: 'success',
          isAuthenticated: true,
        })
      );
    });

    it('should handle error in logRateLimitMetrics gracefully', () => {
      // Mock the logger to throw an error when called
      const originalDebug = interceptor['logger'].debug;
      interceptor['logger'].debug = jest.fn().mockImplementation(() => {
        throw new Error('Logger error');
      });

      const loggerSpy = jest.spyOn(interceptor['logger'], 'error');

      expect(() => {
        (interceptor as any).logRateLimitMetrics(
          mockRequest,
          mockResponse,
          150,
          'success'
        );
      }).not.toThrow();

      expect(loggerSpy).toHaveBeenCalledWith(
        'Failed to log rate limit metrics',
        expect.any(Error)
      );

      // Restore original logger
      interceptor['logger'].debug = originalDebug;
    });
  });

  describe('sendMetricsToMonitoring', () => {
    it('should send metrics to monitoring system', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const metrics = {
        method: 'GET',
        path: '/api/test',
        clientId: 'user123',
        duration: 150,
        result: 'success',
        statusCode: 200,
        isAuthenticated: true,
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).sendMetricsToMonitoring(metrics);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Metrics would be sent to monitoring service',
        expect.objectContaining({
          metricsType: 'rate_limit',
          tags: {
            authenticated: true,
            method: 'GET',
            result: 'success',
            rateLimited: false,
          },
          values: {
            duration: 150,
            remaining: 0,
            totalHits: 0,
          },
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle metrics with different result types', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const errorMetrics = {
        method: 'POST',
        path: '/api/error',
        clientId: '192.168.1.2',
        duration: 300,
        result: 'error',
        statusCode: 500,
        isAuthenticated: false,
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).sendMetricsToMonitoring(errorMetrics);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Metrics would be sent to monitoring service',
        expect.objectContaining({
          metricsType: 'rate_limit',
          tags: {
            authenticated: false,
            method: 'POST',
            result: 'error',
            rateLimited: false,
          },
          values: {
            duration: 300,
            remaining: 0,
            totalHits: 0,
          },
        })
      );

      process.env.NODE_ENV = originalEnv;
    });

    // NEW TESTS FOR MISSING BRANCHES
    it('should handle development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const metrics = {
        method: 'GET',
        path: '/api/test',
        duration: 150,
        result: 'success',
        isAuthenticated: true,
        securityFlags: { rateLimited: true },
        rateLimitInfo: {
          remaining: 5,
          totalHits: 95,
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).sendMetricsToMonitoring(metrics);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Metrics would be sent to monitoring service',
        expect.objectContaining({
          metricsType: 'rate_limit',
          tags: {
            authenticated: true,
            method: 'GET',
            result: 'success',
            rateLimited: true,
          },
          values: {
            duration: 150,
            remaining: 5,
            totalHits: 95,
          },
        })
      );

      // Restore original environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle non-development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const metrics = {
        method: 'GET',
        path: '/api/test',
        duration: 150,
        result: 'success',
        isAuthenticated: true,
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).sendMetricsToMonitoring(metrics);

      // In production, no debug logging should occur
      expect(loggerSpy).not.toHaveBeenCalled();

      // Restore original environment
      process.env.NODE_ENV = originalEnv;
    });

    it('should handle metrics with rateLimitInfo', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const metrics = {
        method: 'GET',
        path: '/api/test',
        duration: 150,
        result: 'success',
        isAuthenticated: true,
        securityFlags: { rateLimited: false },
        rateLimitInfo: {
          remaining: 25,
          totalHits: 75,
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'debug');

      (interceptor as any).sendMetricsToMonitoring(metrics);

      expect(loggerSpy).toHaveBeenCalledWith(
        'Metrics would be sent to monitoring service',
        expect.objectContaining({
          values: {
            duration: 150,
            remaining: 25,
            totalHits: 75,
          },
        })
      );

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Edge Cases', () => {
    it('should handle null request gracefully', async () => {
      const nullRequest = null;
      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(nullRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      });

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      expect(() => {
        result.subscribe();
      }).not.toThrow();
    });

    it('should handle null response gracefully', async () => {
      const nullResponse = null;
      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(mockRequest),
        getResponse: jest.fn().mockReturnValue(nullResponse),
      });

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      expect(() => {
        result.subscribe();
      }).not.toThrow();
    });

    it('should handle very large reset times', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 0, // Set to 0 to trigger Retry-After header
        resetTime: Date.now() + 24 * 60 * 60 * 1000, // 24 hours from now
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      const retryAfterCall = mockResponse.setHeader.mock.calls.find(
        (call: any) => call[0] === 'Retry-After'
      );
      expect(retryAfterCall).toBeDefined();
      const retryAfterValue = parseInt(retryAfterCall[1]);
      expect(retryAfterValue).toBeGreaterThan(0);
    });

    it('should handle past reset times', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 0,
        resetTime: Date.now() - 1000, // 1 second ago
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    });

    it('should handle zero reset time', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 0,
        resetTime: 0,
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      await (interceptor as any).updateRateLimitHeaders(
        mockRequest,
        mockResponse
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent requests efficiently', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 95,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      // Simulate concurrent requests
      const promises = Array.from({ length: 5 }, () =>
        (interceptor as any).updateRateLimitHeaders(mockRequest, mockResponse)
      );

      await Promise.all(promises);

      expect(rateLimitService.getRateLimitStatus).toHaveBeenCalledTimes(5);
      expect(mockResponse.setHeader).toHaveBeenCalledTimes(20); // 4 headers per request
    });

    it('should handle rapid successive calls', async () => {
      const mockStatus = {
        limit: 100,
        remaining: 90,
        resetTime: Date.now() + 900000,
        isAdaptive: false,
        systemLoad: null,
      };

      mockRateLimitService.getRateLimitStatus.mockResolvedValue(mockStatus);
      mockResponse.getHeader.mockReturnValue(undefined);

      // Simulate rapid successive calls
      for (let i = 0; i < 10; i++) {
        await (interceptor as any).updateRateLimitHeaders(
          mockRequest,
          mockResponse
        );
      }

      expect(rateLimitService.getRateLimitStatus).toHaveBeenCalledTimes(10);
    });
  });
});
