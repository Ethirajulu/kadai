import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { SecurityService } from './security.service';
import { SecurityRequest } from '../types/security.types';

// Mock express-validator
const mockValidationChain = {
  isEmail: jest.fn().mockReturnThis(),
  normalizeEmail: jest.fn().mockReturnThis(),
  isLength: jest.fn().mockReturnThis(),
  matches: jest.fn().mockReturnThis(),
  withMessage: jest.fn().mockReturnThis(),
  isUUID: jest.fn().mockReturnThis(),
  optional: jest.fn().mockReturnThis(),
  isInt: jest.fn().mockReturnThis(),
  toInt: jest.fn().mockReturnThis(),
};

jest.mock('express-validator', () => ({
  validationResult: jest.fn(),
  body: jest.fn(() => mockValidationChain),
  param: jest.fn(() => mockValidationChain),
  query: jest.fn(() => mockValidationChain),
}));

// Get the mocked validation result function
import { validationResult } from 'express-validator';
const mockValidationResult = validationResult as jest.MockedFunction<typeof validationResult>;

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
      mockValidationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
        formatter: jest.fn() as any,
        errors: [],
        mapped: jest.fn() as any,
        formatWith: jest.fn() as any,
        throw: jest.fn() as any,
      } as any);

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

  describe('Enhanced Sanitization Edge Cases', () => {
    it('should detect and remove all dangerous event handlers', () => {
      const testStrings = [
        'onclick=alert()',
        'onload=malicious()',
        'onerror=hack()',
        'onmouseover=steal()',
        'onfocus=phish()',
        'onblur=keylog()',
        'onchange=track()',
        'onsubmit=capture()',
        'onreset=reset()',
        'onselect=select()',
        'onunload=cleanup()',
        'onabort=abort()',
        'onbeforeunload=before()',
        'onhashchange=hash()',
        'onmessage=message()',
        'onoffline=offline()',
        'ononline=online()',
        'onpagehide=hide()',
        'onpageshow=show()',
        'onpopstate=pop()',
        'onresize=resize()',
        'onstorage=store()',
        'oncontextmenu=menu()',
        'oninput=input()',
        'oninvalid=invalid()',
        'onsearch=search()',
        'onkeydown=keydown()',
        'onkeypress=keypress()',
        'onkeyup=keyup()',
        'onmousedown=mousedown()',
        'onmousemove=mousemove()',
        'onmouseout=mouseout()',
        'onmouseup=mouseup()',
        'onwheel=wheel()',
        'ondrag=drag()',
        'ondragend=dragend()',
        'ondragenter=dragenter()',
        'ondragleave=dragleave()',
        'ondragover=dragover()',
        'ondragstart=dragstart()',
        'ondrop=drop()',
        'oncopy=copy()',
        'oncut=cut()',
        'onpaste=paste()',
        'onbeforecopy=beforecopy()',
        'onbeforecut=beforecut()',
        'onbeforepaste=beforepaste()',
        'onselectstart=selectstart()',
        'onselectionchange=selectionchange()'
      ];

      testStrings.forEach(testString => {
        const result = service['sanitizeString'](testString);
        expect(result).toBe('');
      });
    });

    it('should handle complex nested objects with dangerous content', () => {
      const req = {
        body: {
          user: {
            profile: {
              description: '<script>alert("nested xss")</script>Safe text',
              preferences: {
                theme: 'onclick=malicious()',
                notifications: ['<img src=x onerror=alert()>', 'safe notification']
              }
            }
          }
        },
        query: {
          search: 'javascript:void(0)',
          filters: ['onload=hack()', 'normal filter']
        },
        params: {
          id: 'onmouseover=steal()',
          category: 'safe-category'
        }
      } as unknown as SecurityRequest;

      service['sanitizeRequest'](req);

      expect(req.body.user.profile.description).toBe('Safe text');
      expect(req.body.user.profile.preferences.theme).toBe('');
      expect(req.body.user.profile.preferences.notifications[0]).toBe('');
      expect(req.body.user.profile.preferences.notifications[1]).toBe('safe notification');
      expect(req.query.search).toBe('');
      expect((req.query.filters as any)[0]).toBe('');
      expect((req.query.filters as any)[1]).toBe('normal filter');
      expect(req.params.id).toBe('');
      expect(req.params.category).toBe('safe-category');
    });

    it('should handle non-string values in sanitization', () => {
      const req = {
        body: {
          number: 123,
          boolean: true,
          null: null,
          undefined: undefined,
          date: new Date(),
          object: { nested: 'value' }
        }
      } as SecurityRequest;

      expect(() => service['sanitizeRequest'](req)).not.toThrow();
      expect(req.body.number).toBe(123);
      expect(req.body.boolean).toBe(true);
      expect(req.body.null).toBe(null);
      expect(req.body.undefined).toBe(undefined);
      expect(req.body.date).toBeInstanceOf(Date);
      expect(req.body.object.nested).toBe('value');
    });

    it('should handle empty and null strings in sanitization', () => {
      expect(service['sanitizeString']('')).toBe('');
      expect(service['sanitizeString'](null as any)).toBe(null);
      expect(service['sanitizeString'](undefined as any)).toBe(undefined);
      expect(service['sanitizeString'](123 as any)).toBe(123);
    });

    it('should normalize whitespace and remove quotes', () => {
      const input = '  multiple   spaces  "quoted text"  \'single quotes\'  ';
      const result = service['sanitizeString'](input);
      expect(result).toBe('multiple spaces quoted text single quotes');
    });

    it('should handle ampersand characters correctly', () => {
      const input = 'Text with & ampersands && multiple &amp; entities';
      const result = service['sanitizeString'](input);
      expect(result).toBe('Text with ampersands multiple amp; entities');
    });

    it('should remove all HTML tags', () => {
      const input = '<div>Content</div><p>Paragraph</p><span class="test">Span</span>';
      const result = service['sanitizeString'](input);
      expect(result).toBe('ContentParagraphSpan');
    });

    it('should handle mixed dangerous content', () => {
      const input = '<script>alert(1)</script>javascript:void(0)onclick=hack()<img src=x onerror=alert()>Safe text';
      const result = service['sanitizeString'](input);
      expect(result).toBe(''); // Should return empty string due to dangerous patterns
    });
  });

  describe('IP Resolution Edge Cases', () => {
    it('should handle trust proxy disabled scenarios', () => {
      // Create service with trust proxy disabled
      const noTrustProxyService = new SecurityService({
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'IP_WHITELIST') return '';
          if (key === 'IP_BLACKLIST') return '';
          if (key === 'CORS_ORIGINS') return 'http://localhost:4200';
          if (key === 'ALLOWED_COUNTRIES') return 'IN,US,GB';
          if (key === 'BLOCKED_COUNTRIES') return 'CN';
          return undefined;
        }),
      } as any);

      // Override config to disable trust proxy
      (noTrustProxyService as any).config.ipWhitelist.trustProxy = false;

      const req = {
        headers: { 'x-forwarded-for': '192.168.1.100' },
        connection: { remoteAddress: '127.0.0.1' },
        socket: { remoteAddress: '127.0.0.1' },
        ip: '127.0.0.1',
      } as unknown as SecurityRequest;

      const clientIP = (noTrustProxyService as any).getClientIP(req);
      expect(clientIP).toBe('127.0.0.1'); // Should ignore x-forwarded-for
    });

    it('should handle missing connection and socket properties', () => {
      const req = {
        headers: {},
        ip: '192.168.1.200',
      } as SecurityRequest;

      const clientIP = (service as any).getClientIP(req);
      expect(clientIP).toBe('192.168.1.200');
    });

    it('should fallback to default IP when all sources are missing', () => {
      const req = {
        headers: {},
      } as SecurityRequest;

      const clientIP = (service as any).getClientIP(req);
      expect(clientIP).toBe('127.0.0.1');
    });

    it('should handle x-forwarded-for with multiple IPs', () => {
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.100, 10.0.0.1, 172.16.0.1' },
        connection: { remoteAddress: '127.0.0.1' },
      } as unknown as SecurityRequest;

      const clientIP = (service as any).getClientIP(req);
      expect(clientIP).toBe('192.168.1.100'); // Should take first IP
    });
  });

  describe('Geo Filter Edge Cases', () => {
    it('should handle unknown IP with fallback country', () => {
      const req = {
        headers: {},
        connection: { remoteAddress: '0.0.0.0' }, // Invalid IP
        socket: { remoteAddress: '0.0.0.0' },
        ip: '0.0.0.0',
      } as SecurityRequest;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = service.getGeoFilterMiddleware();
      middleware(req, res, next);

      expect(req.ipInfo?.country).toBe('IN'); // Should use fallback
      expect(next).toHaveBeenCalled();
    });

    it('should handle empty allowed countries list', () => {
      // Create service with empty allowed countries
      const emptyAllowedService = new SecurityService({
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'ALLOWED_COUNTRIES') return '';
          if (key === 'BLOCKED_COUNTRIES') return '';
          if (key === 'CORS_ORIGINS') return 'http://localhost:4200';
          return undefined;
        }),
      } as any);

      const req = {
        headers: {},
        connection: { remoteAddress: '8.8.8.8' }, // US IP
        ip: '8.8.8.8',
      } as SecurityRequest;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      const middleware = emptyAllowedService.getGeoFilterMiddleware();
      middleware(req, res, next);

      expect(next).toHaveBeenCalled(); // Should allow when no restrictions
    });
  });

  describe('Validation Middleware Edge Cases', () => {
    it('should handle validation errors correctly', () => {
      const req = {
        body: { email: 'invalid-email' }
      } as SecurityRequest;
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };
      const next = jest.fn();

      // Mock validation result with errors
      mockValidationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => [{ msg: 'Invalid email format', field: 'email', value: 'invalid-email', location: 'body', nestedErrors: [] }],
        formatter: jest.fn() as any,
        errors: [{ msg: 'Invalid email format', field: 'email', value: 'invalid-email', location: 'body', nestedErrors: [] }],
        mapped: jest.fn() as any,
        formatWith: jest.fn() as any,
        throw: jest.fn() as any,
      } as any);

      const middleware = service.getValidationMiddleware();
      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: [{ msg: 'Invalid email format', field: 'email', value: 'invalid-email', location: 'body', nestedErrors: [] }]
      });
      expect(next).not.toHaveBeenCalled();
    });

    it('should handle disabled sanitization', () => {
      // Create service with sanitization disabled
      const noSanitizeService = new SecurityService({
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'CORS_ORIGINS') return 'http://localhost:4200';
          if (key === 'IP_WHITELIST') return '';
          if (key === 'IP_BLACKLIST') return '';
          if (key === 'ALLOWED_COUNTRIES') return 'IN,US,GB';
          if (key === 'BLOCKED_COUNTRIES') return '';
          return undefined;
        }),
      } as any);

      // Override config to disable sanitization
      (noSanitizeService as any).config.validation.sanitizeInput = false;

      const req = {
        body: { malicious: '<script>alert()</script>' }
      } as SecurityRequest;
      const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
      const next = jest.fn();

      // Mock validation result with no errors
      mockValidationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => [],
        formatter: jest.fn() as any,
        errors: [],
        mapped: jest.fn() as any,
        formatWith: jest.fn() as any,
        throw: jest.fn() as any,
      } as any);

      const middleware = noSanitizeService.getValidationMiddleware();
      middleware(req, res, next);

      expect(req.body.malicious).toBe('<script>alert()</script>'); // Should not be sanitized
      expect(next).toHaveBeenCalled();
    });
  });
});
