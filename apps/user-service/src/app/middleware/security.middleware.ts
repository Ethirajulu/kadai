import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SecurityHeadersMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader(
      'Permissions-Policy',
      'geolocation=(), microphone=(), camera=()'
    );

    // HSTS for HTTPS
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains'
      );
    }

    // Content Security Policy
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "font-src 'self'",
        "connect-src 'self'",
        "frame-ancestors 'none'",
      ].join('; ')
    );

    next();
  }
}

@Injectable()
export class RequestLoggingMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RequestLoggingMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    const { method, originalUrl, ip, headers } = req;
    const userAgent = headers['user-agent'] || 'unknown';

    // Log request
    this.logger.log(
      `Incoming ${method} ${originalUrl} from ${ip} - ${userAgent}`
    );

    // Override res.end to log response
    const originalEnd = res.end;
    res.end = function (chunk?: any, encoding?: any, cb?: any): any {
      const duration = Date.now() - start;
      const size = res.get('content-length') || 0;

      const logLevel = res.statusCode >= 400 ? 'error' : 'log';
      const message = `${method} ${originalUrl} ${res.statusCode} ${duration}ms ${size}bytes`;

      if (logLevel === 'error') {
        (RequestLoggingMiddleware.prototype.logger as any)[logLevel](message);
      } else {
        (RequestLoggingMiddleware.prototype.logger as any)[logLevel](message);
      }

      originalEnd.call(this, chunk, encoding, cb);
    };

    next();
  }
}

@Injectable()
export class BodySizeMiddleware implements NestMiddleware {
  private readonly maxSize = 1024 * 1024; // 1MB

  use(req: Request, res: Response, next: NextFunction) {
    const contentLength = parseInt(req.headers['content-length'] || '0');

    if (contentLength > this.maxSize) {
      return res.status(413).json({
        statusCode: 413,
        message: 'Request entity too large',
        error: 'Payload Too Large',
      });
    }

    next();
  }
}

@Injectable()
export class IpWhitelistMiddleware implements NestMiddleware {
  private readonly allowedIps: string[] = [];
  private readonly logger = new Logger(IpWhitelistMiddleware.name);

  constructor() {
    // Load allowed IPs from environment or config
    const envIps = process.env.ALLOWED_IPS;
    if (envIps) {
      this.allowedIps = envIps.split(',').map((ip) => ip.trim());
    }
  }

  use(req: Request, res: Response, next: NextFunction) {
    // Skip IP whitelist if no IPs are configured (development mode)
    if (this.allowedIps.length === 0) {
      return next();
    }

    const clientIp = req.ip || req.connection.remoteAddress || '';
    const forwarded = req.headers['x-forwarded-for'] as string;
    const realIp = forwarded ? forwarded.split(',')[0].trim() : clientIp;

    if (!this.allowedIps.includes(realIp)) {
      this.logger.warn(`Blocked request from unauthorized IP: ${realIp}`);
      return res.status(403).json({
        statusCode: 403,
        message: 'Access denied',
        error: 'Forbidden',
      });
    }

    next();
  }
}

@Injectable()
export class SessionValidationMiddleware implements NestMiddleware {
  private readonly logger = new Logger(SessionValidationMiddleware.name);

  use(req: Request, res: Response, next: NextFunction) {
    // Skip validation for public endpoints
    const publicPaths = ['/auth/login', '/auth/register', '/health', '/docs'];
    if (publicPaths.some((path) => req.path.startsWith(path))) {
      return next();
    }

    // Check for authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // Let guards handle authentication, just log suspicious activity
      const ip = req.ip || req.connection.remoteAddress;
      this.logger.warn(
        `Unauthenticated request to protected endpoint: ${req.method} ${req.path} from ${ip}`
      );
    }

    next();
  }
}

@Injectable()
export class ApiVersionMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Add API version to response headers
    res.setHeader('X-API-Version', '1.0.0');
    res.setHeader('X-Service', 'user-service');

    // Support API versioning via header
    const apiVersion =
      req.headers['x-api-version'] || req.headers['api-version'];
    if (apiVersion && apiVersion !== '1.0.0') {
      return res.status(400).json({
        statusCode: 400,
        message: `Unsupported API version: ${apiVersion}. Supported version: 1.0.0`,
        error: 'Bad Request',
      });
    }

    next();
  }
}
