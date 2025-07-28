import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import * as geoip from 'geoip-lite';
import { body, param, query, validationResult } from 'express-validator';
import {
  SecurityConfig,
  SecurityRequest,
  SecurityEventType,
  SecurityEventSeverity,
} from '../types/security.types';
import { SecurityAuditService } from './security-audit.service';

@Injectable()
export class SecurityService {
  private readonly logger = new Logger(SecurityService.name);
  private readonly config: SecurityConfig;

  constructor(
    private configService: ConfigService,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => SecurityAuditService))
    private auditService: SecurityAuditService
  ) {
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
        origin: (
          this.configService.get('CORS_ORIGINS', 'http://localhost:4200') ||
          'http://localhost:4200'
        ).split(','),
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
        allowedCountries: (
          this.configService.get('ALLOWED_COUNTRIES', 'IN,US,GB') || 'IN,US,GB'
        ).split(','),
        blockedCountries: (
          this.configService.get('BLOCKED_COUNTRIES', '') || ''
        )
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
    return async (req: SecurityRequest, res: any, next: any) => {
      const clientIP = this.getClientIP(req);

      // Check blacklist first
      if (this.config.ipWhitelist?.blacklist?.includes(clientIP)) {
        await this.logSecurityEvent(
          SecurityEventType.IP_BLOCKED,
          SecurityEventSeverity.HIGH,
          `Request blocked from blacklisted IP: ${clientIP}`,
          req,
          { reason: 'blacklisted_ip', ip: clientIP }
        );
        req.securityFlags = { ...req.securityFlags, ipBlocked: true };
        return res.status(403).json({ error: 'Access denied' });
      }

      // Check whitelist if configured
      if (this.config.ipWhitelist?.whitelist?.length) {
        if (!this.config.ipWhitelist.whitelist.includes(clientIP)) {
          await this.logSecurityEvent(
            SecurityEventType.IP_BLOCKED,
            SecurityEventSeverity.MEDIUM,
            `Request blocked from non-whitelisted IP: ${clientIP}`,
            req,
            { reason: 'not_whitelisted', ip: clientIP }
          );
          req.securityFlags = { ...req.securityFlags, ipBlocked: true };
          return res.status(403).json({ error: 'Access denied' });
        }
        req.isWhitelisted = true;
        await this.logSecurityEvent(
          SecurityEventType.IP_WHITELISTED,
          SecurityEventSeverity.LOW,
          `Request allowed from whitelisted IP: ${clientIP}`,
          req,
          { ip: clientIP }
        );
      }

      next();
    };
  }

  getGeoFilterMiddleware() {
    return async (req: SecurityRequest, res: any, next: any) => {
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
          await this.logSecurityEvent(
            SecurityEventType.GEO_BLOCKED,
            SecurityEventSeverity.HIGH,
            `Request blocked from blocked country: ${geoInfo.country}`,
            req,
            {
              reason: 'blocked_country',
              country: geoInfo.country,
              ip: clientIP,
              city: geoInfo.city,
              region: geoInfo.region,
            }
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
            await this.logSecurityEvent(
              SecurityEventType.GEO_BLOCKED,
              SecurityEventSeverity.MEDIUM,
              `Request blocked from non-allowed country: ${geoInfo.country}`,
              req,
              {
                reason: 'not_allowed_country',
                country: geoInfo.country,
                ip: clientIP,
                city: geoInfo.city,
                region: geoInfo.region,
              }
            );
            req.securityFlags = { ...req.securityFlags, geoBlocked: true };
            return res
              .status(403)
              .json({ error: 'Access denied from your location' });
          }
        }

        // Check for geographic anomalies (could indicate VPN/proxy usage)
        if (this.isGeographicAnomaly(req, geoInfo)) {
          await this.logSecurityEvent(
            SecurityEventType.GEO_ANOMALY,
            SecurityEventSeverity.MEDIUM,
            `Geographic anomaly detected for IP: ${clientIP}`,
            req,
            {
              country: geoInfo.country,
              ip: clientIP,
              city: geoInfo.city,
              region: geoInfo.region,
              anomaly_reason: 'rapid_geographic_change',
            }
          );
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

        await this.logSecurityEvent(
          SecurityEventType.GEO_ANOMALY,
          SecurityEventSeverity.LOW,
          `Unknown IP geolocation for: ${clientIP}`,
          req,
          {
            reason: 'unknown_geolocation',
            ip: clientIP,
            fallback_country: this.config.geoFilter?.fallbackCountry || 'IN',
          }
        );
      }

      next();
    };
  }

  getValidationMiddleware() {
    return async (req: SecurityRequest, res: any, next: any) => {
      // Check for validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await this.logSecurityEvent(
          SecurityEventType.VALIDATION_FAILURE,
          SecurityEventSeverity.MEDIUM,
          `Validation failed for request: ${req.method} ${req.path}`,
          req,
          {
            validation_errors: errors.array(),
            method: req.method,
            path: req.path,
          }
        );
        return res.status(400).json({
          error: 'Validation failed',
          details: errors.array(),
        });
      }

      // Check for malicious input patterns
      const maliciousPatterns = this.detectMaliciousInput(req);
      if (maliciousPatterns.length > 0) {
        await this.logSecurityEvent(
          SecurityEventType.MALICIOUS_INPUT_DETECTED,
          SecurityEventSeverity.HIGH,
          `Malicious input patterns detected: ${maliciousPatterns.join(', ')}`,
          req,
          {
            patterns: maliciousPatterns,
            body: req.body,
            method: req.method,
            path: req.path,
          }
        );
        // Continue processing but flag for monitoring
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
        if (
          obj instanceof Date ||
          obj instanceof RegExp ||
          obj instanceof Buffer
        ) {
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

  async logSecurityEvent(
    eventType: SecurityEventType,
    severity: SecurityEventSeverity,
    message: string,
    req?: SecurityRequest,
    details?: any,
    errorDetails?: string
  ): Promise<void> {
    const clientIP = req ? this.getClientIP(req) : 'unknown';
    const country = req?.ipInfo?.country || 'unknown';

    // Log to console
    this.logger.warn(`Security Event: ${eventType} - ${message}`, {
      eventType,
      severity,
      message,
      details,
      clientIP,
      country,
      timestamp: new Date().toISOString(),
      userAgent: req?.headers['user-agent'],
    });

    try {
      // Log to audit service
      const auditLogId = await this.auditService.logSecurityEvent(
        eventType,
        severity,
        message,
        req,
        details,
        errorDetails
      );

      // Emit event for monitoring
      this.eventEmitter.emit('security.audit.logged', {
        id: auditLogId,
        eventType,
        severity,
        message,
        timestamp: new Date(),
        sourceIp: clientIP,
        country,
        userId: req?.user?.id,
        details,
      });
    } catch (error) {
      this.logger.error('Failed to log security event to audit service', error);
    }
  }

  /**
   * Detect geographic anomalies that might indicate VPN/proxy usage
   */
  private isGeographicAnomaly(req: SecurityRequest, geoInfo: any): boolean {
    // This is a simplified implementation
    // In production, you might want to track user's typical locations
    // and flag rapid changes as anomalies

    // For now, just detect if the user agent suggests mobile but location is datacenter
    const userAgent = (req.headers['user-agent'] as string) || '';
    const isMobile = /Mobile|Android|iPhone|iPad/.test(userAgent);

    // Check if it's a known datacenter/hosting provider range
    // This is a very basic check - in production you'd use more sophisticated detection
    const isDatacenter =
      geoInfo.city?.toLowerCase().includes('data') ||
      geoInfo.city?.toLowerCase().includes('server') ||
      geoInfo.region?.toLowerCase().includes('aws') ||
      geoInfo.region?.toLowerCase().includes('google');

    return isMobile && isDatacenter;
  }

  /**
   * Detect malicious input patterns
   */
  private detectMaliciousInput(req: SecurityRequest): string[] {
    const patterns: string[] = [];
    const inputs = [
      JSON.stringify(req.body || {}),
      JSON.stringify(req.query || {}),
      JSON.stringify(req.params || {}),
      req.headers['user-agent'] || '',
      req.headers['referer'] || '',
    ];

    const maliciousPatterns = [
      // SQL Injection patterns
      {
        name: 'SQL_INJECTION',
        regex:
          /(\bselect\b|\bunion\b|\binsert\b|\bdelete\b|\bdrop\b|\bupdate\b).*(\bfrom\b|\bwhere\b|\binto\b)/gi,
      },
      {
        name: 'SQL_INJECTION_SIMPLE',
        regex: /('|"|;|--|\b(or|and)\b.*=.*=)/gi,
      },

      // XSS patterns
      { name: 'XSS_SCRIPT', regex: /<script[\s\S]*?>[\s\S]*?<\/script>/gi },
      { name: 'XSS_EVENTS', regex: /on\w+\s*=\s*["'][^"']*["']/gi },
      { name: 'XSS_JAVASCRIPT', regex: /javascript\s*:/gi },

      // Command injection
      { name: 'COMMAND_INJECTION', regex: /(\||;|&|`|\$\(|\${)/g },

      // Path traversal
      {
        name: 'PATH_TRAVERSAL',
        regex: /(\.\.[/\\]|[/\\]\.\.|%2e%2e%2f|%2e%2e%5c)/gi,
      },

      // LDAP injection
      {
        name: 'LDAP_INJECTION',
        regex:
          /(\*|\(|\)|\||&|!|=|<|>|~|%2a|%28|%29|%7c|%26|%21|%3d|%3c|%3e|%7e)/gi,
      },
    ];

    for (const input of inputs) {
      for (const pattern of maliciousPatterns) {
        if (pattern.regex.test(input)) {
          patterns.push(pattern.name);
        }
      }
    }

    return [...new Set(patterns)]; // Remove duplicates
  }
}
