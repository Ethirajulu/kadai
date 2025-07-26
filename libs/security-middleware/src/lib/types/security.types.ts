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
  rateLimit?: {
    windowMs?: number;
    max?: number;
    message?: string;
    standardHeaders?: boolean;
    legacyHeaders?: boolean;
    skip?: (req: Request) => boolean;
    keyGenerator?: (req: Request) => string;
  };
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
  securityFlags?: {
    rateLimited?: boolean;
    geoBlocked?: boolean;
    ipBlocked?: boolean;
  };
}

export interface SecurityHeaders {
  'X-Content-Type-Options': string;
  'X-Frame-Options': string;
  'X-XSS-Protection': string;
  'Strict-Transport-Security': string;
  'Content-Security-Policy': string;
  'Referrer-Policy': string;
}