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