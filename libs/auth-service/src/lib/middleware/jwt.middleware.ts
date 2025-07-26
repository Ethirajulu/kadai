import { Injectable, NestMiddleware, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/jwt.service';
import { JwtPayload } from '../models/auth.model';

// Note: Express type augmentation is handled by global declaration

// Create a custom interface that extends Express Request
interface JwtRequest extends Request {
  jwtUser?: JwtPayload;
  jwtToken?: string;
}

@Injectable()
export class JwtMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: JwtRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return next();
      }

      const token = this.jwtService.extractTokenFromHeader(authHeader);
      
      if (!token) {
        return next();
      }

      // Validate the token
      const payload = await this.jwtService.validateToken(token);
      
      if (payload) {
        req.jwtUser = payload;
        req.jwtToken = token;
      }

      next();
    } catch {
      // For middleware, we don't throw errors, just proceed without user
      // The actual authentication will be handled by guards
      next();
    }
  }
}

/**
 * Strict JWT middleware that throws errors for invalid tokens
 */
@Injectable()
export class StrictJwtMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: JwtRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        throw new UnauthorizedException('Authorization header required');
      }

      const token = this.jwtService.extractTokenFromHeader(authHeader);
      
      if (!token) {
        throw new UnauthorizedException('Bearer token required');
      }

      // Validate the token
      const payload = await this.jwtService.validateToken(token);
      
      if (!payload) {
        throw new UnauthorizedException('Invalid token');
      }

      req.jwtUser = payload;
      req.jwtToken = token;

      next();
    } catch (error) {
      throw new UnauthorizedException(
        error instanceof Error ? error.message : 'Authentication failed'
      );
    }
  }
}

/**
 * Auto-refresh JWT middleware that handles token refresh transparently
 */
@Injectable()
export class AutoRefreshJwtMiddleware implements NestMiddleware {
  constructor(private readonly jwtService: JwtService) {}

  async use(req: JwtRequest, res: Response, next: NextFunction) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return next();
      }

      const token = this.jwtService.extractTokenFromHeader(authHeader);
      
      if (!token) {
        return next();
      }

      // Check if token is near expiration (within 5 minutes)
      const timeToLive = this.jwtService.getTokenTimeToLive(token);
      const shouldRefresh = timeToLive > 0 && timeToLive <= 300; // 5 minutes

      // Validate the current token
      let payload = await this.jwtService.validateToken(token).catch(() => null);

      if (payload && shouldRefresh) {
        // Token is valid but near expiration, signal for refresh
        res.setHeader('X-Token-Refresh-Needed', 'true');
        res.setHeader('X-Token-TTL', timeToLive.toString());
      } else if (!payload && shouldRefresh) {
        // Token might be expired but we can try to refresh it
        // Look for refresh token in request (could be in cookies or body)
        const refreshToken = this.extractRefreshToken(req);
        
        if (refreshToken) {
          try {
            // Use the enhanced refresh method that gets user automatically
            const result = await this.jwtService.refreshTokenPairByToken(refreshToken);

            // Set new tokens in response headers
            res.setHeader('X-New-Access-Token', result.accessToken);
            res.setHeader('X-New-Refresh-Token', result.refreshToken);
            
            // Update request with new token
            payload = await this.jwtService.validateToken(result.accessToken);
            req.jwtToken = result.accessToken;
          } catch (refreshError) {
            // Refresh failed, continue without user
            return next();
          }
        }
      }

      if (payload) {
        req.jwtUser = payload;
        req.jwtToken = req.jwtToken || token;
      }

      next();
    } catch (error) {
      // Continue without user for auto-refresh middleware
      next();
    }
  }

  private extractRefreshToken(req: Request): string | null {
    // Try multiple sources for refresh token
    const body = req.body;
    const cookies = req.cookies;
    const headers = req.headers;

    return (
      body?.refreshToken ||
      cookies?.refreshToken ||
      headers['x-refresh-token'] as string ||
      null
    );
  }
}

/**
 * JWT middleware factory for custom configurations
 */
export class JwtMiddlewareFactory {
  static create(jwtService: JwtService, options: {
    strict?: boolean;
    optional?: boolean;
    skipPaths?: string[];
    autoRefresh?: boolean;
    refreshThreshold?: number; // seconds before expiration to trigger refresh
  } = {}) {
    return class implements NestMiddleware {
      async use(req: JwtRequest, res: Response, next: NextFunction) {
        try {
          // Skip middleware for specified paths
          if (options.skipPaths?.some(path => req.path.startsWith(path))) {
            return next();
          }

          const authHeader = req.headers.authorization;
          
          if (!authHeader) {
            if (options.strict) {
              throw new UnauthorizedException('Authorization header required');
            }
            return next();
          }

          const token = jwtService.extractTokenFromHeader(authHeader);
          
          if (!token) {
            if (options.strict) {
              throw new UnauthorizedException('Bearer token required');
            }
            return next();
          }

          // Handle auto-refresh if enabled
          if (options.autoRefresh) {
            const timeToLive = jwtService.getTokenTimeToLive(token);
            const refreshThreshold = options.refreshThreshold || 300; // default 5 minutes
            const shouldRefresh = timeToLive > 0 && timeToLive <= refreshThreshold;

            if (shouldRefresh) {
              // Signal that token should be refreshed
              res.setHeader('X-Token-Refresh-Needed', 'true');
              res.setHeader('X-Token-TTL', timeToLive.toString());
            }
          }

          // Validate the token
          const payload = await jwtService.validateToken(token);
          
          if (!payload) {
            if (options.strict) {
              throw new UnauthorizedException('Invalid token');
            }
            return next();
          }

          req.jwtUser = payload;
          req.jwtToken = token;

          next();
        } catch (error) {
          if (options.strict) {
            throw new UnauthorizedException(
              error instanceof Error ? error.message : 'Authentication failed'
            );
          }
          next();
        }
      }
    };
  }
}