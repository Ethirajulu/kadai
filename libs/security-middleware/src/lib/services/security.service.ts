import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import * as geoip from 'geoip-lite';
import { body, param, query, validationResult } from 'express-validator';
import { SecurityConfig, SecurityRequest } from '../types/security.types';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly config: SecurityConfig;

  constructor(private configService: ConfigService) {
    this.config = this.loadSecurityConfig();
  }

  private loadSecurityConfig(): SecurityConfig {
    return {
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      },
      cors: {
        origin: (this.configService.get('CORS_ORIGINS', 'http://localhost:4200') || 'http://localhost:4200')
          .split(','),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
        credentials: true,
        maxAge: 86400,
      },
      rateLimit: {
        enabled: false, // Disabled by default in SecurityService
        redis: {
          host: 'localhost',
          port: 6379,
          keyPrefix: 'rate_limit:',
        },
        defaultLimits: {
          anonymous: {
            requests: 100,
            windowMs: 15 * 60 * 1000,
            message: 'Too many requests from this IP, please try again later.',
          },
          authenticated: {
            requests: 200,
            windowMs: 15 * 60 * 1000,
            message: 'Too many requests, please try again later.',
          },
        },
        slidingWindow: {
          enabled: false,
          precision: 60,
        },
        adaptive: {
          enabled: false,
          cpuThreshold: 80,
          memoryThreshold: 85,
          loadFactor: 0.5,
        },
        whitelist: {
          ips: ['127.0.0.1', '::1'],
          skipPaths: ['/health', '/metrics'],
        },
        headers: {
          includeHeaders: true,
        },
      },
      ipWhitelist: {
        whitelist: (this.configService.get('IP_WHITELIST', '') || '')
          .split(',')
          .filter(Boolean),
        blacklist: (this.configService.get('IP_BLACKLIST', '') || '')
          .split(',')
          .filter(Boolean),
        trustProxy: true,
      },
      geoFilter: {
        allowedCountries: (this.configService.get('ALLOWED_COUNTRIES', 'IN,US,GB') || 'IN,US,GB')
          .split(','),
        blockedCountries: (this.configService.get('BLOCKED_COUNTRIES', '') || '')
          .split(',')
          .filter(Boolean),
        fallbackCountry: 'IN',
      },
      validation: {
        sanitizeInput: true,
        maxBodySize: '10mb',
        maxParameterLength: 1000,
      },
    };
  }

  getHelmetMiddleware() {
    this.logger.log('Configuring Helmet security headers');
    return helmet(this.config.helmet);
  }

  getCorsMiddleware() {
    this.logger.log('Configuring CORS middleware');
    return cors(this.config.cors as any);
  }

  getRateLimitMiddleware() {
    this.logger.log('Configuring rate limiting middleware');
    return rateLimit(this.config.rateLimit as any);
  }

  getIPFilterMiddleware() {
    return (req: SecurityRequest, res: any, next: any) => {
      const clientIP = this.getClientIP(req);

      // Check blacklist first
      if (this.config.ipWhitelist?.blacklist?.includes(clientIP)) {
        this.logger.warn(`Blocked request from blacklisted IP: ${clientIP}`);
        req.securityFlags = { ...req.securityFlags, ipBlocked: true };
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check whitelist if configured
      if (this.config.ipWhitelist?.whitelist?.length) {
        if (!this.config.ipWhitelist.whitelist.includes(clientIP)) {
          this.logger.warn(
            `Blocked request from non-whitelisted IP: ${clientIP}`
          );
          req.securityFlags = { ...req.securityFlags, ipBlocked: true };
          return res.status(403).json({ error: 'Access denied' });
        }
        req.isWhitelisted = true;
      }

      next();
    };
  }

  getGeoFilterMiddleware() {
    return (req: SecurityRequest, res: any, next: any) => {
      const clientIP = this.getClientIP(req);
      const geoInfo = geoip.lookup(clientIP);

      if (geoInfo) {
        req.ipInfo = {
          country: geoInfo.country,
          region: geoInfo.region,
          city: geoInfo.city,
          ll: geoInfo.ll,
          metro: geoInfo.metro || 0,
          area: geoInfo.area || 0,
        };

        // Check blocked countries
        if (
          this.config.geoFilter?.blockedCountries?.includes(geoInfo.country)
        ) {
          this.logger.warn(
            `Blocked request from blocked country: ${geoInfo.country} (IP: ${clientIP})`
          );
          req.securityFlags = { ...req.securityFlags, geoBlocked: true };
          return res
            .status(403)
            .json({ error: 'Access denied from your location' });
        }

        // Check allowed countries
        if (this.config.geoFilter?.allowedCountries?.length) {
          if (
            !this.config.geoFilter.allowedCountries.includes(geoInfo.country)
          ) {
            this.logger.warn(
              `Blocked request from non-allowed country: ${geoInfo.country} (IP: ${clientIP})`
            );
            req.securityFlags = { ...req.securityFlags, geoBlocked: true };
            return res
              .status(403)
              .json({ error: 'Access denied from your location' });
          }
        }
      } else {
        // Use fallback country for unknown IPs
        req.ipInfo = {
          country: this.config.geoFilter?.fallbackCountry || 'IN',
          region: 'Unknown',
          city: 'Unknown',
          ll: [0, 0],
          metro: 0,
          area: 0,
        };
      }

      next();
    };
  }

  getValidationMiddleware() {
    return (req: SecurityRequest, res: any, next: any) => {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        this.logger.warn('Validation failed:', errors.array());
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      // Sanitize input if enabled
      if (this.config.validation?.sanitizeInput) {
        this.sanitizeRequest(req);
      }

      next();
    };
  }

  // Validation rules
  validateEmail() {
    return body('email').isEmail().normalizeEmail();
  }

  validatePassword() {
    return body('password')
      .isLength({ min: 8 })
      .matches(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/
      )
      .withMessage(
        'Password must contain at least 8 characters with uppercase, lowercase, number and special character'
      );
  }

  validateUUID() {
    return param('id').isUUID().withMessage('Invalid UUID format');
  }

  validatePaginationQuery() {
    return [
      query('page').optional().isInt({ min: 1 }).toInt(),
      query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    ];
  }

  private getClientIP(req: SecurityRequest): string {
    if (this.config.ipWhitelist?.trustProxy) {
      return (
        (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
        (req.headers['x-real-ip'] as string) ||
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip ||
        '127.0.0.1'
      );
    }
    return (
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1'
    );
  }

  private sanitizeRequest(req: SecurityRequest): void {
    // Recursively sanitize object properties
    const sanitizeObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return this.sanitizeString(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      }
      if (obj && typeof obj === 'object') {
        // Preserve special object types like Date, RegExp, etc.
        if (obj instanceof Date || obj instanceof RegExp || obj instanceof Buffer) {
          return obj;
        }
        const sanitized: any = {};
        for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = sanitizeObject(value);
        }
        return sanitized;
      }
      return obj;
    };

    if (req.body) {
      req.body = sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = sanitizeObject(req.query);
    }
    if (req.params) {
      req.params = sanitizeObject(req.params);
    }
  }

  private sanitizeString(str: string): string {
    if (!str || typeof str !== 'string') return str;

    // Check for dangerous patterns first
    if (
      str.includes('javascript:') ||
      str.includes('onclick=') ||
      str.includes('onload=') ||
      str.includes('onerror=') ||
      str.includes('onmouseover=') ||
      str.includes('onfocus=') ||
      str.includes('onblur=') ||
      str.includes('onchange=') ||
      str.includes('onsubmit=') ||
      str.includes('onreset=') ||
      str.includes('onselect=') ||
      str.includes('onunload=') ||
      str.includes('onabort=') ||
      str.includes('onbeforeunload=') ||
      str.includes('onerror=') ||
      str.includes('onhashchange=') ||
      str.includes('onmessage=') ||
      str.includes('onoffline=') ||
      str.includes('ononline=') ||
      str.includes('onpagehide=') ||
      str.includes('onpageshow=') ||
      str.includes('onpopstate=') ||
      str.includes('onresize=') ||
      str.includes('onstorage=') ||
      str.includes('oncontextmenu=') ||
      str.includes('oninput=') ||
      str.includes('oninvalid=') ||
      str.includes('onsearch=') ||
      str.includes('onkeydown=') ||
      str.includes('onkeypress=') ||
      str.includes('onkeyup=') ||
      str.includes('onmousedown=') ||
      str.includes('onmousemove=') ||
      str.includes('onmouseout=') ||
      str.includes('onmouseup=') ||
      str.includes('onwheel=') ||
      str.includes('ondrag=') ||
      str.includes('ondragend=') ||
      str.includes('ondragenter=') ||
      str.includes('ondragleave=') ||
      str.includes('ondragover=') ||
      str.includes('ondragstart=') ||
      str.includes('ondrop=') ||
      str.includes('oncopy=') ||
      str.includes('oncut=') ||
      str.includes('onpaste=') ||
      str.includes('onbeforecopy=') ||
      str.includes('onbeforecut=') ||
      str.includes('onbeforepaste=') ||
      str.includes('onselectstart=') ||
      str.includes('onselectionchange=')
    ) {
      return '';
    }

    // Remove potentially dangerous characters and patterns
    const sanitized = str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .replace(/&/g, ' ') // Replace & with space
      .replace(/\s+/g, ' ') // Normalize multiple spaces to single space
      .trim();

    return sanitized;
  }

  logSecurityEvent(event: string, details: any, req?: SecurityRequest): void {
    const clientIP = req ? this.getClientIP(req) : 'unknown';
    const country = req?.ipInfo?.country || 'unknown';

    this.logger.warn(`Security Event: ${event}`, {
      event,
      details,
      clientIP,
      country,
      timestamp: new Date().toISOString(),
      userAgent: req?.headers['user-agent'],
    });
  }
}
