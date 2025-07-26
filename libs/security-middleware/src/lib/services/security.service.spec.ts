import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecurityService } from './security.service';
import { SecurityRequest } from '../types/security.types';

describe('SecurityService', () => {
  let service: SecurityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                CORS_ORIGINS: 'http://localhost:4200,http://localhost:3000',
                IP_WHITELIST: '127.0.0.1,192.168.1.1',
                IP_BLACKLIST: '10.0.0.1',
                ALLOWED_COUNTRIES: 'IN,US,GB',
                BLOCKED_COUNTRIES: 'CN,RU',
                FALLBACK_COUNTRY: 'IN',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<SecurityService>(SecurityService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getHelmetMiddleware', () => {
    it('should return helmet middleware with security headers', () => {
      const middleware = service.getHelmetMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('getCorsMiddleware', () => {
    it('should return CORS middleware with configured origins', () => {
      const middleware = service.getCorsMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('getRateLimitMiddleware', () => {
    it('should return rate limiting middleware', () => {
      const middleware = service.getRateLimitMiddleware();
      expect(middleware).toBeDefined();
      expect(typeof middleware).toBe('function');
    });
  });

  describe('getIPFilterMiddleware', () => {
    let req: Partial<SecurityRequest>;
    let res: any;
    let next: jest.Mock;

    beforeEach(() => {
      req = {
        headers: {},
        connection: { remoteAddress: '127.0.0.1' } as any,
        socket: { remoteAddress: '127.0.0.1' } as any,
        securityFlags: {},
        ip: '127.0.0.1',
      } as SecurityRequest;
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it('should allow whitelisted IP', () => {
      (req.connection as any).remoteAddress = '127.0.0.1';

      const middleware = service.getIPFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.isWhitelisted).toBe(true);
    });

    it('should block blacklisted IP', () => {
      (req.connection as any).remoteAddress = '10.0.0.1';

      const middleware = service.getIPFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should block non-whitelisted IP when whitelist is configured', () => {
      (req.connection as any).remoteAddress = '192.168.1.100';

      const middleware = service.getIPFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('getGeoFilterMiddleware', () => {
    let req: Partial<SecurityRequest>;
    let res: any;
    let next: jest.Mock;

    beforeEach(() => {
      req = {
        headers: {},
        connection: { remoteAddress: '8.8.8.8' } as any,
        socket: { remoteAddress: '8.8.8.8' } as any,
        securityFlags: {},
        ip: '8.8.8.8',
      } as SecurityRequest;
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it('should allow requests from allowed countries', () => {
      const middleware = service.getGeoFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.ipInfo).toBeDefined();
      expect(req.ipInfo?.country).toBe('US');
    });

    it('should set fallback country for unknown IPs', () => {
      (req.connection as any).remoteAddress = '127.0.0.1'; // Localhost

      const middleware = service.getGeoFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.ipInfo?.country).toBe('IN');
    });
  });

  describe('getValidationMiddleware', () => {
    let req: Partial<SecurityRequest>;
    let res: any;
    let next: jest.Mock;

    beforeEach(() => {
      req = {
        body: { test: 'value' },
        query: {},
        params: {},
      };
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it('should proceed when no validation errors', () => {
      // Mock validationResult to return no errors
      jest.doMock('express-validator', () => ({
        validationResult: jest.fn(() => ({
          isEmpty: () => true,
          array: () => [],
        })),
      }));

      const middleware = service.getValidationMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(next).toHaveBeenCalled();
    });
  });

  describe('validation rules', () => {
    it('should provide email validation rule', () => {
      const rule = service.validateEmail();
      expect(rule).toBeDefined();
    });

    it('should provide password validation rule', () => {
      const rule = service.validatePassword();
      expect(rule).toBeDefined();
    });

    it('should provide UUID validation rule', () => {
      const rule = service.validateUUID();
      expect(rule).toBeDefined();
    });

    it('should provide pagination query validation rules', () => {
      const rules = service.validatePaginationQuery();
      expect(Array.isArray(rules)).toBe(true);
      expect(rules.length).toBe(2);
    });
  });

  describe('logSecurityEvent', () => {
    it('should log security events with details', () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');

      service.logSecurityEvent('TEST_EVENT', { detail: 'test' });

      expect(logSpy).toHaveBeenCalledWith(
        'Security Event: TEST_EVENT',
        expect.objectContaining({
          event: 'TEST_EVENT',
          details: { detail: 'test' },
        })
      );
    });

    it('should include request information when provided', () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');
      const req = {
        headers: { 'user-agent': 'test-agent' },
        connection: { remoteAddress: '127.0.0.1' },
        ipInfo: { country: 'US' },
      } as SecurityRequest;

      service.logSecurityEvent('TEST_EVENT', { detail: 'test' }, req);

      expect(logSpy).toHaveBeenCalledWith(
        'Security Event: TEST_EVENT',
        expect.objectContaining({
          clientIP: '127.0.0.1',
          country: 'US',
          userAgent: 'test-agent',
        })
      );
    });

    it('should handle request without ipInfo', () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');
      const req = {
        headers: { 'user-agent': 'test-agent' },
        connection: { remoteAddress: '127.0.0.1' },
      } as SecurityRequest;

      service.logSecurityEvent('TEST_EVENT', { detail: 'test' }, req);

      expect(logSpy).toHaveBeenCalledWith(
        'Security Event: TEST_EVENT',
        expect.objectContaining({
          clientIP: '127.0.0.1',
          country: 'unknown',
          userAgent: 'test-agent',
        })
      );
    });
  });

  describe('getClientIP', () => {
    it('should get IP from x-forwarded-for header when trust proxy is enabled', () => {
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.1,10.0.0.1' },
        connection: { remoteAddress: '127.0.0.1' },
      } as unknown as SecurityRequest;

      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should get IP from x-real-ip header when x-forwarded-for is not available', () => {
      const req = {
        headers: { 'x-real-ip': '192.168.1.2' },
        connection: { remoteAddress: '127.0.0.1' },
      } as unknown as SecurityRequest;

      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.2');
    });

    it('should get IP from connection.remoteAddress when headers are not available', () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '192.168.1.3' },
      } as unknown as SecurityRequest;

      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.3');
    });

    it('should get IP from socket.remoteAddress when connection is not available', () => {
      const req = {
        headers: {},
        connection: null,
        socket: { remoteAddress: '192.168.1.4' },
      } as unknown as SecurityRequest;

      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.4');
    });

    it('should get IP from req.ip when other sources are not available', () => {
      const req = {
        headers: {},
        connection: null,
        socket: null,
        ip: '192.168.1.5',
      } as unknown as SecurityRequest;

      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.5');
    });

    it('should return default IP when no sources are available', () => {
      const req = {
        headers: {},
        connection: null,
        socket: null,
        ip: null,
      } as unknown as SecurityRequest;

      const ip = service['getClientIP'](req);
      expect(ip).toBe('127.0.0.1');
    });
  });

  describe('sanitizeString', () => {
    it('should return non-string values as-is', () => {
      expect(service['sanitizeString'](null as any)).toBe(null);
      expect(service['sanitizeString'](undefined as any)).toBe(undefined);
      expect(service['sanitizeString'](123 as any)).toBe(123);
      expect(service['sanitizeString']({} as any)).toEqual({});
    });

    it('should remove script tags', () => {
      const input = '<script>alert("xss")</script>Hello World';
      const result = service['sanitizeString'](input);
      expect(result).toBe('Hello World');
    });

    it('should remove javascript protocol', () => {
      const input = 'javascript:alert("xss")';
      const result = service['sanitizeString'](input);
      expect(result).toBe('');
    });

    it('should remove event handlers', () => {
      const input = 'onclick=alert("xss") onload=alert("xss")';
      const result = service['sanitizeString'](input);
      expect(result).toBe('');
    });

    it('should remove HTML characters', () => {
      const input = '<div>Hello</div> & "quotes"';
      const result = service['sanitizeString'](input);
      expect(result).toBe('Hello quotes');
    });

    it('should trim whitespace', () => {
      const input = '  Hello World  ';
      const result = service['sanitizeString'](input);
      expect(result).toBe('Hello World');
    });
  });

  describe('sanitizeRequest', () => {
    it('should sanitize string values', () => {
      const req = {
        body: { name: '<script>alert("xss")</script>John' },
        query: { search: 'javascript:alert("xss")' },
        params: { id: 'onclick=alert("xss")' },
      } as unknown as SecurityRequest;

      service['sanitizeRequest'](req);

      expect(req.body.name).toBe('John');
      expect(req.query.search).toBe('');
      expect(req.params.id).toBe('');
    });

    it('should sanitize array values', () => {
      const req = {
        body: { tags: ['<script>alert("xss")</script>', 'safe'] },
      } as SecurityRequest;

      service['sanitizeRequest'](req);

      expect(req.body.tags).toEqual(['', 'safe']);
    });

    it('should sanitize nested objects', () => {
      const req = {
        body: {
          user: {
            name: '<script>alert("xss")</script>John',
            email: 'safe@example.com',
          },
        },
      } as SecurityRequest;

      service['sanitizeRequest'](req);

      expect(req.body.user.name).toBe('John');
      expect(req.body.user.email).toBe('safe@example.com');
    });

    it('should handle null/undefined values', () => {
      const req = {
        body: null,
        query: undefined,
        params: null,
      } as unknown as SecurityRequest;

      expect(() => service['sanitizeRequest'](req)).not.toThrow();
    });
  });

  describe('getGeoFilterMiddleware - blocked countries', () => {
    let req: Partial<SecurityRequest>;
    let res: any;
    let next: jest.Mock;

    beforeEach(() => {
      req = {
        headers: {},
        connection: { remoteAddress: '1.1.1.1' } as any, // China IP
        socket: { remoteAddress: '1.1.1.1' } as any,
        securityFlags: {},
        ip: '1.1.1.1',
      } as SecurityRequest;
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it('should block requests from blocked countries', () => {
      const middleware = service.getGeoFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Access denied from your location',
      });
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('getIPFilterMiddleware - trust proxy scenarios', () => {
    let req: Partial<SecurityRequest>;
    let res: any;
    let next: jest.Mock;

    beforeEach(() => {
      req = {
        headers: {},
        connection: { remoteAddress: '127.0.0.1' } as any,
        socket: { remoteAddress: '127.0.0.1' } as any,
        securityFlags: {},
        ip: '127.0.0.1',
      } as SecurityRequest;
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      next = jest.fn();
    });

    it('should use x-forwarded-for header when trust proxy is enabled', () => {
      req.headers = { 'x-forwarded-for': '192.168.1.100' };

      const middleware = service.getIPFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });

    it('should use x-real-ip header when x-forwarded-for is not available', () => {
      req.headers = { 'x-real-ip': '192.168.1.101' };

      const middleware = service.getIPFilterMiddleware();
      middleware(req as SecurityRequest, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
