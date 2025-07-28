import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { validateSecurityConfig } from '../config/security-config.validation';

export interface SecurityHealthCheck {
  component: string;
  status: 'healthy' | 'warning' | 'unhealthy';
  message: string;
  timestamp: string;
  details?: any;
}

export interface SecurityHealthReport {
  overall: 'healthy' | 'warning' | 'unhealthy';
  timestamp: string;
  environment: string;
  checks: SecurityHealthCheck[];
  summary: {
    healthy: number;
    warning: number;
    unhealthy: number;
    total: number;
  };
}

@Injectable()
export class SecurityConfigHealthService {
  private readonly logger = new Logger(SecurityConfigHealthService.name);

  constructor(private readonly configService: ConfigService) {}

  /**
   * Perform comprehensive security configuration health check
   */
  async performHealthCheck(): Promise<SecurityHealthReport> {
    this.logger.log('Starting security configuration health check');
    const timestamp = new Date().toISOString();
    const environment = this.configService.get('NODE_ENV', 'development');
    const checks: SecurityHealthCheck[] = [];

    // Check configuration validation
    checks.push(await this.checkConfigurationValidation());

    // Check JWT configuration
    checks.push(await this.checkJwtConfiguration());

    // Check Redis connectivity
    checks.push(await this.checkRedisConfiguration());

    // Check security headers configuration
    checks.push(await this.checkSecurityHeadersConfiguration());

    // Check rate limiting configuration
    checks.push(await this.checkRateLimitConfiguration());

    // Check CORS configuration
    checks.push(await this.checkCorsConfiguration());

    // Check validation configuration
    checks.push(await this.checkValidationConfiguration());

    // Check geographic filtering configuration
    checks.push(await this.checkGeoFilteringConfiguration());

    // Check circuit breaker configuration
    checks.push(await this.checkCircuitBreakerConfiguration());

    // Calculate summary
    const summary = {
      healthy: checks.filter((c) => c.status === 'healthy').length,
      warning: checks.filter((c) => c.status === 'warning').length,
      unhealthy: checks.filter((c) => c.status === 'unhealthy').length,
      total: checks.length,
    };

    // Determine overall status
    let overall: 'healthy' | 'warning' | 'unhealthy' = 'healthy';
    if (summary.unhealthy > 0) {
      overall = 'unhealthy';
    } else if (summary.warning > 0) {
      overall = 'warning';
    }

    this.logger.log(`Security health check completed. Overall status: ${overall}`, {
      summary,
      environment,
    });

    return {
      overall,
      timestamp,
      environment,
      checks,
      summary,
    };
  }

