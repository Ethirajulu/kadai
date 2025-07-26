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
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      // Skip rate limiting for health checks and internal requests
      const skipPaths = ['/health', '/metrics', '/favicon.ico'];
      return skipPaths.some(path => req.path.startsWith(path));
    },
    keyGenerator: (req: any) => {
      // Use a combination of IP and user agent for more accurate rate limiting
      const ip = req.headers['x-forwarded-for']?.toString().split(',')[0] || 
                 req.headers['x-real-ip']?.toString() || 
                 req.socket?.remoteAddress || 
                 req.ip;
      return `${ip}_${req.headers['user-agent']}`;
    },
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
}));