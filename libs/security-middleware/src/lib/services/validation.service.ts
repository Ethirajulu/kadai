import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Joi from 'joi';
import { JSDOM } from 'jsdom';
import createDOMPurify from 'dompurify';
import {
  body,
  param,
  query,
  validationResult,
  ValidationChain,
} from 'express-validator';
import { 
  SecurityRequest, 
  SecurityResponse, 
  SecurityNextFunction,
  SecurityMiddleware
} from '../types/security.types';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export interface ValidationConfig {
  sanitizeInput: boolean;
  maxBodySize: string;
  maxParameterLength: number;
  enableXSSProtection: boolean;
  enableCSRFProtection: boolean;
  enableSQLInjectionProtection: boolean;
  allowedFileTypes: string[];
  maxFileSize: number;
  enableVirusScanning: boolean;
}

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);
  private readonly config: ValidationConfig;

  constructor(private configService: ConfigService) {
    this.config = this.loadValidationConfig();
  }

  private loadValidationConfig(): ValidationConfig {
    return {
      sanitizeInput: this.configService.get('VALIDATION_SANITIZE_INPUT', true),
      maxBodySize: this.configService.get('VALIDATION_MAX_BODY_SIZE', '10mb'),
      maxParameterLength: this.configService.get(
        'VALIDATION_MAX_PARAMETER_LENGTH',
        1000
      ),
      enableXSSProtection: this.configService.get(
        'VALIDATION_ENABLE_XSS_PROTECTION',
        true
      ),
      enableCSRFProtection: this.configService.get(
        'VALIDATION_ENABLE_CSRF_PROTECTION',
        true
      ),
      enableSQLInjectionProtection: this.configService.get(
        'VALIDATION_ENABLE_SQL_INJECTION_PROTECTION',
        true
      ),
      allowedFileTypes: (
        this.configService.get(
          'VALIDATION_ALLOWED_FILE_TYPES',
          'jpg,jpeg,png,gif,pdf,doc,docx'
        ) || 'jpg,jpeg,png,gif,pdf,doc,docx'
      ).split(','),
      maxFileSize: this.configService.get(
        'VALIDATION_MAX_FILE_SIZE',
        5 * 1024 * 1024
      ), // 5MB
      enableVirusScanning: this.configService.get(
        'VALIDATION_ENABLE_VIRUS_SCANNING',
        false
      ),
    };
  }

  // Generic validation middleware
  getValidationMiddleware(schema?: ValidationSchema): SecurityMiddleware {
    return async (req: SecurityRequest, res: SecurityResponse, next: SecurityNextFunction): Promise<void> => {
      try {
        // Apply Joi validation if schema provided
        if (schema) {
          await this.validateWithJoi(req, schema);
        }

        // Apply express-validator
        const validationChains = this.getValidationChains(req);
        await Promise.all(validationChains.map((chain) => chain.run(req)));

        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          this.logger.warn('Validation failed:', errors.array());
          res.status(400).json({
            error: 'Validation failed',
            details: errors.array(),
          });
          return;
        }

        // Sanitize input if enabled
        if (this.config.sanitizeInput) {
          this.sanitizeRequest(req);
        }

        next();
      } catch (error) {
        this.logger.error('Validation error:', error);
        res.status(400).json({
          error: 'Validation error',
          message:
            error instanceof Error ? error.message : 'Unknown validation error',
        });
        return;
      }
    };
  }

  // Joi validation
  private async validateWithJoi(
    req: SecurityRequest,
    schema: ValidationSchema
  ) {
    if (schema.body && req.body) {
      req.body = await schema.body.validateAsync(req.body);
    }
    if (schema.query && req.query) {
      req.query = await schema.query.validateAsync(req.query);
    }
    if (schema.params && req.params) {
      req.params = await schema.params.validateAsync(req.params);
    }
  }

  // Express-validator chains
  private getValidationChains(req: SecurityRequest): ValidationChain[] {
    const chains: ValidationChain[] = [];

    // Basic security validations
    if (this.config.enableXSSProtection) {
      chains.push(this.validateXSSProtection());
    }

    if (this.config.enableSQLInjectionProtection) {
      chains.push(this.validateSQLInjectionProtection());
    }

    if (this.config.enableCSRFProtection) {
      chains.push(this.validateCSRFProtection());
    }

    return chains;
  }

  // XSS Protection
  validateXSSProtection(): ValidationChain {
    return body('*').custom((value) => {
      if (typeof value === 'string' && this.containsXSS(value)) {
        throw new Error('Potential XSS attack detected');
      }
      return true;
    });
  }

  // SQL Injection Protection
  validateSQLInjectionProtection(): ValidationChain {
    return body('*').custom((value) => {
      if (typeof value === 'string' && this.containsSQLInjection(value)) {
        throw new Error('Potential SQL injection detected');
      }
      return true;
    });
  }

  // CSRF Protection
  validateCSRFProtection(): ValidationChain {
    return body('*').custom((value, { req }) => {
      if (
        req.method !== 'GET' &&
        req.method !== 'HEAD' &&
        req.method !== 'OPTIONS'
      ) {
        const csrfToken = req.headers?.['x-csrf-token'] || req.body._csrf;
        if (!csrfToken) {
          throw new Error('CSRF token required');
        }
        // Additional CSRF validation logic here
      }
      return true;
    });
  }

  // Common validation schemas
  getEmailValidation() {
    return body('email')
      .isEmail()
      .normalizeEmail()
      .withMessage('Invalid email format');
  }

  getPasswordValidation() {
    return body('password')
      .isLength({ min: 8 })
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .withMessage(
        'Password must contain at least 8 characters with uppercase, lowercase, number and special character'
      );
  }

  getUUIDValidation() {
    return param('id').isUUID().withMessage('Invalid UUID format');
  }

  getPaginationValidation() {
    return [
      query('page').optional().isInt({ min: 1 }).toInt(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    ];
  }

  // File upload validation
  getFileUploadValidation() {
    return body('file').custom((value, { req }) => {
      if (!req.file) {
        throw new Error('File is required');
      }

      // Check file type
      const fileExtension = req.file.originalname
        .split('.')
        .pop()
        ?.toLowerCase();
      if (!this.config.allowedFileTypes.includes(fileExtension)) {
        throw new Error(
          `File type not allowed. Allowed types: ${this.config.allowedFileTypes.join(
            ', '
          )}`
        );
      }

      // Check file size
      if (req.file.size > this.config.maxFileSize) {
        throw new Error(
          `File size exceeds maximum allowed size of ${
            this.config.maxFileSize / (1024 * 1024)
          }MB`
        );
      }

      return true;
    });
  }

  // Joi schemas for common validations
  getCommonSchemas() {
    return {
      email: Joi.string().email().required(),
      password: Joi.string()
        .min(8)
        .pattern(
          /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
        )
        .required(),
      uuid: Joi.string().uuid().required(),
      pagination: Joi.object({
        page: Joi.number().integer().min(1).default(1),
        limit: Joi.number().integer().min(1).max(100).default(10),
      }),
      user: Joi.object({
        email: Joi.string().email().required(),
        password: Joi.string()
          .min(8)
          .pattern(
            /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
          )
          .required(),
        name: Joi.string().min(2).max(100).required(),
        role: Joi.string().valid('user', 'admin', 'moderator').default('user'),
      }),
    };
  }

  // Sanitization methods
  private sanitizeRequest(req: SecurityRequest): void {
    if (req.body) {
      req.body = this.sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = this.sanitizeObject(req.query) as any;
    }
    if (req.params) {
      req.params = this.sanitizeObject(req.params) as any;
    }
  }

  private sanitizeObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }
    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  }

  private sanitizeString(str: string): string {
    if (!str || typeof str !== 'string') return str;

    // Use DOMPurify for HTML sanitization
    if (this.config.enableXSSProtection) {
      const window = new JSDOM('').window;
      const DOMPurify = createDOMPurify(window);
      str = DOMPurify.sanitize(str);
    }

    // Remove potentially dangerous patterns
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/[<>'"]/g, '') // Remove HTML characters
      .trim();
  }

  // Security detection methods
  private containsXSS(value: string): boolean {
    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /on\w+\s*=/gi,
      /<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi,
      /<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi,
      /<embed\b[^<]*(?:(?!<\/embed>)<[^<]*)*<\/embed>/gi,
    ];

    return xssPatterns.some((pattern) => pattern.test(value));
  }

  private containsSQLInjection(value: string): boolean {
    const sqlPatterns = [
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
      /(\b(and|or)\b\s+\d+\s*=\s*\d+)/gi,
      /(\b(and|or)\b\s+['"]\w+['"]\s*=\s*['"]\w+['"])/gi,
      /(\b(union|select|insert|update|delete|drop|create|alter)\b\s+.*\b(from|into|where|table|database)\b)/gi,
      /(\b(union|select|insert|update|delete|drop|create|alter)\b\s+.*\b(union|select|insert|update|delete|drop|create|alter)\b)/gi,
    ];

    return sqlPatterns.some((pattern) => pattern.test(value));
  }

  // Logging
  logValidationEvent(event: string, details: Record<string, unknown>, req?: SecurityRequest): void {
    const clientIP = req ? this.getClientIP(req) : 'unknown';

    this.logger.warn(`Validation Event: ${event}`, {
      event,
      details,
      clientIP,
      timestamp: new Date().toISOString(),
      userAgent: req?.headers['user-agent'],
    });
  }

  private getClientIP(req: SecurityRequest): string {
    return (
      (req.headers?.['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (req.headers?.['x-real-ip'] as string)?.trim() ||
      req.connection?.remoteAddress?.trim() ||
      req.socket?.remoteAddress?.trim() ||
      req.ip?.trim() ||
      '127.0.0.1'
    );
  }
}
