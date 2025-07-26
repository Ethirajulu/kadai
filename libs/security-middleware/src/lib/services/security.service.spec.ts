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
  });
});