  /**
   * Check overall configuration validation
   */
  private async checkConfigurationValidation(): Promise<SecurityHealthCheck> {
    try {
      const securityConfig = this.configService.get('security', {});
      const environment = this.configService.get('NODE_ENV', 'development');

      const { error } = validateSecurityConfig(securityConfig, environment);

      if (error) {
        return {
          component: 'Configuration Validation',
          status: 'unhealthy',
          message: `Configuration validation failed: ${error.message}`,
          timestamp: new Date().toISOString(),
          details: { validationErrors: error.details },
        };
      }

      return {
        component: 'Configuration Validation',
        status: 'healthy',
        message: 'Security configuration is valid',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        component: 'Configuration Validation',
        status: 'unhealthy',
        message: `Configuration validation error: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check JWT configuration
   */
  private async checkJwtConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const accessSecret = this.configService.get(
        'security.jwt.accessTokenSecret'
      );
      const refreshSecret = this.configService.get(
        'security.jwt.refreshTokenSecret'
      );
      const issuer = this.configService.get('security.jwt.issuer');
      const audience = this.configService.get('security.jwt.audience');
      const algorithm = this.configService.get('security.jwt.algorithm');

      const issues: string[] = [];

      if (!accessSecret || accessSecret.length < 32) {
        issues.push('Access token secret is too short (minimum 32 characters)');
      }

      if (!refreshSecret || refreshSecret.length < 32) {
        issues.push(
          'Refresh token secret is too short (minimum 32 characters)'
        );
      }

      if (!issuer) {
        issues.push('JWT issuer is not configured');
      }

      if (!audience) {
        issues.push('JWT audience is not configured');
      }

      if (
        !algorithm ||
        !['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'].includes(
          algorithm
        )
      ) {
        issues.push('Invalid JWT algorithm');
      }

      const environment = this.configService.get('NODE_ENV', 'development');
      if (environment === 'production' && !algorithm.startsWith('RS')) {
        issues.push(
          'Production environment should use RSA algorithms (RS256, RS384, RS512)'
        );
      }

      if (issues.length > 0) {
        return {
          component: 'JWT Configuration',
          status: 'unhealthy',
          message: 'JWT configuration issues detected',
          timestamp: new Date().toISOString(),
          details: { issues },
        };
      }

      return {
        component: 'JWT Configuration',
        status: 'healthy',
        message: 'JWT configuration is properly set up',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        component: 'JWT Configuration',
        status: 'unhealthy',
        message: `JWT configuration check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check Redis configuration and connectivity
   */
  private async checkRedisConfiguration(): Promise<SecurityHealthCheck> {
    let redis: Redis | null = null;

    try {
      const redisConfig = {
        host: this.configService.get('security.redis.host', 'localhost'),
        port: this.configService.get('security.redis.port', 6379),
        password: this.configService.get('security.redis.password'),
        db: this.configService.get('security.redis.db', 0),
        url: this.configService.get('security.redis.url'),
        connectTimeout: this.configService.get(
          'security.redis.connectionTimeout',
          5000
        ),
      };

      // Create Redis connection
      if (redisConfig.url) {
        redis = new Redis(redisConfig.url);
      } else {
        redis = new Redis(redisConfig);
      }

      // Test connection with timeout
      const pingResult = await Promise.race([
        redis.ping(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Connection timeout')), 5000)
        ),
      ]);

      if (pingResult !== 'PONG') {
        throw new Error('Redis ping failed');
      }

      await redis.disconnect();

      return {
        component: 'Redis Configuration',
        status: 'healthy',
        message: 'Redis connection is working',
        timestamp: new Date().toISOString(),
        details: {
          host: redisConfig.host,
          port: redisConfig.port,
          db: redisConfig.db,
        },
      };
    } catch (error) {
      if (redis) {
        try {
          await redis.disconnect();
        } catch (disconnectError) {
          // Ignore disconnect errors
        }
      }

      return {
        component: 'Redis Configuration',
        status: 'unhealthy',
        message: `Redis connection failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  /**
   * Check security headers configuration
   */
  private async checkSecurityHeadersConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const securityConfig = this.configService.get('security.security', {});
      const warnings: string[] = [];

      if (!securityConfig.enableSecurityHeaders) {
        warnings.push('Security headers are disabled');
      }

      if (!securityConfig.contentSecurityPolicy) {
        warnings.push('Content Security Policy is not configured');
      }

      if (!securityConfig.strictTransportSecurity) {
        warnings.push('Strict Transport Security is not configured');
      }

      const environment = this.configService.get('NODE_ENV', 'development');
      if (environment === 'production' && warnings.length > 0) {
        return {
          component: 'Security Headers',
          status: 'warning',
          message:
            'Security headers configuration needs attention in production',
          timestamp: new Date().toISOString(),
          details: { warnings },
        };
      }

      return {
        component: 'Security Headers',
        status: warnings.length > 0 ? 'warning' : 'healthy',
        message:
          warnings.length > 0
            ? 'Some security headers are not configured'
            : 'Security headers are properly configured',
        timestamp: new Date().toISOString(),
        details: warnings.length > 0 ? { warnings } : undefined,
      };
    } catch (error) {
      return {
        component: 'Security Headers',
        status: 'unhealthy',
        message: `Security headers check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check rate limiting configuration
   */
  private async checkRateLimitConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const rateLimitConfig = this.configService.get('security.rateLimit', {});
      const warnings: string[] = [];

      if (!rateLimitConfig.windowMs || rateLimitConfig.windowMs < 1000) {
        warnings.push(
          'Rate limit window is too short (minimum 1 second recommended)'
        );
      }

      if (!rateLimitConfig.max || rateLimitConfig.max < 1) {
        warnings.push('Rate limit max requests is not properly configured');
      }

      const environment = this.configService.get('NODE_ENV', 'development');
      if (environment === 'production') {
        if (rateLimitConfig.max > 10000) {
          warnings.push('Rate limit is very high for production environment');
        }
        if (
          rateLimitConfig.keyGenerator === 'ip' &&
          !this.configService.get('security.security.enableIpFiltering')
        ) {
          warnings.push(
            'Using IP-based rate limiting without IP filtering in production'
          );
        }
      }

      return {
        component: 'Rate Limiting',
        status: warnings.length > 0 ? 'warning' : 'healthy',
        message:
          warnings.length > 0
            ? 'Rate limiting configuration could be improved'
            : 'Rate limiting is properly configured',
        timestamp: new Date().toISOString(),
        details: warnings.length > 0 ? { warnings } : undefined,
      };
    } catch (error) {
      return {
        component: 'Rate Limiting',
        status: 'unhealthy',
        message: `Rate limiting check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check CORS configuration
   */
  private async checkCorsConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const corsConfig = this.configService.get('security.cors', {});
      const warnings: string[] = [];
      const environment = this.configService.get('NODE_ENV', 'development');

      if (environment === 'production') {
        if (corsConfig.origin === '*') {
          warnings.push('CORS origin is set to wildcard (*) in production');
        }
        if (corsConfig.credentials && corsConfig.origin === '*') {
          warnings.push(
            'CORS credentials enabled with wildcard origin (security risk)'
          );
        }
        if (
          !corsConfig.allowedHeaders ||
          corsConfig.allowedHeaders.includes('*')
        ) {
          warnings.push('CORS allowed headers too permissive for production');
        }
      }

      return {
        component: 'CORS Configuration',
        status: warnings.length > 0 ? 'warning' : 'healthy',
        message:
          warnings.length > 0
            ? 'CORS configuration could be more secure'
            : 'CORS is properly configured',
        timestamp: new Date().toISOString(),
        details: warnings.length > 0 ? { warnings } : undefined,
      };
    } catch (error) {
      return {
        component: 'CORS Configuration',
        status: 'unhealthy',
        message: `CORS configuration check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check validation configuration
   */
  private async checkValidationConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const validationConfig = this.configService.get(
        'security.validation',
        {}
      );
      const warnings: string[] = [];
      const environment = this.configService.get('NODE_ENV', 'development');

      if (environment === 'production') {
        if (!validationConfig.enableXssProtection) {
          warnings.push('XSS protection is disabled in production');
        }
        if (!validationConfig.enableSqlInjectionProtection) {
          warnings.push('SQL injection protection is disabled in production');
        }
        if (!validationConfig.enableNoSqlInjectionProtection) {
          warnings.push('NoSQL injection protection is disabled in production');
        }
        if (!validationConfig.enableStrictValidation) {
          warnings.push('Strict validation is disabled in production');
        }
      }

      return {
        component: 'Input Validation',
        status: warnings.length > 0 ? 'warning' : 'healthy',
        message:
          warnings.length > 0
            ? 'Input validation could be more secure'
            : 'Input validation is properly configured',
        timestamp: new Date().toISOString(),
        details: warnings.length > 0 ? { warnings } : undefined,
      };
    } catch (error) {
      return {
        component: 'Input Validation',
        status: 'unhealthy',
        message: `Input validation check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check geographic filtering configuration
   */
  private async checkGeoFilteringConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const securityConfig = this.configService.get('security.security', {});
      const warnings: string[] = [];
      const environment = this.configService.get('NODE_ENV', 'development');

      if (securityConfig.enableGeoFiltering) {
        if (
          !securityConfig.allowedCountries ||
          securityConfig.allowedCountries.length === 0
        ) {
          warnings.push(
            'Geographic filtering enabled but no allowed countries specified'
          );
        }
      } else if (environment === 'production') {
        warnings.push(
          'Geographic filtering is disabled in production (consider enabling for enhanced security)'
        );
      }

      return {
        component: 'Geographic Filtering',
        status: warnings.length > 0 ? 'warning' : 'healthy',
        message:
          warnings.length > 0
            ? 'Geographic filtering configuration could be improved'
            : 'Geographic filtering is properly configured',
        timestamp: new Date().toISOString(),
        details: warnings.length > 0 ? { warnings } : undefined,
      };
    } catch (error) {
      return {
        component: 'Geographic Filtering',
        status: 'unhealthy',
        message: `Geographic filtering check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Check circuit breaker configuration
   */
  private async checkCircuitBreakerConfiguration(): Promise<SecurityHealthCheck> {
    try {
      const circuitBreakerConfig = this.configService.get(
        'security.circuitBreaker',
        {}
      );
      const warnings: string[] = [];

      if (
        !circuitBreakerConfig.failureThreshold ||
        circuitBreakerConfig.failureThreshold < 1
      ) {
        warnings.push(
          'Circuit breaker failure threshold is not properly configured'
        );
      }

      if (
        !circuitBreakerConfig.resetTimeout ||
        circuitBreakerConfig.resetTimeout < 1000
      ) {
        warnings.push('Circuit breaker reset timeout is too short');
      }

      if (
        !circuitBreakerConfig.operationTimeout ||
        circuitBreakerConfig.operationTimeout < 1000
      ) {
        warnings.push('Circuit breaker operation timeout is too short');
      }

      return {
        component: 'Circuit Breaker',
        status: warnings.length > 0 ? 'warning' : 'healthy',
        message:
          warnings.length > 0
            ? 'Circuit breaker configuration could be improved'
            : 'Circuit breaker is properly configured',
        timestamp: new Date().toISOString(),
        details: warnings.length > 0 ? { warnings } : undefined,
      };
    } catch (error) {
      return {
        component: 'Circuit Breaker',
        status: 'unhealthy',
        message: `Circuit breaker check failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
        timestamp: new Date().toISOString(),
      };
    }
  }
}
