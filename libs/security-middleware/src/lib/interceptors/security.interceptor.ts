import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { SecurityService } from '../services/security.service';
import { SecurityRequest, SecurityEventType, SecurityEventSeverity } from '../types/security.types';

@Injectable()
export class SecurityInterceptor implements NestInterceptor {
  private readonly logger = new Logger(SecurityInterceptor.name);

  constructor(private readonly securityService: SecurityService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const response = context.switchToHttp().getResponse();
    const startTime = Date.now();

    // Add security headers to response
    this.addSecurityHeaders(response);

    // Log request for security monitoring
    this.logSecurityRequest(request);

    return next.handle().pipe(
      tap((data) => {
        const duration = Date.now() - startTime;
        this.logSecurityResponse(request, response, duration, true);
      }),
      catchError((error) => {
        const duration = Date.now() - startTime;
        this.logSecurityResponse(request, response, duration, false, error);

        // Log security events for specific error types
        if (error.status === 401) {
          this.securityService.logSecurityEvent(
            SecurityEventType.ACCESS_DENIED,
            SecurityEventSeverity.HIGH,
            'Unauthorized access attempt',
            request,
            {
              path: request.path,
              method: request.method,
              error: error.message,
            }
          );
        } else if (error.status === 403) {
          this.securityService.logSecurityEvent(
            SecurityEventType.PERMISSION_DENIED,
            SecurityEventSeverity.HIGH,
            'Forbidden access attempt',
            request,
            {
              path: request.path,
              method: request.method,
              error: error.message,
            }
          );
        } else if (error.status === 429) {
          this.securityService.logSecurityEvent(
            SecurityEventType.RATE_LIMIT_EXCEEDED,
            SecurityEventSeverity.MEDIUM,
            'Rate limit exceeded',
            request,
            {
              path: request.path,
              method: request.method,
            }
          );
        }

        throw error;
      })
    );
  }

  private addSecurityHeaders(response: any): void {
    if (!response || typeof response.setHeader !== 'function') {
      throw new Error('Invalid response object');
    }

    // Additional security headers beyond helmet
    response.setHeader('X-Request-ID', this.generateRequestId());
    response.setHeader('X-API-Version', '1.0');
    response.setHeader(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, private'
    );
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');

    // Remove server information
    response.removeHeader('X-Powered-By');
    response.removeHeader('Server');
  }

  private logSecurityRequest(request: SecurityRequest): void {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key'];
    const sanitizedHeaders = { ...(request.headers || {}) };

    // Mask sensitive headers
    sensitiveHeaders.forEach((header) => {
      if (sanitizedHeaders[header]) {
        sanitizedHeaders[header] = '[MASKED]';
      }
    });

    this.logger.log('Security Request', {
      method: request.method,
      path: request.path,
      ip: request.ip,
      userAgent: request.headers?.['user-agent'],
      country: request.ipInfo?.country,
      isWhitelisted: request.isWhitelisted,
      securityFlags: request.securityFlags,
      headers: sanitizedHeaders,
    });
  }

  private logSecurityResponse(
    request: SecurityRequest,
    response: any,
    duration: number,
    success: boolean,
    error?: any
  ): void {
    const logData = {
      method: request.method,
      path: request.path,
      statusCode: response.statusCode,
      duration,
      success,
      ip: request.ip,
      country: request.ipInfo?.country,
    };

    if (error) {
      this.logger.error('Security Response Error', {
        ...logData,
        error: error.message,
        stack: error.stack,
      });
    } else {
      this.logger.log('Security Response', logData);
    }
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
