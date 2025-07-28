import { Request } from 'express';

export interface SecurityConfig {
  helmet?: {
    contentSecurityPolicy?: boolean | object;
    crossOriginEmbedderPolicy?: boolean;
    crossOriginOpenerPolicy?: boolean;
    crossOriginResourcePolicy?: boolean | object;
    dnsPrefetchControl?: boolean;
    frameguard?: boolean | object;
    hidePoweredBy?: boolean;
    hsts?: boolean | object;
    ieNoOpen?: boolean;
    noSniff?: boolean;
    originAgentCluster?: boolean;
    permittedCrossDomainPolicies?: boolean;
    referrerPolicy?: boolean | object;
    xssFilter?: boolean;
  };
  cors?: {
    origin?: string | string[] | boolean | ((origin: string, callback: (err: Error | null, allow?: boolean) => void) => void);
    methods?: string | string[];
    allowedHeaders?: string | string[];
    exposedHeaders?: string | string[];
    credentials?: boolean;
    maxAge?: number;
    preflightContinue?: boolean;
    optionsSuccessStatus?: number;
  };
  rateLimit?: RateLimitConfig;
  ipWhitelist?: {
    whitelist?: string[];
    blacklist?: string[];
    trustProxy?: boolean;
  };
  geoFilter?: {
    allowedCountries?: string[];
    blockedCountries?: string[];
    fallbackCountry?: string;
  };
  validation?: {
    sanitizeInput?: boolean;
    maxBodySize?: string;
    maxParameterLength?: number;
  };
}

export interface IPInfo {
  country: string;
  region: string;
  city: string;
  ll: [number, number];
  metro: number;
  area: number;
}

export interface SecurityRequest extends Request {
  ipInfo?: IPInfo;
  isWhitelisted?: boolean;
  user?: {
    id: string;
    role: string;
    [key: string]: any;
  };
  securityFlags?: {
    rateLimited?: boolean;
    geoBlocked?: boolean;
    ipBlocked?: boolean;
    burstExceeded?: boolean;
  };
  rateLimitInfo?: {
    remaining: number;
    resetTime: number;
    totalHits: number;
    limit: number;
  };
}

export interface SecurityHeaders {
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Strict-Transport-Security': string;
  'Content-Security-Policy': string;
  'Referrer-Policy': string;
  'X-RateLimit-Limit'?: string;
  'X-RateLimit-Remaining'?: string;
  'X-RateLimit-Reset'?: string;
  'X-RateLimit-RetryAfter'?: string;
}

// Rate Limiting Types
export interface RateLimitConfig {
  enabled: boolean;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    connectTimeout?: number;
    lazyConnect?: boolean;
    retryDelayOnFailover?: number;
    maxRetriesPerRequest?: number;
    // Connection pool configuration
    poolSize?: number;
    healthCheckInterval?: number;
    enableOfflineQueue?: boolean;
    // Circuit breaker configuration
    circuitBreaker?: {
      enabled?: boolean;
      failureThreshold?: number;
      recoveryTimeout?: number;
      monitoringWindow?: number;
      expectedFailureRate?: number;
    };
  };
  defaultLimits: {
    anonymous: RateLimitRule;
    authenticated: RateLimitRule;
  };
  customLimits?: {
    [key: string]: RateLimitRule;
  };
  slidingWindow: {
    enabled: boolean;
    precision: number; // in seconds
  };
  adaptive: {
    enabled: boolean;
    cpuThreshold: number; // percentage
    memoryThreshold: number; // percentage
    loadFactor: number; // reduction factor when overloaded
  };
  whitelist: {
    ips: string[];
    skipPaths: string[];
    skipUserAgents?: string[];
  };
  headers: {
    includeHeaders: boolean;
    draft?: string; // RateLimit header draft version
  };
}

export interface RateLimitRule {
  requests: number; // number of requests allowed
  windowMs: number; // time window in milliseconds
  burst?: number; // burst limit for short periods
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: SecurityRequest) => string;
  skip?: (req: SecurityRequest) => boolean;
  message?: string | object;
  standardHeaders?: boolean;
  legacyHeaders?: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
  burstExceeded?: boolean;
  adaptiveLimit?: number;
  windowType?: 'fixed' | 'sliding';
  error?: string;
}

// Detailed interface for Redis response validation  
export interface ValidatedRedisResponse {
  current: number;
  remaining: number;
  resetTimeMs: number;
}

// Interface for burst check responses
export interface BurstCheckResponse {
  exceeded: boolean;
  count: number;
}


export interface RateLimitStatus {
  current: number;
  limit: number;
  remaining: number;
  resetTime: number;
  isAdaptive?: boolean;
  systemLoad?: {
    cpu: number;
    memory: number;
  };
}

