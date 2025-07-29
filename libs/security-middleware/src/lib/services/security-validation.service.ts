import { Injectable, Logger } from '@nestjs/common';
import { body, param, query, ValidationChain } from 'express-validator';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class SecurityValidationService {
  private readonly logger = new Logger(SecurityValidationService.name);

  /**
   * Email validation chain
   */
  validateEmail(): ValidationChain {
    return body('email').isEmail().normalizeEmail();
  }

  /**
   * Password validation chain
   */
  validatePassword(): ValidationChain {
    return body('password')
      .isLength({ min: 8, max: 128 })
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .withMessage(
        'Password must contain at least 8 characters, including uppercase, lowercase, number, and special character'
      );
  }

  /**
   * UUID validation chain
   */
  validateUUID(): ValidationChain {
    return param('id').isUUID().withMessage('Invalid UUID format');
  }

  /**
   * Pagination query validation
   */
  validatePaginationQuery(): ValidationChain[] {
    return [
      query('page').optional().isInt({ min: 1 }).toInt(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    ];
  }

  /**
   * Detect malicious input patterns in request
   */
  detectMaliciousInput(req: SecurityRequest): string[] {
    const detectedPatterns: string[] = [];
    const inputs: string[] = [];

    // Collect all input strings
    if (req.body && typeof req.body === 'object') {
      this.collectStringInputs(req.body, inputs);
    }
    if (req.query && typeof req.query === 'object') {
      this.collectStringInputs(req.query, inputs);
    }
    if (req.params && typeof req.params === 'object') {
      this.collectStringInputs(req.params, inputs);
    }

    const maliciousPatterns = [
      {
        name: 'SQL Injection',
        regex:
          /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b.*\b(from|where|join|on|into|values|set|table|database|schema)\b)/i,
      },
      { name: 'XSS Script', regex: /<script[^>]*>[\s\S]*?<\/script>/i },
      { name: 'XSS Event Handler', regex: /\s*on\w+\s*=\s*["'][^"']*["']/i },
      { name: 'Path Traversal', regex: /\.\.[/\\]/g },
      { name: 'Command Injection', regex: /[;&|`$(){}[\]]/g },
      { name: 'LDAP Injection', regex: /[()=*&|!]/g },
      { name: 'XML Injection', regex: /<![\s\S]*?-->/g },
      { name: 'NoSQL Injection', regex: /\$where|\$ne|\$gt|\$lt|\$regex/i },
    ];

    for (const input of inputs) {
      for (const pattern of maliciousPatterns) {
        if (pattern.regex.test(input)) {
          detectedPatterns.push(
            `${pattern.name}: ${input.substring(0, 50)}...`
          );
          this.logger.warn(`Malicious input detected - ${pattern.name}:`, {
            input: input.substring(0, 100),
            clientIP: this.getClientIP(req),
            userAgent: req.headers['user-agent'],
            path: req.url,
          });
        }
      }
    }

    return detectedPatterns;
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(req: SecurityRequest): string {
    // Check various headers for the real IP when behind proxies
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    const cfConnectingIP = req.headers['cf-connecting-ip'];

    if (forwardedFor) {
      // x-forwarded-for can contain multiple IPs, take the first one
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ips.split(',')[0].trim();
    }

    if (realIP) {
      return Array.isArray(realIP) ? realIP[0] : realIP;
    }

    if (cfConnectingIP) {
      return Array.isArray(cfConnectingIP) ? cfConnectingIP[0] : cfConnectingIP;
    }

    return (
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      'unknown'
    );
  }

  /**
   * Recursively collect string inputs from an object
   */
  private collectStringInputs(obj: any, inputs: string[]): void {
    if (typeof obj === 'string') {
      inputs.push(obj);
    } else if (Array.isArray(obj)) {
      obj.forEach((item) => this.collectStringInputs(item, inputs));
    } else if (obj && typeof obj === 'object') {
      Object.values(obj).forEach((value) =>
        this.collectStringInputs(value, inputs)
      );
    }
  }
}
