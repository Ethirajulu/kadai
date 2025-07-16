import { Injectable, NestMiddleware, HttpStatus, HttpException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private store: RateLimitStore = {};
  private readonly windowMs = 15 * 60 * 1000; // 15 minutes
  private readonly maxAttempts = 5; // 5 attempts per window

  use(req: Request, res: Response, next: NextFunction) {
    const key = this.generateKey(req);
    const now = Date.now();

    // Clean up expired entries
    this.cleanupExpiredEntries(now);

    if (!this.store[key]) {
      this.store[key] = {
        count: 1,
        resetTime: now + this.windowMs,
      };
    } else {
      if (now > this.store[key].resetTime) {
        // Reset the counter if window has passed
        this.store[key] = {
          count: 1,
          resetTime: now + this.windowMs,
        };
      } else {
        this.store[key].count++;
      }
    }

    const { count, resetTime } = this.store[key];

    if (count > this.maxAttempts) {
      const retryAfter = Math.ceil((resetTime - now) / 1000);
      res.set({
        'X-RateLimit-Limit': this.maxAttempts.toString(),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': new Date(resetTime).toISOString(),
        'Retry-After': retryAfter.toString(),
      });

      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `Too many authentication attempts. Try again in ${retryAfter} seconds.`,
          error: 'Too Many Requests',
        },
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    // Set rate limit headers
    res.set({
      'X-RateLimit-Limit': this.maxAttempts.toString(),
      'X-RateLimit-Remaining': Math.max(0, this.maxAttempts - count).toString(),
      'X-RateLimit-Reset': new Date(resetTime).toISOString(),
    });

    next();
  }

  private generateKey(req: Request): string {
    // Use IP address and user agent for rate limiting
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';
    
    // For login attempts, also consider the username if available
    const identifier = req.body?.identifier || req.body?.email || '';
    
    return `${ip}:${userAgent}:${identifier}`;
  }

  private cleanupExpiredEntries(now: number): void {
    Object.keys(this.store).forEach(key => {
      if (now > this.store[key].resetTime) {
        delete this.store[key];
      }
    });
  }
}

@Injectable()
export class AuthRateLimitMiddleware extends RateLimitMiddleware {
  constructor() {
    super();
  }
}

@Injectable()
export class PasswordResetRateLimitMiddleware extends RateLimitMiddleware {
  private readonly windowMs = 60 * 60 * 1000; // 1 hour
  private readonly maxAttempts = 3; // 3 attempts per hour

  use(req: Request, res: Response, next: NextFunction) {
    // Override the parent class limits for password reset
    super.use(req, res, next);
  }

  private generateKey(req: Request): string {
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const identifier = req.body?.identifier || '';
    return `password_reset:${ip}:${identifier}`;
  }
}