export interface RateLimitOptions {
  request: SecurityRequest;
  isAuthenticated: boolean;
  customLimit?: RateLimitRule;
  windowType?: 'fixed' | 'sliding';
  checkBurst?: boolean;
  adaptive?: boolean;
}

export interface SystemLoad {
  cpu: number; // CPU usage percentage
  memory: number; // Memory usage percentage
}

// JWT Token Management Types
export interface JWTConfig {
  enabled: boolean;
  algorithm: 'HS256' | 'HS384' | 'HS512' | 'RS256' | 'RS384' | 'RS512';
  accessToken: {
    secret: string;
    expiresIn: string; // e.g., '15m', '30m'
    publicKey?: string; // For RSA algorithms
  };
  refreshToken: {
    secret: string;
    expiresIn: string; // e.g., '7d', '30d'
    publicKey?: string; // For RSA algorithms
  };
  issuer: string;
  audience: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
    keyPrefix?: string;
    connectTimeout?: number;
    lazyConnect?: boolean;
  };
  blacklist: {
    enabled: boolean;
    cleanupInterval: number; // milliseconds
    keyPrefix?: string;
  };
  refresh: {
    enabled: boolean;
    rotateTokens: boolean; // Generate new refresh token on refresh
    renewalThreshold: number; // milliseconds before expiry to allow refresh
    maxRefreshes?: number; // Maximum refreshes per token
  };
  security: {
    validateIssuer: boolean;
    validateAudience: boolean;
    validateSubject: boolean;
    clockTolerance: number; // seconds
    requireExpirationTime: boolean;
    requireNotBefore: boolean;
  };
}

// User role enum for type safety
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  SELLER = 'seller',
  MODERATOR = 'moderator'
}

// User interface for JWT operations
export interface User {
  id: string;
  email: string;
  role: UserRole;
  name?: string;
  permissions?: string[];
  isActive?: boolean;
}

export interface JWTTokenPayload {
  sub: string; // Subject (user ID)
  id: string; // User ID (alias for sub for compatibility)
  email?: string;
  role?: string; // Optional for refresh tokens
  name?: string;
  permissions?: string[];
  iat: number; // Issued at
  exp: number; // Expiration time
  iss: string; // Issuer
  aud: string; // Audience
  jti: string; // JWT ID (unique token identifier)
  tokenType: 'access' | 'refresh';
  sessionId?: string;
  deviceId?: string;
  ipAddress?: string;
  userAgent?: string;
  scope?: string[];
  refreshCount?: number; // For refresh tokens
}

export interface JWTTokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // Access token expiration in seconds
  tokenType: 'Bearer';
  refreshExpiresIn?: number; // Refresh token expiration in seconds
  issuedAt?: Date;
  scope?: string[];
}

export interface TokenValidationResult {
  valid: boolean;
  payload?: JWTTokenPayload;
  error?: string;
  expired?: boolean;
  blacklisted?: boolean;
  errorCode?: 'INVALID_TOKEN' | 'EXPIRED_TOKEN' | 'BLACKLISTED_TOKEN' | 'MALFORMED_TOKEN' | 'INVALID_SIGNATURE';
}

export interface TokenBlacklistEntry {
  jti: string; // JWT ID
  userId: string;
  tokenType: 'access' | 'refresh';
  blacklistedAt: Date;
  expiresAt: Date;
  reason: 'user_logout' | 'security_breach' | 'token_rotation' | 'manual_revocation' | 'user_disabled';
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
}

export interface TokenRefreshOptions {
  rotateRefreshToken?: boolean;
  extendExpiration?: boolean;
  validateDevice?: boolean;
  requireSecureContext?: boolean;
}

export interface TokenRefreshResult {
  success: boolean;
  tokens?: JWTTokenPair;
  error?: string;
  errorCode?: 'INVALID_REFRESH_TOKEN' | 'EXPIRED_REFRESH_TOKEN' | 'BLACKLISTED_TOKEN' | 'MAX_REFRESHES_EXCEEDED';
}

export interface JWTAuthRequest extends Omit<SecurityRequest, 'user'> {
  user?: JWTTokenPayload;
  token?: string;
  refreshToken?: string;
  tokenPayload?: JWTTokenPayload;
  isTokenRefreshed?: boolean;
  authError?: string;
}

export interface JWTSecurityOptions {
  requireAuth?: boolean;
  requireRoles?: string[];
  requirePermissions?: string[];
  allowRefreshToken?: boolean;
  validateDevice?: boolean;
  requireSecureContext?: boolean;
  maxTokenAge?: number; // Maximum token age in seconds
}

// Extend SecurityConfig to include JWT
export interface SecurityConfigWithJWT extends SecurityConfig {
  jwt?: JWTConfig;
}

