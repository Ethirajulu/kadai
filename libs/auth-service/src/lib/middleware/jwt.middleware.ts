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
 * JWT middleware factory for custom configurations
 */
export class JwtMiddlewareFactory {
  static create(jwtService: JwtService, options: {
    strict?: boolean;
    optional?: boolean;
    skipPaths?: string[];
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