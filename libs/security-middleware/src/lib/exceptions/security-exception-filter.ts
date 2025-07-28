import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Injectable,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { SecurityException } from './security-exception';
import { SecurityErrorCode, SecurityErrorSeverity } from './security-error.types';

/**
 * Global exception filter for security-related errors
 * Provides standardized error responses and security monitoring
 */
@Injectable()
@Catch()
export class SecurityExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SecurityExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let securityException: SecurityException;

    // Convert various exception types to SecurityException
    if (exception instanceof SecurityException) {
      securityException = exception;
    } else if (exception instanceof HttpException) {
      securityException = this.convertHttpExceptionToSecurityException(exception, request);
    } else if (exception instanceof Error) {
      securityException = this.convertErrorToSecurityException(exception, request);
    } else {
      securityException = this.createUnknownSecurityException(exception, request);
    }

    // Log the security exception
    this.logSecurityException(securityException, request);

    // Send standardized response to client
    const clientResponse = securityException.toClientResponse();
    
    // Set security headers
    this.setSecurityHeaders(response, securityException);
    
    response.status(clientResponse.status).json(clientResponse);
  }

  /**
   * Convert HttpException to SecurityException
   */
  private convertHttpExceptionToSecurityException(
    exception: HttpException,
    request: Request
  ): SecurityException {
    const status = exception.getStatus();
    const message = exception.message;
    
    // Map HTTP status codes to security error codes
    let code: SecurityErrorCode;
    let severity: SecurityErrorSeverity;
    
    switch (status) {
      case HttpStatus.UNAUTHORIZED:
        code = SecurityErrorCode.AUTHENTICATION_REQUIRED;
        severity = SecurityErrorSeverity.MEDIUM;
        break;
      case HttpStatus.FORBIDDEN:
        code = SecurityErrorCode.ACCESS_DENIED;
        severity = SecurityErrorSeverity.MEDIUM;
        break;
      case HttpStatus.TOO_MANY_REQUESTS:
        code = SecurityErrorCode.TOO_MANY_REQUESTS;
        severity = SecurityErrorSeverity.MEDIUM;
        break;
      case HttpStatus.BAD_REQUEST:
        code = SecurityErrorCode.INVALID_INPUT;
        severity = SecurityErrorSeverity.LOW;
        break;
      default:
        code = SecurityErrorCode.SECURITY_VIOLATION;
        severity = SecurityErrorSeverity.LOW;
    }

    return new SecurityException(
      code,
      message,
      status,
      {
        path: request.url,
        metadata: this.extractMetadata(request),
        severity,
        originalError: exception,
      }
    );
  }

  /**
   * Convert generic Error to SecurityException
   */
  private convertErrorToSecurityException(
    error: Error,
    request: Request
  ): SecurityException {
    // Analyze error message for security implications
    const message = error.message.toLowerCase();
    let code: SecurityErrorCode;
    let severity: SecurityErrorSeverity;
    let isPotentialAttack = false;

    if (message.includes('jwt') || message.includes('token')) {
      code = SecurityErrorCode.INVALID_TOKEN;
      severity = SecurityErrorSeverity.MEDIUM;
    } else if (message.includes('rate') || message.includes('limit')) {
      code = SecurityErrorCode.RATE_LIMIT_EXCEEDED;
      severity = SecurityErrorSeverity.MEDIUM;
    } else if (message.includes('validation') || message.includes('invalid')) {
      code = SecurityErrorCode.VALIDATION_FAILED;
      severity = SecurityErrorSeverity.LOW;
    } else if (message.includes('script') || message.includes('injection')) {
      code = SecurityErrorCode.MALICIOUS_INPUT_DETECTED;
      severity = SecurityErrorSeverity.HIGH;
      isPotentialAttack = true;
    } else {
      code = SecurityErrorCode.SECURITY_VIOLATION;
      severity = SecurityErrorSeverity.MEDIUM;
    }

    return new SecurityException(
      code,
      error.message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        path: request.url,
        metadata: this.extractMetadata(request),
        severity,
        isPotentialAttack,
        originalError: error,
      }
    );
  }

  /**
   * Create SecurityException for unknown exception types
   */
  private createUnknownSecurityException(
    exception: unknown,
    request: Request
  ): SecurityException {
    const message = 'An unexpected security error occurred';
    
    return new SecurityException(
      SecurityErrorCode.SECURITY_VIOLATION,
      message,
      HttpStatus.INTERNAL_SERVER_ERROR,
      {
        detail: String(exception),
        path: request.url,
        metadata: this.extractMetadata(request),
        severity: SecurityErrorSeverity.HIGH,
        shouldReport: true,
      }
    );
  }

  /**
   * Extract metadata from request for security context
   */
  private extractMetadata(request: Request): any {
    return {
      clientIp: this.getClientIp(request),
      userAgent: request.headers['user-agent'],
      method: request.method,
      url: request.url,
      timestamp: new Date().toISOString(),
      headers: this.sanitizeHeaders(request.headers),
    };
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(request: Request): string {
    return (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      'unknown'
    );
  }

  /**
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sensitiveHeaders = ['authorization', 'cookie', 'x-api-key', 'x-auth-token'];
    const sanitized = { ...headers };

    sensitiveHeaders.forEach(header => {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    });

    return sanitized;
  }

  /**
   * Log security exception with appropriate level
   */
  private logSecurityException(exception: SecurityException, request: Request): void {
    const internalError = exception.toInternalError();
    const logContext = {
      code: internalError.code,
      severity: internalError.severity,
      requestId: internalError.requestId,
      path: internalError.path,
      clientIp: internalError.metadata.clientIp,
      userAgent: internalError.metadata.userAgent,
      isPotentialAttack: internalError.isPotentialAttack,
    };

    switch (internalError.severity) {
      case SecurityErrorSeverity.CRITICAL:
        this.logger.error(
          `CRITICAL SECURITY ERROR: ${internalError.message}`,
          internalError.stack,
          logContext
        );
        break;
      case SecurityErrorSeverity.HIGH:
        this.logger.error(
          `HIGH SECURITY ERROR: ${internalError.message}`,
          logContext
        );
        break;
      case SecurityErrorSeverity.MEDIUM:
        this.logger.warn(
          `MEDIUM SECURITY ERROR: ${internalError.message}`,
          logContext
        );
        break;
      case SecurityErrorSeverity.LOW:
        this.logger.log(
          `LOW SECURITY ERROR: ${internalError.message}`,
          logContext
        );
        break;
    }

    // Report to security monitoring system if needed
    if (internalError.shouldReport) {
      this.reportToSecurityMonitoring(internalError);
    }
  }

  /**
   * Set security-related headers on response
   */
  private setSecurityHeaders(response: Response, exception: SecurityException): void {
    // Set security headers
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('X-XSS-Protection', '1; mode=block');

    // Set rate limiting headers if applicable
    if (exception.context?.rateLimit) {
      const rateLimit = exception.context.rateLimit;
      response.setHeader('X-RateLimit-Limit', rateLimit.limit);
      response.setHeader('X-RateLimit-Remaining', rateLimit.remaining);
      response.setHeader('X-RateLimit-Reset', rateLimit.resetTime);
      
      if (rateLimit.retryAfter) {
        response.setHeader('Retry-After', rateLimit.retryAfter);
      }
    }

    // Set system headers if applicable
    if (exception.context?.system?.retryAfter) {
      response.setHeader('Retry-After', exception.context.system.retryAfter);
    }
  }

  /**
   * Report security incidents to monitoring system
   */
  private reportToSecurityMonitoring(error: any): void {
    // TODO: Integrate with security monitoring service
    // This could send to SIEM, security alerting system, etc.
    this.logger.error('SECURITY INCIDENT REPORTED', {
      code: error.code,
      severity: error.severity,
      requestId: error.requestId,
      isPotentialAttack: error.isPotentialAttack,
      timestamp: error.timestamp,
    });
  }
}