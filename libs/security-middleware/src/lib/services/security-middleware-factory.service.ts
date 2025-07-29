import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { SecurityConfig, SecurityRequest, SecurityResponse, SecurityNextFunction } from '../types/security.types';

@Injectable()
export class SecurityMiddlewareFactoryService {
  // Logger removed as it's not used
  private readonly config: SecurityConfig;

  constructor(private configService: ConfigService) {
    this.config = this.loadSecurityConfig();
  }

  private loadSecurityConfig(): SecurityConfig {
    return {
      helmet: {
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
          },
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true,
        },
      },
      cors: {
        origin: (
          this.configService.get('CORS_ORIGINS', 'http://localhost:4200') ||
          'http://localhost:4200'
        ).split(','),
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: [
          'Origin',
          'X-Requested-With',
          'Content-Type',
          'Accept',
          'Authorization',
          'X-Device-ID',
          'X-Session-ID',
        ],
        credentials: true,
        maxAge: 86400, // 24 hours
      },
      rateLimit: {
        enabled: this.configService.get<boolean>('RATE_LIMIT_ENABLED', true),
        redis: {
          host: this.configService.get<string>('REDIS_HOST', 'localhost'),
          port: this.configService.get<number>('REDIS_PORT', 6379),
          password: this.configService.get<string>('REDIS_PASSWORD'),
          db: this.configService.get<number>('REDIS_DB', 0),
          keyPrefix: 'rate_limit:',
        },
        defaultLimits: {
          anonymous: {
            requests: 100,
            windowMs: 15 * 60 * 1000, // 15 minutes
            burst: 10,
          },
          authenticated: {
            requests: 1000,
            windowMs: 15 * 60 * 1000, // 15 minutes
            burst: 50,
          },
        },
        slidingWindow: {
          enabled: true,
          precision: 1, // 1 second
        },
        adaptive: {
          enabled: true,
          cpuThreshold: 80,
          memoryThreshold: 85,
          loadFactor: 0.5,
        },
        whitelist: {
          ips: [],
          skipPaths: ['/health', '/metrics'],
        },
        headers: {
          includeHeaders: true,
          draft: '7',
        },
      },
      ipWhitelist: {
        whitelist: this.configService
          .get('IP_WHITELIST', '')
          .split(',')
          .filter((ip: string) => ip.trim()),
        blacklist: this.configService
          .get('IP_BLACKLIST', '')
          .split(',')
          .filter((ip: string) => ip.trim()),
        trustProxy: this.configService.get<boolean>('TRUST_PROXY', true),
      },
      geoFilter: {
        allowedCountries: this.configService
          .get('ALLOWED_COUNTRIES', '')
          .split(',')
          .filter((country: string) => country.trim()),
        blockedCountries: this.configService
          .get('BLOCKED_COUNTRIES', '')
          .split(',')
          .filter((country: string) => country.trim()),
        fallbackCountry: this.configService.get('FALLBACK_COUNTRY', 'US'),
      },
      validation: {
        sanitizeInput: this.configService.get<boolean>('SANITIZE_INPUT', true),
        maxBodySize: this.configService.get('MAX_BODY_SIZE', '10mb'),
        maxParameterLength: this.configService.get<number>('MAX_PARAM_LENGTH', 100),
      },
    };
  }

  /**
   * Get Helmet middleware for security headers
   */
  getHelmetMiddleware() {
    return helmet(this.config.helmet);
  }

  /**
   * Get CORS middleware
   */
  getCorsMiddleware() {
    return cors(this.config.cors as any); // Cast to avoid CORS type mismatch
  }

  /**
   * Get basic rate limiting middleware (simplified version)
   */
  getRateLimitMiddleware() {
    if (!this.config.rateLimit?.enabled) {
      return (req: SecurityRequest, res: SecurityResponse, next: SecurityNextFunction) => next();
    }

    return rateLimit({
      windowMs: this.config.rateLimit.defaultLimits.anonymous.windowMs,
      max: this.config.rateLimit.defaultLimits.anonymous.requests,
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
  }

  /**
   * Get the loaded security configuration
   */
  getSecurityConfig(): SecurityConfig {
    return this.config;
  }
}