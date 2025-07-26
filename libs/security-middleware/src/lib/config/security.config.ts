import { registerAs } from '@nestjs/config';
import { SecurityConfig } from '../types/security.types';

export default registerAs('security', (): SecurityConfig => ({
  helmet: {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        scriptSrc: ["'self'", "'unsafe-eval'"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:", "blob:"],
        connectSrc: ["'self'", "https://api.kadai.in", "wss:"],
        mediaSrc: ["'self'"],
        objectSrc: ["'none'"],
        childSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : undefined,
      },
    },
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    crossOriginEmbedderPolicy: false, // Disable for better compatibility
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  },
  cors: {
    origin: (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:3000').split(','),
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
      'Origin',
      'Cache-Control',
      'X-File-Name',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-API-Version',
      'X-Rate-Limit-Limit',
      'X-Rate-Limit-Remaining',
      'X-Rate-Limit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
    preflightContinue: false,
    optionsSuccessStatus: 204,
  },
  ipWhitelist: {
    whitelist: (process.env.IP_WHITELIST || '').split(',').filter(Boolean),
    blacklist: (process.env.IP_BLACKLIST || '').split(',').filter(Boolean),
    trustProxy: process.env.TRUST_PROXY === 'true',
  },
  geoFilter: {
    allowedCountries: (process.env.ALLOWED_COUNTRIES || 'IN,US,GB,CA,AU,SG,AE').split(','),
    blockedCountries: (process.env.BLOCKED_COUNTRIES || 'CN,RU,KP,IR').split(','),
    fallbackCountry: process.env.FALLBACK_COUNTRY || 'IN',
  },
  validation: {
    sanitizeInput: process.env.SANITIZE_INPUT !== 'false',
    maxBodySize: process.env.MAX_BODY_SIZE || '10mb',
    maxParameterLength: parseInt(process.env.MAX_PARAMETER_LENGTH || '1000', 10),
  },
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_RATE_LIMIT_DB || '1', 10),
      keyPrefix: process.env.REDIS_RATE_LIMIT_PREFIX || 'rate_limit:',
      connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
      lazyConnect: true,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    },
    defaultLimits: {
      anonymous: {
        requests: parseInt(process.env.RATE_LIMIT_ANONYMOUS_REQUESTS || '100', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_ANONYMOUS_WINDOW_MS || '900000', 10), // 15 minutes
        burst: parseInt(process.env.RATE_LIMIT_ANONYMOUS_BURST || '20', 10),
        message: 'Too many requests from this IP. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
      },
      authenticated: {
        requests: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_REQUESTS || '200', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_WINDOW_MS || '900000', 10), // 15 minutes
        burst: parseInt(process.env.RATE_LIMIT_AUTHENTICATED_BURST || '50', 10),
        message: 'Too many requests. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
      },
    },
    customLimits: {
      // Login endpoint - stricter limits
      'POST:/api/auth/login': {
        requests: parseInt(process.env.RATE_LIMIT_LOGIN_REQUESTS || '5', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_LOGIN_WINDOW_MS || '900000', 10), // 15 minutes
        burst: 2,
        message: 'Too many login attempts. Please try again later.',
        standardHeaders: true,
      },
      // Registration endpoint
      'POST:/api/auth/register': {
        requests: parseInt(process.env.RATE_LIMIT_REGISTER_REQUESTS || '3', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_REGISTER_WINDOW_MS || '3600000', 10), // 1 hour
        burst: 1,
        message: 'Too many registration attempts. Please try again later.',
        standardHeaders: true,
      },
      // Password reset
      'POST:/api/auth/reset-password': {
        requests: parseInt(process.env.RATE_LIMIT_RESET_REQUESTS || '3', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_RESET_WINDOW_MS || '3600000', 10), // 1 hour
        burst: 1,
        message: 'Too many password reset requests. Please try again later.',
        standardHeaders: true,
      },
      // API endpoints - higher limits for authenticated users
      'GET:/api/*': {
        requests: parseInt(process.env.RATE_LIMIT_API_GET_REQUESTS || '1000', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_API_GET_WINDOW_MS || '3600000', 10), // 1 hour
        burst: parseInt(process.env.RATE_LIMIT_API_GET_BURST || '100', 10),
        standardHeaders: true,
      },
      'POST:/api/*': {
        requests: parseInt(process.env.RATE_LIMIT_API_POST_REQUESTS || '500', 10),
        windowMs: parseInt(process.env.RATE_LIMIT_API_POST_WINDOW_MS || '3600000', 10), // 1 hour
        burst: parseInt(process.env.RATE_LIMIT_API_POST_BURST || '50', 10),
        standardHeaders: true,
      },
    },
    slidingWindow: {
      enabled: process.env.RATE_LIMIT_SLIDING_WINDOW_ENABLED === 'true',
      precision: parseInt(process.env.RATE_LIMIT_SLIDING_WINDOW_PRECISION || '60', 10), // 1 minute precision
    },
    adaptive: {
      enabled: process.env.RATE_LIMIT_ADAPTIVE_ENABLED === 'true',
      cpuThreshold: parseInt(process.env.RATE_LIMIT_ADAPTIVE_CPU_THRESHOLD || '80', 10),
      memoryThreshold: parseInt(process.env.RATE_LIMIT_ADAPTIVE_MEMORY_THRESHOLD || '85', 10),
      loadFactor: parseFloat(process.env.RATE_LIMIT_ADAPTIVE_LOAD_FACTOR || '0.5'),
    },
    whitelist: {
      ips: (process.env.RATE_LIMIT_WHITELIST_IPS || '127.0.0.1,::1').split(',').filter(Boolean),
      skipPaths: (process.env.RATE_LIMIT_SKIP_PATHS || '/health,/metrics,/favicon.ico').split(',').filter(Boolean),
      skipUserAgents: (process.env.RATE_LIMIT_SKIP_USER_AGENTS || '').split(',').filter(Boolean),
    },
    headers: {
      includeHeaders: process.env.RATE_LIMIT_INCLUDE_HEADERS !== 'false',
      draft: process.env.RATE_LIMIT_HEADER_DRAFT || 'draft-7',
    },
  },
}));