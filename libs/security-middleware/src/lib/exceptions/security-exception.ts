import { HttpException, HttpStatus } from '@nestjs/common';
import {
  SecurityErrorCode,
  SecurityErrorResponse,
  SecurityErrorContext,
  SecurityErrorMetadata,
  SecurityErrorSeverity,
  InternalSecurityError,
} from './security-error.types';

/**
 * Base security exception class with standardized error formatting
 */
export class SecurityException extends HttpException {
  public readonly code: SecurityErrorCode;
  public readonly requestId: string;
  public readonly path: string;
  public readonly context?: SecurityErrorContext;
  public readonly severity: SecurityErrorSeverity;
  public readonly metadata: SecurityErrorMetadata;
  public readonly shouldReport: boolean;
  public readonly isPotentialAttack: boolean;

  constructor(
    code: SecurityErrorCode,
    message: string,
    httpStatus: HttpStatus = HttpStatus.FORBIDDEN,
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      context?: SecurityErrorContext;
      metadata?: SecurityErrorMetadata;
      severity?: SecurityErrorSeverity;
      shouldReport?: boolean;
      isPotentialAttack?: boolean;
      originalError?: Error;
    }
  ) {
    const timestamp = new Date().toISOString();
    const requestId =
      options?.requestId || SecurityException.generateRequestId();
    const path = options?.path || 'unknown';

    const errorResponse: SecurityErrorResponse = {
      status: httpStatus,
      code,
      message,
      detail: options?.detail,
      timestamp,
      requestId,
      path,
      context: options?.context,
    };

    super(errorResponse, httpStatus);

    this.code = code;
    this.requestId = requestId;
    this.path = path;
    this.context = options?.context;
    this.severity = options?.severity || SecurityErrorSeverity.MEDIUM;
    this.metadata = options?.metadata || {};
    this.shouldReport =
      options?.shouldReport ?? this.shouldReportByDefault(code);
    this.isPotentialAttack =
      options?.isPotentialAttack ?? this.isPotentialAttackByDefault(code);

    // Preserve original error stack for debugging
    if (options?.originalError) {
      this.stack = options.originalError.stack;
    }
  }

  /**
   * Convert to internal security error format for logging and monitoring
   */
  toInternalError(): InternalSecurityError {
    const response = this.getResponse() as SecurityErrorResponse;

    return {
      ...response,
      severity: this.severity,
      metadata: this.metadata,
      stack: this.stack,
      shouldReport: this.shouldReport,
      isPotentialAttack: this.isPotentialAttack,
    };
  }

  /**
   * Convert to client-safe response (removes sensitive information)
   */
  toClientResponse(): SecurityErrorResponse {
    const response = this.getResponse() as SecurityErrorResponse;

    // Remove sensitive context information for client
    const clientSafeContext = this.sanitizeContextForClient(response.context);

    return {
      ...response,
      detail: undefined, // Remove internal details
      context: clientSafeContext,
    };
  }

  /**
   * Generate unique request ID
   */
  private static generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine if error should be reported by default based on code
   */
  private shouldReportByDefault(code: SecurityErrorCode): boolean {
    const reportableCodes = [
      SecurityErrorCode.MALICIOUS_INPUT_DETECTED,
      SecurityErrorCode.XSS_ATTEMPT_DETECTED,
      SecurityErrorCode.SQL_INJECTION_DETECTED,
      SecurityErrorCode.ATTACK_DETECTED,
      SecurityErrorCode.SUSPICIOUS_ACTIVITY,
      SecurityErrorCode.BURST_LIMIT_EXCEEDED,
      SecurityErrorCode.SECURITY_VIOLATION,
    ];

    return reportableCodes.includes(code);
  }

  /**
   * Determine if error indicates potential attack by default
   */
  private isPotentialAttackByDefault(code: SecurityErrorCode): boolean {
    const attackCodes = [
      SecurityErrorCode.MALICIOUS_INPUT_DETECTED,
      SecurityErrorCode.XSS_ATTEMPT_DETECTED,
      SecurityErrorCode.SQL_INJECTION_DETECTED,
      SecurityErrorCode.ATTACK_DETECTED,
      SecurityErrorCode.BURST_LIMIT_EXCEEDED,
    ];

    return attackCodes.includes(code);
  }

  /**
   * Remove sensitive information from context for client response
   */
  private sanitizeContextForClient(
    context?: SecurityErrorContext
  ): SecurityErrorContext | undefined {
    if (!context) return undefined;

    return {
      rateLimit: context.rateLimit
        ? {
            limit: context.rateLimit.limit,
            remaining: context.rateLimit.remaining,
            resetTime: context.rateLimit.resetTime,
            retryAfter: context.rateLimit.retryAfter,
          }
        : undefined,

      // Remove sensitive authentication details
      authentication: context.authentication
        ? {
            tokenType: context.authentication.tokenType,
            // Remove expiresAt and issuer for security
          }
        : undefined,

      // Remove detailed authorization info
      authorization: context.authorization
        ? {
            requiredRole: context.authorization.requiredRole,
            // Remove user-specific data
          }
        : undefined,

      // Keep validation info but sanitize values
      validation: context.validation
        ? {
            field: context.validation.field,
            rule: context.validation.rule,
            expectedFormat: context.validation.expectedFormat,
            // Remove providedValue for security
          }
        : undefined,

      // Remove detailed geographic info
      geographic: context.geographic
        ? {
            // Remove specific location data
          }
        : undefined,

      // Remove network details
      network: context.network
        ? {
            // Remove IP and detailed network info
          }
        : undefined,

      // Keep system info but sanitize
      system: context.system
        ? {
            retryable: context.system.retryable,
            retryAfter: context.system.retryAfter,
            // Remove internal component details
          }
        : undefined,
    };
  }
}

