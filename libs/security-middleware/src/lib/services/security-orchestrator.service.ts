import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SecurityMiddlewareFactoryService } from './security-middleware-factory.service';
import { ConfigurableSanitizationService } from './configurable-sanitization.service';
import { SecurityValidationService } from './security-validation.service';
import { GeoSecurityService } from './geo-security.service';
import { SecurityAuditService } from './security-audit.service';
import {
  SecurityRequest,
  SecurityResponse,
  SecurityNextFunction,
  SecurityEventType,
  SecurityEventSeverity,
  // SecurityEventCategory removed as not used
} from '../types/security.types';

@Injectable()
export class SecurityOrchestratorService {
  private readonly logger = new Logger(SecurityOrchestratorService.name);

  constructor(
    private middlewareFactory: SecurityMiddlewareFactoryService,
    private sanitizationService: ConfigurableSanitizationService,
    private validationService: SecurityValidationService,
    private geoSecurityService: GeoSecurityService,
    private eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => SecurityAuditService))
    private auditService: SecurityAuditService
  ) {}

  /**
   * Get comprehensive security middleware that applies all security checks
   */
  getSecurityMiddleware() {
    return async (req: SecurityRequest, res: SecurityResponse, next: SecurityNextFunction): Promise<void> => {
      try {
        // 1. Detect malicious input
        const maliciousPatterns = this.validationService.detectMaliciousInput(req);
        if (maliciousPatterns.length > 0) {
          await this.auditService.logSecurityEvent(
            SecurityEventType.MALICIOUS_INPUT_DETECTED,
            SecurityEventSeverity.HIGH,
            `Malicious input detected: ${maliciousPatterns.join(', ')}`,
            req,
            { patterns: maliciousPatterns }
          );

          res.status(400).json({
            error: 'Invalid input detected',
            message: 'Request contains potentially malicious content',
          });
          return;
        }

        // 2. Sanitize input
        this.sanitizationService.sanitizeRequest(req);

        // 3. Perform geographic analysis
        const clientIP = this.getClientIP(req);
        const geoInfo = this.geoSecurityService.getGeoInfo(clientIP);
        
        if (geoInfo) {
          req.ipInfo = geoInfo;

          // Check if country is allowed
          if (!this.geoSecurityService.isCountryAllowed(geoInfo.country)) {
            await this.auditService.logSecurityEvent(
              SecurityEventType.GEO_BLOCKED,
              SecurityEventSeverity.MEDIUM,
              `Access blocked from country: ${geoInfo.country}`,
              req,
              { country: geoInfo.country, city: geoInfo.city }
            );

            res.status(403).json({
              error: 'Access denied',
              message: 'Access from your location is not permitted',
            });
            return;
          }

          // Check for geographic anomalies
          if (this.geoSecurityService.isGeographicAnomaly(req, geoInfo)) {
            await this.auditService.logSecurityEvent(
              SecurityEventType.GEO_ANOMALY,
              SecurityEventSeverity.MEDIUM,
              'Geographic anomaly detected',
              req,
              { country: geoInfo.country, city: geoInfo.city }
            );
          }
        }

        next();
      } catch (error) {
        this.logger.error('Security middleware error:', error);
        
        await this.auditService.logSecurityEvent(
          SecurityEventType.SECURITY_CONFIG_CHANGED,
          SecurityEventSeverity.HIGH,
          'Security middleware error',
          req,
          {},
          error instanceof Error ? error.message : 'Unknown error'
        );

        res.status(500).json({
          error: 'Security check failed',
          message: 'An error occurred during security validation',
        });
      }
    };
  }

  /**
   * Get individual middleware components
   */
  getHelmetMiddleware() {
    return this.middlewareFactory.getHelmetMiddleware();
  }

  getCorsMiddleware() {
    return this.middlewareFactory.getCorsMiddleware();
  }

  getRateLimitMiddleware() {
    return this.middlewareFactory.getRateLimitMiddleware();
  }

  /**
   * Get validation middleware components
   */
  getValidationService() {
    return this.validationService;
  }

  getSanitizationService() {
    return this.sanitizationService;
  }

  getGeoSecurityService() {
    return this.geoSecurityService;
  }

  /**
   * Log security event
   */
  async logSecurityEvent(
    event: string,
    details: Record<string, unknown>,
    req?: SecurityRequest
  ): Promise<void> {
    const clientIP = req ? this.getClientIP(req) : 'unknown';

    this.logger.warn(`Security Event: ${event}`, {
      event,
      details,
      clientIP,
      timestamp: new Date().toISOString(),
      userAgent: req?.headers['user-agent'],
      path: req?.url,
    });

    // Emit event for other services to handle
    this.eventEmitter.emit('security.event', {
      type: event,
      details,
      clientIP,
      timestamp: new Date(),
      request: req ? {
        url: req.url,
        method: req.method,
        headers: req.headers,
        userAgent: req.headers['user-agent'],
      } : null,
    });
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(req: SecurityRequest): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    const cfConnectingIP = req.headers['cf-connecting-ip'];
    
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ips.split(',')[0].trim();
    }
    
    if (realIP) {
      return Array.isArray(realIP) ? realIP[0] : realIP;
    }
    
    if (cfConnectingIP) {
      return Array.isArray(cfConnectingIP) ? cfConnectingIP[0] : cfConnectingIP;
    }
    
    return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
  }
}