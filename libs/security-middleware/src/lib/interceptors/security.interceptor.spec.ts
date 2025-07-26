import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { SecurityInterceptor } from './security.interceptor';
import { SecurityService } from '../services/security.service';
import { SecurityRequest } from '../types/security.types';

describe('SecurityInterceptor', () => {
  let interceptor: SecurityInterceptor;
  let securityService: SecurityService;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;

  const mockSecurityService = {
    logSecurityEvent: jest.fn(),
  };

  const mockRequest = {
    method: 'GET',
    path: '/api/test',
    ip: '192.168.1.1',
    headers: {
      'user-agent': 'Mozilla/5.0 (Test Browser)',
      authorization: 'Bearer test-token',
      cookie: 'session=test-session',
      'x-api-key': 'test-api-key',
    },
    ipInfo: {
      country: 'US',
      city: 'New York',
      region: 'NY',
    },
    isWhitelisted: false,
    securityFlags: ['rate_limited'],
  } as unknown as SecurityRequest;

  const mockResponse = {
    setHeader: jest.fn(),
    removeHeader: jest.fn(),
    statusCode: 200,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityInterceptor,
        {
          provide: SecurityService,
          useValue: mockSecurityService,
        },
      ],
    }).compile();

    interceptor = module.get<SecurityInterceptor>(SecurityInterceptor);
    securityService = module.get<SecurityService>(SecurityService);

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
    it('should add security headers and log request successfully', () => {
      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.any(String)
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-API-Version',
        '1.0'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(mockResponse.setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(mockResponse.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(mockResponse.removeHeader).toHaveBeenCalledWith('Server');

      result.subscribe();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle successful response and log metrics', () => {
      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe((data) => {
        expect(data).toEqual({ success: true });
      });

      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle 401 unauthorized error and log security event', () => {
      const unauthorizedError = new Error('Unauthorized');
      (unauthorizedError as any).status = 401;
      (unauthorizedError as any).message = 'Invalid token';

      mockCallHandler.handle = jest
        .fn()
        .mockReturnValue(throwError(() => unauthorizedError));

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe({
        error: (error) => {
          expect(error).toBe(unauthorizedError);
        },
      });

      expect(securityService.logSecurityEvent).toHaveBeenCalledWith(
        'UNAUTHORIZED_ACCESS',
        {
          path: '/api/test',
          method: 'GET',
          error: 'Invalid token',
        },
        mockRequest
      );
    });

    it('should handle 403 forbidden error and log security event', () => {
      const forbiddenError = new Error('Forbidden');
      (forbiddenError as any).status = 403;
      (forbiddenError as any).message = 'Access denied';

      mockCallHandler.handle = jest
        .fn()
        .mockReturnValue(throwError(() => forbiddenError));

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe({
        error: (error) => {
          expect(error).toBe(forbiddenError);
        },
      });

      expect(securityService.logSecurityEvent).toHaveBeenCalledWith(
        'FORBIDDEN_ACCESS',
        {
          path: '/api/test',
          method: 'GET',
          error: 'Access denied',
        },
        mockRequest
      );
    });

    it('should handle 429 rate limit error and log security event', () => {
      const rateLimitError = new Error('Too Many Requests');
      (rateLimitError as any).status = 429;

      mockCallHandler.handle = jest
        .fn()
        .mockReturnValue(throwError(() => rateLimitError));

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe({
        error: (error) => {
          expect(error).toBe(rateLimitError);
        },
      });

      expect(securityService.logSecurityEvent).toHaveBeenCalledWith(
        'RATE_LIMIT_EXCEEDED',
        {
          path: '/api/test',
          method: 'GET',
        },
        mockRequest
      );
    });

    it('should handle other errors without logging security events', () => {
      const genericError = new Error('Internal Server Error');
      (genericError as any).status = 500;

      mockCallHandler.handle = jest
        .fn()
        .mockReturnValue(throwError(() => genericError));

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe({
        error: (error) => {
          expect(error).toBe(genericError);
        },
      });

      expect(securityService.logSecurityEvent).not.toHaveBeenCalled();
    });

    it('should handle request without sensitive headers', () => {
      const requestWithoutSensitiveHeaders = {
        ...mockRequest,
        headers: {
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'content-type': 'application/json',
        },
      };

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(requestWithoutSensitiveHeaders),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      });

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle request without ipInfo', () => {
      const requestWithoutIpInfo = {
        ...mockRequest,
        ipInfo: undefined,
      };

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(requestWithoutIpInfo),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      });

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle request without securityFlags', () => {
      const requestWithoutSecurityFlags = {
        ...mockRequest,
        securityFlags: undefined,
      };

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(requestWithoutSecurityFlags),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      });

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });

    it('should handle request with all optional fields missing', () => {
      const minimalRequest = {
        method: 'POST',
        path: '/api/minimal',
        ip: '127.0.0.1',
        headers: {},
      } as SecurityRequest;

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(minimalRequest),
        getResponse: jest.fn().mockReturnValue(mockResponse),
      });

      const result = interceptor.intercept(
        mockExecutionContext,
        mockCallHandler
      );

      result.subscribe();
      expect(mockCallHandler.handle).toHaveBeenCalled();
    });
  });

  describe('addSecurityHeaders', () => {
    it('should add all required security headers', () => {
      const response = {
        setHeader: jest.fn(),
        removeHeader: jest.fn(),
      };

      // Access private method for testing
      (interceptor as any).addSecurityHeaders(response);

      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Request-ID',
        expect.any(String)
      );
      expect(response.setHeader).toHaveBeenCalledWith('X-API-Version', '1.0');
      expect(response.setHeader).toHaveBeenCalledWith(
        'Cache-Control',
        'no-store, no-cache, must-revalidate, private'
      );
      expect(response.setHeader).toHaveBeenCalledWith('Pragma', 'no-cache');
      expect(response.setHeader).toHaveBeenCalledWith('Expires', '0');
      expect(response.removeHeader).toHaveBeenCalledWith('X-Powered-By');
      expect(response.removeHeader).toHaveBeenCalledWith('Server');
    });

    it('should add X-Request-ID header', () => {
      const response = {
        setHeader: jest.fn(),
        removeHeader: jest.fn(),
      };

      (interceptor as any).addSecurityHeaders(response);
      const requestIdCall = response.setHeader.mock.calls.find(
        (call) => call[0] === 'X-Request-ID'
      );

      expect(requestIdCall).toBeDefined();
      expect(requestIdCall[1]).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(typeof requestIdCall[1]).toBe('string');
    });
  });

  describe('logSecurityRequest', () => {
    it('should log request with masked sensitive headers', () => {
      const request = {
        ...mockRequest,
        headers: {
          authorization: 'Bearer secret-token',
          cookie: 'session=secret-session',
          'x-api-key': 'secret-api-key',
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'content-type': 'application/json',
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

      (interceptor as any).logSecurityRequest(request);

      expect(loggerSpy).toHaveBeenCalledWith('Security Request', {
        method: 'GET',
        path: '/api/test',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (Test Browser)',
        country: 'US',
        isWhitelisted: false,
        securityFlags: ['rate_limited'],
        headers: {
          authorization: '[MASKED]',
          cookie: '[MASKED]',
          'x-api-key': '[MASKED]',
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'content-type': 'application/json',
        },
      });
    });

    it('should handle request without sensitive headers', () => {
      const request = {
        ...mockRequest,
        headers: {
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'content-type': 'application/json',
        },
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

      (interceptor as any).logSecurityRequest(request);

      expect(loggerSpy).toHaveBeenCalledWith('Security Request', {
        method: 'GET',
        path: '/api/test',
        ip: '192.168.1.1',
        userAgent: 'Mozilla/5.0 (Test Browser)',
        country: 'US',
        isWhitelisted: false,
        securityFlags: ['rate_limited'],
        headers: {
          'user-agent': 'Mozilla/5.0 (Test Browser)',
          'content-type': 'application/json',
        },
      });
    });
  });

  describe('logSecurityResponse', () => {
    it('should log successful response', () => {
      const response = {
        statusCode: 200,
        getHeader: jest.fn().mockReturnValue('application/json'),
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

      (interceptor as any).logSecurityResponse(
        mockRequest,
        response,
        150,
        true
      );

      expect(loggerSpy).toHaveBeenCalledWith('Security Response', {
        method: 'GET',
        path: '/api/test',
        statusCode: 200,
        duration: 150,
        success: true,
        ip: '192.168.1.1',
        country: 'US',
      });
    });

    it('should log error response', () => {
      const response = {
        statusCode: 500,
        getHeader: jest.fn().mockReturnValue('application/json'),
      };

      const error = new Error('Internal Server Error');
      const loggerSpy = jest.spyOn(interceptor['logger'], 'error');

      (interceptor as any).logSecurityResponse(
        mockRequest,
        response,
        250,
        false,
        error
      );

      expect(loggerSpy).toHaveBeenCalledWith('Security Response Error', {
        method: 'GET',
        path: '/api/test',
        statusCode: 500,
        duration: 250,
        success: false,
        error: 'Internal Server Error',
        stack: error.stack,
        ip: '192.168.1.1',
        country: 'US',
      });
    });

    it('should handle response without content-type header', () => {
      const response = {
        statusCode: 204,
        getHeader: jest.fn().mockReturnValue(undefined),
      };

      const loggerSpy = jest.spyOn(interceptor['logger'], 'log');

      (interceptor as any).logSecurityResponse(
        mockRequest,
        response,
        100,
        true
      );

      expect(loggerSpy).toHaveBeenCalledWith('Security Response', {
        method: 'GET',
        path: '/api/test',
        statusCode: 204,
        duration: 100,
        success: true,
        ip: '192.168.1.1',
        country: 'US',
      });
    });
  });

  describe('generateRequestId', () => {
    it('should generate unique request IDs', () => {
      const requestId1 = (interceptor as any).generateRequestId();
      const requestId2 = (interceptor as any).generateRequestId();

      expect(requestId1).not.toBe(requestId2);
      expect(typeof requestId1).toBe('string');
      expect(typeof requestId2).toBe('string');
      expect(requestId1.length).toBeGreaterThan(0);
      expect(requestId2.length).toBeGreaterThan(0);
    });

    it('should generate request IDs with consistent format', () => {
      const requestId = (interceptor as any).generateRequestId();

      // Should be a request ID string with timestamp and random part
      expect(requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      expect(requestId.length).toBeGreaterThan(20);
    });
  });

  describe('Edge Cases', () => {
    it('should handle null response object gracefully', () => {
      const nullResponse = null;

      expect(() => {
        (interceptor as any).addSecurityHeaders(nullResponse);
      }).toThrow();
    });

    it('should handle response without setHeader method', () => {
      const invalidResponse = {
        removeHeader: jest.fn(),
      };

      expect(() => {
        (interceptor as any).addSecurityHeaders(invalidResponse);
      }).toThrow();
    });

    it('should handle request with null headers', () => {
      const requestWithNullHeaders = {
        ...mockRequest,
        headers: null,
      };

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(requestWithNullHeaders),
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

    it('should handle request with undefined headers', () => {
      const requestWithUndefinedHeaders = {
        ...mockRequest,
        headers: undefined,
      };

      mockExecutionContext.switchToHttp = jest.fn().mockReturnValue({
        getRequest: jest.fn().mockReturnValue(requestWithUndefinedHeaders),
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
  });
});