// Security Audit and Monitoring Types
export enum SecurityEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_BLACKLIST = 'TOKEN_BLACKLIST',
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  
  // Authorization Events
  ACCESS_DENIED = 'ACCESS_DENIED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  ROLE_ESCALATION_ATTEMPT = 'ROLE_ESCALATION_ATTEMPT',
  
  // Rate Limiting Events
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  BURST_LIMIT_EXCEEDED = 'BURST_LIMIT_EXCEEDED',
  ADAPTIVE_RATE_LIMIT_TRIGGERED = 'ADAPTIVE_RATE_LIMIT_TRIGGERED',
  
  // IP and Geo Filtering Events
  IP_BLOCKED = 'IP_BLOCKED',
  IP_WHITELISTED = 'IP_WHITELISTED',
  GEO_BLOCKED = 'GEO_BLOCKED',
  GEO_ANOMALY = 'GEO_ANOMALY',
  
  // Validation and Input Events
  VALIDATION_FAILURE = 'VALIDATION_FAILURE',
  MALICIOUS_INPUT_DETECTED = 'MALICIOUS_INPUT_DETECTED',
  SQL_INJECTION_ATTEMPT = 'SQL_INJECTION_ATTEMPT',
  XSS_ATTEMPT = 'XSS_ATTEMPT',
  
  // System Events
  SECURITY_CONFIG_CHANGED = 'SECURITY_CONFIG_CHANGED',
  CIRCUIT_BREAKER_OPEN = 'CIRCUIT_BREAKER_OPEN',
  REDIS_CONNECTION_FAILURE = 'REDIS_CONNECTION_FAILURE',
  
  // Threat Detection Events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  BRUTE_FORCE_ATTEMPT = 'BRUTE_FORCE_ATTEMPT',
  ACCOUNT_ENUMERATION = 'ACCOUNT_ENUMERATION',
  PASSWORD_SPRAY_ATTACK = 'PASSWORD_SPRAY_ATTACK',
  CREDENTIAL_STUFFING = 'CREDENTIAL_STUFFING',
  
  // Data Protection Events
  SENSITIVE_DATA_ACCESS = 'SENSITIVE_DATA_ACCESS',
  DATA_EXFILTRATION_ATTEMPT = 'DATA_EXFILTRATION_ATTEMPT',
  UNAUTHORIZED_DATA_MODIFICATION = 'UNAUTHORIZED_DATA_MODIFICATION',
}

export enum SecurityEventSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export enum SecurityEventCategory {
  AUTHENTICATION = 'AUTHENTICATION',
  AUTHORIZATION = 'AUTHORIZATION',
  RATE_LIMITING = 'RATE_LIMITING',
  FILTERING = 'FILTERING',
  VALIDATION = 'VALIDATION',
  SYSTEM = 'SYSTEM',
  THREAT_DETECTION = 'THREAT_DETECTION',
  DATA_PROTECTION = 'DATA_PROTECTION',
}

export interface SecurityAuditLog {
  id: string;
  timestamp: Date;
  eventType: SecurityEventType;
  severity: SecurityEventSeverity;
  category: SecurityEventCategory;
  message: string;
  
  // Request context
  requestId?: string;
  sessionId?: string;
  userId?: string;
  username?: string;
  userRole?: string;
  
  // Network context
  sourceIp: string;
  userAgent?: string;
  requestMethod?: string;
  requestPath?: string;
  requestHeaders?: Record<string, string>;
  
  // Geographic context
  country?: string;
  region?: string;
  city?: string;
  
  // Additional context
  metadata?: Record<string, any>;
  errorDetails?: string;
  stackTrace?: string;
  
  // Correlation
  correlationId?: string;
  parentEventId?: string;
  
  // Processing
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolved: boolean;
  resolvedBy?: string;
  resolvedAt?: Date;
  notes?: string;
}

export interface SecurityAlert {
  id: string;
  timestamp: Date;
  title: string;
  description: string;
  severity: SecurityEventSeverity;
  category: SecurityEventCategory;
  eventType: SecurityEventType;
  
  // Alert details
  triggerCount: number;
  threshold?: number;
  timeWindow?: number; // in minutes
  
  // Related events
  relatedEvents: string[]; // Array of audit log IDs
  correlationId?: string;
  
  // Status
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED' | 'FALSE_POSITIVE';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  
  // Response actions
  actionsTaken?: string[];
  autoResponseEnabled: boolean;
  
  // Contact information
  notificationsSent: string[]; // email addresses or phone numbers
  escalationLevel: number;
}

export interface ThreatIndicator {
  id: string;
  timestamp: Date;
  type: 'IP' | 'USER' | 'PATTERN' | 'GEOLOCATION' | 'USER_AGENT';
  value: string;
  threatScore: number; // 0-100
  confidence: number; // 0-100
  
  // Detection details
  detectionRules: string[];
  evidenceEvents: string[]; // Array of audit log IDs
  
