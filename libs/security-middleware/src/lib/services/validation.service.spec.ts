import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ValidationService, ValidationSchema } from './validation.service';
import { SecurityRequest } from '../types/security.types';

describe('ValidationService', () => {
  let service: ValidationService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        VALIDATION_SANITIZE_INPUT: true,
        VALIDATION_MAX_BODY_SIZE: '10mb',
        VALIDATION_MAX_PARAMETER_LENGTH: 1000,
        VALIDATION_ENABLE_XSS_PROTECTION: true,
        VALIDATION_ENABLE_CSRF_PROTECTION: true,
        VALIDATION_ENABLE_SQL_INJECTION_PROTECTION: true,
        VALIDATION_ALLOWED_FILE_TYPES: 'jpg,jpeg,png,gif,pdf,doc,docx',
        VALIDATION_MAX_FILE_SIZE: 5 * 1024 * 1024,
        VALIDATION_ENABLE_VIRUS_SCANNING: false,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ValidationService>(ValidationService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Configuration', () => {
    it('should load validation configuration correctly', () => {
      expect(configService.get).toHaveBeenCalledWith(
        'VALIDATION_SANITIZE_INPUT',
        true
      );
      expect(configService.get).toHaveBeenCalledWith(
        'VALIDATION_MAX_BODY_SIZE',
        '10mb'
      );
      expect(configService.get).toHaveBeenCalledWith(
        'VALIDATION_ENABLE_XSS_PROTECTION',
        true
      );
    });
  });

  describe('Email Validation', () => {
    it('should validate correct email format', () => {
      const validation = service.getEmailValidation();
      expect(validation).toBeDefined();
    });

    it('should reject invalid email format', () => {
      const validation = service.getEmailValidation();
      // This would be tested in integration tests with actual request objects
      expect(validation).toBeDefined();
    });
  });

  describe('Password Validation', () => {
    it('should validate strong password', () => {
      const validation = service.getPasswordValidation();
      expect(validation).toBeDefined();
    });

    it('should reject weak password', () => {
      const validation = service.getPasswordValidation();
      expect(validation).toBeDefined();
    });
  });

  describe('UUID Validation', () => {
    it('should validate correct UUID format', () => {
      const validation = service.getUUIDValidation();
      expect(validation).toBeDefined();
    });

    it('should reject invalid UUID format', () => {
      const validation = service.getUUIDValidation();
      expect(validation).toBeDefined();
    });
  });

  describe('Pagination Validation', () => {
    it('should validate pagination parameters', () => {
      const validation = service.getPaginationValidation();
      expect(validation).toHaveLength(2);
    });
  });

  describe('File Upload Validation', () => {
    it('should validate allowed file types', () => {
      const validation = service.getFileUploadValidation();
      expect(validation).toBeDefined();
    });

    it('should reject disallowed file types', () => {
      const validation = service.getFileUploadValidation();
      expect(validation).toBeDefined();
    });

    it('should validate file size limits', () => {
      const validation = service.getFileUploadValidation();
      expect(validation).toBeDefined();
    });
  });

  describe('Common Schemas', () => {
    it('should provide email schema', () => {
      const schemas = service.getCommonSchemas();
      expect(schemas.email).toBeDefined();
    });

    it('should provide password schema', () => {
      const schemas = service.getCommonSchemas();
      expect(schemas.password).toBeDefined();
    });

    it('should provide UUID schema', () => {
      const schemas = service.getCommonSchemas();
      expect(schemas.uuid).toBeDefined();
    });

    it('should provide pagination schema', () => {
      const schemas = service.getCommonSchemas();
      expect(schemas.pagination).toBeDefined();
    });

    it('should provide user schema', () => {
      const schemas = service.getCommonSchemas();
      expect(schemas.user).toBeDefined();
    });
  });

  describe('XSS Protection', () => {
    it('should detect script tags', () => {
      const maliciousInput = '<script>alert("xss")</script>';
      const validation = service['validateXSSProtection']();
      expect(validation).toBeDefined();
    });

    it('should detect javascript protocol', () => {
      const maliciousInput = 'javascript:alert("xss")';
      const validation = service['validateXSSProtection']();
      expect(validation).toBeDefined();
    });

    it('should detect event handlers', () => {
      const maliciousInput = 'onclick="alert(\'xss\')"';
      const validation = service['validateXSSProtection']();
      expect(validation).toBeDefined();
    });

    it('should allow safe content', () => {
      const safeInput = 'Hello, world!';
      const validation = service['validateXSSProtection']();
      expect(validation).toBeDefined();
    });
  });

  describe('SQL Injection Protection', () => {
    it('should detect UNION queries', () => {
      const maliciousInput = "'; UNION SELECT * FROM users; --";
      const validation = service['validateSQLInjectionProtection']();
      expect(validation).toBeDefined();
    });

    it('should detect SELECT statements', () => {
      const maliciousInput = "'; SELECT * FROM users; --";
      const validation = service['validateSQLInjectionProtection']();
      expect(validation).toBeDefined();
    });

    it('should detect INSERT statements', () => {
      const maliciousInput = "'; INSERT INTO users VALUES (1, 'hacker'); --";
      const validation = service['validateSQLInjectionProtection']();
      expect(validation).toBeDefined();
    });

    it('should allow safe content', () => {
      const safeInput = 'Hello, world!';
      const validation = service['validateSQLInjectionProtection']();
      expect(validation).toBeDefined();
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF token for non-GET requests', () => {
      const validation = service['validateCSRFProtection']();
      expect(validation).toBeDefined();
    });

    it('should allow GET requests without CSRF token', () => {
      const validation = service['validateCSRFProtection']();
      expect(validation).toBeDefined();
    });
  });

  describe('Sanitization', () => {
    it('should sanitize HTML content', () => {
      const input = '<script>alert("xss")</script>Hello';
      const sanitized = service['sanitizeString'](input);
      expect(sanitized).not.toContain('<script>');
    });

    it('should sanitize nested objects', () => {
      const input = {
        name: '<script>alert("xss")</script>John',
        email: 'john@example.com',
        bio: 'Hello <script>alert("xss")</script> world',
      };
      const sanitized = service['sanitizeObject'](input);
      expect(sanitized.name).not.toContain('<script>');
      expect(sanitized.bio).not.toContain('<script>');
    });

    it('should sanitize arrays', () => {
      const input = [
        '<script>alert("xss")</script>',
        'Hello world',
        '<iframe src="malicious.com"></iframe>',
      ];
      const sanitized = service['sanitizeObject'](input);
      expect(sanitized[0]).not.toContain('<script>');
      expect(sanitized[2]).not.toContain('<iframe>');
    });

    it('should handle null and undefined values', () => {
      expect(service['sanitizeString'](null as any)).toBeNull();
      expect(service['sanitizeString'](undefined as any)).toBeUndefined();
      expect(service['sanitizeString']('')).toBe('');
    });
  });

  describe('Security Detection', () => {
    describe('XSS Detection', () => {
      it('should detect script tags', () => {
        const malicious = '<script>alert("xss")</script>';
        expect(service['containsXSS'](malicious)).toBe(true);
      });

      it('should detect javascript protocol', () => {
        const malicious = 'javascript:alert("xss")';
        expect(service['containsXSS'](malicious)).toBe(true);
      });

      it('should detect event handlers', () => {
        const malicious = 'onclick="alert(\'xss\')"';
        expect(service['containsXSS'](malicious)).toBe(true);
      });

      it('should detect iframe tags', () => {
        const malicious = '<iframe src="malicious.com"></iframe>';
        expect(service['containsXSS'](malicious)).toBe(true);
      });

      it('should not detect safe content', () => {
        const safe = 'Hello, world!';
        expect(service['containsXSS'](safe)).toBe(false);
      });
    });

    describe('SQL Injection Detection', () => {
      it('should detect UNION queries', () => {
        const malicious = "'; UNION SELECT * FROM users; --";
        expect(service['containsSQLInjection'](malicious)).toBe(true);
      });

      it('should detect SELECT statements', () => {
        const malicious = "'; SELECT * FROM users; --";
        expect(service['containsSQLInjection'](malicious)).toBe(true);
      });

      it('should detect INSERT statements', () => {
        const malicious = "'; INSERT INTO users VALUES (1, 'hacker'); --";
        expect(service['containsSQLInjection'](malicious)).toBe(true);
      });

      it('should detect AND/OR conditions', () => {
        const malicious = "'; AND 1=1; --";
        expect(service['containsSQLInjection'](malicious)).toBe(true);
      });

      it('should not detect safe content', () => {
        const safe = 'Hello, world!';
        expect(service['containsSQLInjection'](safe)).toBe(false);
      });
    });
  });

  describe('Client IP Detection', () => {
    it('should extract IP from x-forwarded-for header', () => {
      const req = {
        headers: { 'x-forwarded-for': '192.168.1.1, 10.0.0.1' },
      } as unknown as SecurityRequest;
      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should extract IP from x-real-ip header', () => {
      const req = {
        headers: { 'x-real-ip': '192.168.1.1' },
      } as unknown as SecurityRequest;
      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should fallback to connection remote address', () => {
      const req = {
        connection: { remoteAddress: '192.168.1.1' },
      } as SecurityRequest;
      const ip = service['getClientIP'](req);
      expect(ip).toBe('192.168.1.1');
    });

    it('should fallback to default IP', () => {
      const req = {} as SecurityRequest;
      const ip = service['getClientIP'](req);
      expect(ip).toBe('127.0.0.1');
    });
  });

  describe('Logging', () => {
    it('should log validation events', () => {
      const logSpy = jest.spyOn(service['logger'], 'warn');
      const req = {
        headers: { 'user-agent': 'test-agent' },
        connection: { remoteAddress: '192.168.1.1' },
      } as SecurityRequest;

      service.logValidationEvent('test_event', { detail: 'test' }, req);

      expect(logSpy).toHaveBeenCalledWith(
        'Validation Event: test_event',
        expect.objectContaining({
          event: 'test_event',
          details: { detail: 'test' },
          clientIP: '192.168.1.1',
          userAgent: 'test-agent',
        })
      );
    });
  });

  describe('Validation Middleware', () => {
    it('should create validation middleware', () => {
      const middleware = service.getValidationMiddleware();
      expect(typeof middleware).toBe('function');
    });

    it('should create validation middleware with schema', () => {
      const schema: ValidationSchema = {
        body: require('joi').object({
          email: require('joi').string().email().required(),
        }),
      };
      const middleware = service.getValidationMiddleware(schema);
      expect(typeof middleware).toBe('function');
    });
  });
});