/**
 * Specific security exception classes
 */

export class AuthenticationException extends SecurityException {
  constructor(
    message = 'Authentication required',
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      context?: SecurityErrorContext;
      metadata?: SecurityErrorMetadata;
      originalError?: Error;
    }
  ) {
    super(
      SecurityErrorCode.AUTHENTICATION_REQUIRED,
      message,
      HttpStatus.UNAUTHORIZED,
      {
        ...options,
        severity: SecurityErrorSeverity.MEDIUM,
      }
    );
  }
}

export class TokenExpiredException extends SecurityException {
  constructor(
    message = 'Token has expired',
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      context?: SecurityErrorContext;
      metadata?: SecurityErrorMetadata;
      originalError?: Error;
    }
  ) {
    super(SecurityErrorCode.TOKEN_EXPIRED, message, HttpStatus.UNAUTHORIZED, {
      ...options,
      severity: SecurityErrorSeverity.LOW,
    });
  }
}

export class RateLimitException extends SecurityException {
  constructor(
    message = 'Rate limit exceeded',
    rateLimitContext: {
      limit: number;
      remaining: number;
      resetTime: number;
      retryAfter: number;
    },
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      metadata?: SecurityErrorMetadata;
      originalError?: Error;
    }
  ) {
    super(
      SecurityErrorCode.RATE_LIMIT_EXCEEDED,
      message,
      HttpStatus.TOO_MANY_REQUESTS,
      {
        ...options,
        context: {
          rateLimit: rateLimitContext,
        },
        severity: SecurityErrorSeverity.MEDIUM,
      }
    );
  }
}

export class MaliciousInputException extends SecurityException {
  constructor(
    message = 'Malicious input detected',
    validationContext: {
      field?: string;
      rule?: string;
      expectedFormat?: string;
    },
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      metadata?: SecurityErrorMetadata;
      originalError?: Error;
    }
  ) {
    super(
      SecurityErrorCode.MALICIOUS_INPUT_DETECTED,
      message,
      HttpStatus.BAD_REQUEST,
      {
        ...options,
        context: {
          validation: validationContext,
        },
        severity: SecurityErrorSeverity.HIGH,
        shouldReport: true,
        isPotentialAttack: true,
      }
    );
  }
}

export class GeographicRestrictionException extends SecurityException {
  constructor(
    message = 'Access restricted from your location',
    geographicContext: {
      clientCountry?: string;
      allowedCountries?: string[];
    },
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      metadata?: SecurityErrorMetadata;
      originalError?: Error;
    }
  ) {
    super(
      SecurityErrorCode.GEOGRAPHIC_RESTRICTION,
      message,
      HttpStatus.FORBIDDEN,
      {
        ...options,
        context: {
          geographic: geographicContext,
        },
        severity: SecurityErrorSeverity.LOW,
      }
    );
  }
}

export class CircuitBreakerException extends SecurityException {
  constructor(
    message = 'Service temporarily unavailable',
    systemContext: {
      component?: string;
      retryAfter?: number;
    },
    options?: {
      detail?: string;
      requestId?: string;
      path?: string;
      metadata?: SecurityErrorMetadata;
      originalError?: Error;
    }
  ) {
    super(
      SecurityErrorCode.CIRCUIT_BREAKER_OPEN,
      message,
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        ...options,
        context: {
          system: {
            ...systemContext,
            retryable: true,
          },
        },
        severity: SecurityErrorSeverity.MEDIUM,
      }
    );
  }
}