  // Metadata
  firstSeen: Date;
  lastSeen: Date;
  occurrenceCount: number;
  
  // Status
  status: 'ACTIVE' | 'EXPIRED' | 'BLOCKED' | 'WHITELISTED';
  expiresAt?: Date;
  
  // Response
  blockingEnabled: boolean;
  blockingReason?: string;
  whitelistReason?: string;
}

export interface SecurityMetrics {
  timestamp: Date;
  timeWindow: number; // in minutes
  
  // Event counts by type
  eventCounts: Record<SecurityEventType, number>;
  
  // Event counts by severity
  severityCounts: Record<SecurityEventSeverity, number>;
  
  // Authentication metrics
  totalLogins: number;
  successfulLogins: number;
  failedLogins: number;
  uniqueUsers: number;
  
  // Rate limiting metrics
  rateLimitHits: number;
  rateLimitBlocks: number;
  adaptiveAdjustments: number;
  
  // Geographic distribution
  topCountries: Array<{ country: string; count: number }>;
  blockedCountries: Array<{ country: string; count: number }>;
  
  // IP filtering metrics
  ipBlocks: number;
  uniqueBlockedIPs: number;
  whitelistHits: number;
  
  // Threat detection metrics
  threatsDetected: number;
  threatsBlocked: number;
  falsePositives: number;
  
  // System health
  redisConnectionStatus: 'HEALTHY' | 'DEGRADED' | 'DOWN';
  circuitBreakerStatus: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  averageResponseTime: number;
  errorRate: number;
}

export interface SecurityDashboardData {
  overview: {
    totalEvents: number;
    activeAlerts: number;
    threatsDetected: number;
    systemHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
  };
  
  recentEvents: SecurityAuditLog[];
  activeAlerts: SecurityAlert[];
  topThreats: ThreatIndicator[];
  metrics: SecurityMetrics;
  
  // Time series data for charts
  eventTimeSeries: Array<{
    timestamp: Date;
    eventType: SecurityEventType;
    count: number;
  }>;
  
  alertTimeSeries: Array<{
    timestamp: Date;
    severity: SecurityEventSeverity;
    count: number;
  }>;
  
  geoData: Array<{
    country: string;
    latitude: number;
    longitude: number;
    eventCount: number;
    threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  }>;
}

export interface SecurityMonitoringConfig {
  audit: {
    enabled: boolean;
    logLevel: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    maxLogSize: number; // in MB
    retentionDays: number;
    storageBackend: 'FILE' | 'DATABASE' | 'ELASTICSEARCH' | 'CLOUD';
    batchSize: number;
    flushInterval: number; // in seconds
  };
  
  alerting: {
    enabled: boolean;
    channels: Array<'EMAIL' | 'SMS' | 'WEBHOOK' | 'SLACK'>;
    emailConfig?: {
      smtpHost: string;
      smtpPort: number;
      username: string;
      password: string;
      fromAddress: string;
      recipients: string[];
    };
    webhookConfig?: {
      url: string;
      headers?: Record<string, string>;
      timeout: number;
    };
    rateLimiting: {
      maxAlertsPerMinute: number;
      cooldownPeriod: number; // in minutes
    };
  };
  
  threatDetection: {
    enabled: boolean;
    rules: Array<{
      id: string;
      name: string;
      description: string;
      eventTypes: SecurityEventType[];
      conditions: Array<{
        field: string;
        operator: 'equals' | 'contains' | 'regex' | 'greater_than' | 'less_than';
        value: any;
      }>;
      threshold: number;
      timeWindow: number; // in minutes
      severity: SecurityEventSeverity;
      autoBlock: boolean;
      blockDuration?: number; // in minutes
    }>;
    
    correlationRules: Array<{
      id: string;
      name: string;
      description: string;
      eventSequence: SecurityEventType[];
      maxTimeSpan: number; // in minutes
      minOccurrences: number;
      severity: SecurityEventSeverity;
    }>;
    
    ipReputationConfig?: {
      enabled: boolean;
      providers: string[];
      cacheTimeout: number; // in minutes
      scoreThreshold: number; // 0-100
    };
  };
  
  aggregation: {
    enabled: boolean;
    backends: Array<'ELASTICSEARCH' | 'SPLUNK' | 'DATADOG' | 'CUSTOM'>;
    elasticsearch?: {
      hosts: string[];
      username?: string;
      password?: string;
      index: string;
      mappingTemplate?: string;
    };
    custom?: {
      endpoint: string;
      headers?: Record<string, string>;
      batchSize: number;
      retryConfig: {
        maxRetries: number;
        backoffFactor: number;
      };
    };
  };
  
  dashboard: {
    enabled: boolean;
    refreshInterval: number; // in seconds
    historicalDataDays: number;
    maxEventsPerQuery: number;
  };
}