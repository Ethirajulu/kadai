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