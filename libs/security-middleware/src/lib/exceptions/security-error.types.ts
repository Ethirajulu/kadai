/**
 * Standardized security error response types
 */

export enum SecurityErrorCode {
  // Authentication errors
  AUTHENTICATION_REQUIRED = 'AUTHENTICATION_REQUIRED',
  INVALID_TOKEN = 'INVALID_TOKEN',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  INVALID_CREDENTIALS = 'INVALID_CREDENTIALS',
  
  // Authorization errors
  INSUFFICIENT_PERMISSIONS = 'INSUFFICIENT_PERMISSIONS',
  ACCESS_DENIED = 'ACCESS_DENIED',
  RESOURCE_FORBIDDEN = 'RESOURCE_FORBIDDEN',
  
  // Rate limiting errors
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TOO_MANY_REQUESTS = 'TOO_MANY_REQUESTS',
  BURST_LIMIT_EXCEEDED = 'BURST_LIMIT_EXCEEDED',
  
  // Input validation errors
  INVALID_INPUT = 'INVALID_INPUT',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  MALICIOUS_INPUT_DETECTED = 'MALICIOUS_INPUT_DETECTED',
  XSS_ATTEMPT_DETECTED = 'XSS_ATTEMPT_DETECTED',
  SQL_INJECTION_DETECTED = 'SQL_INJECTION_DETECTED',
  
  // Geographic and network errors
  GEOGRAPHIC_RESTRICTION = 'GEOGRAPHIC_RESTRICTION',
  IP_BLOCKED = 'IP_BLOCKED',
  UNTRUSTED_NETWORK = 'UNTRUSTED_NETWORK',
  
  // Configuration and system errors
  SECURITY_CONFIG_ERROR = 'SECURITY_CONFIG_ERROR',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  
  // Generic security errors
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  ATTACK_DETECTED = 'ATTACK_DETECTED',
}

export interface SecurityErrorResponse {
  /** HTTP status code */
  status: number;
  
  /** Standardized error code for client handling */
  code: SecurityErrorCode;
  
  /** Human-readable error message */
  message: string;
  
  /** Detailed error description (optional, for debugging) */
  detail?: string;
  
  /** Timestamp when the error occurred */
  timestamp: string;
  
  /** Unique request identifier for tracking */
  requestId: string;
  
  /** Path where the error occurred */
  path: string;
  
  /** Additional context specific to the error type */
  context?: SecurityErrorContext;
}

export interface SecurityErrorContext {
  /** Rate limiting specific context */
  rateLimit?: {
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter: number;
  };
  
  /** Authentication specific context */
  authentication?: {
    tokenType?: string;
    expiresAt?: number;
    issuer?: string;
  };
  
  /** Authorization specific context */
  authorization?: {
    requiredRole?: string;
    userRole?: string;
    requiredPermissions?: string[];
    userPermissions?: string[];
  };
  
  /** Validation specific context */
  validation?: {
    field?: string;
    rule?: string;
    providedValue?: any;
    expectedFormat?: string;
  };
  
  /** Geographic specific context */
  geographic?: {
    clientCountry?: string;
    allowedCountries?: string[];
    clientRegion?: string;
  };
  
  /** Network specific context */
  network?: {
    clientIp?: string;
    blockedReason?: string;
    trustLevel?: string;
  };
  
  /** System specific context */
  system?: {
    component?: string;
    serviceStatus?: string;
    retryable?: boolean;
    retryAfter?: number;
  };
}

export interface SecurityErrorMetadata {
  /** User ID if available */
  userId?: string;
  
  /** Session ID if available */
  sessionId?: string;
  
  /** Client IP address */
  clientIp?: string;
  
  /** User agent string */
  userAgent?: string;
  
  /** Request method */
  method?: string;
  
  /** Additional tracking data */
  tracking?: Record<string, any>;
}

/**
 * Security error severity levels
 */
export enum SecurityErrorSeverity {
  LOW = 'low',
  MEDIUM = 'medium', 
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Extended security error for internal processing
 */
export interface InternalSecurityError extends SecurityErrorResponse {
  /** Error severity for logging and alerting */
  severity: SecurityErrorSeverity;
  
  /** Additional metadata for audit and monitoring */
  metadata: SecurityErrorMetadata;
  
  /** Stack trace for debugging (internal only) */
  stack?: string;
  
  /** Original error that caused this security error */
  originalError?: Error;
  
  /** Whether this error should be reported to security monitoring */
  shouldReport: boolean;
  
  /** Whether this error indicates potential attack */
  isPotentialAttack: boolean;
}