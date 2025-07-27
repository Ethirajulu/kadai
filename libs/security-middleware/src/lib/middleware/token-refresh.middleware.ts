import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Response, NextFunction } from 'express';
import { JWTService } from '../services/jwt.service';
import { JWTAuthRequest, User, UserRole } from '../types/security.types';

@Injectable()
export class TokenRefreshMiddleware implements NestMiddleware {
  private readonly logger = new Logger(TokenRefreshMiddleware.name);

  constructor(private readonly jwtService: JWTService) {}

  async use(req: JWTAuthRequest, res: Response, next: NextFunction) {
    try {
      // Extract access token from request
      const accessToken = this.jwtService.extractTokenFromRequest(req);
      
      if (!accessToken) {
        return next();
      }

      // Check if token is near expiration (5 minutes threshold)
      if (this.jwtService.isTokenNearExpiration(accessToken, 5)) {
        await this.handleTokenRefresh(req, res, accessToken);
      }

      next();
    } catch (error) {
      this.logger.error('Token refresh middleware error', error);
      // Don't block the request, just log the error
      next();
    }
  }

  /**
   * Handle automatic token refresh
   */
  private async handleTokenRefresh(
    req: JWTAuthRequest, 
    res: Response, 
    accessToken: string
  ): Promise<void> {
    try {
      // Extract refresh token from cookies or headers
      const refreshToken = this.extractRefreshToken(req);
      
      if (!refreshToken) {
        this.logger.debug('No refresh token available for automatic refresh');
        return;
      }

      // Validate current access token to get user info (may be expired)
      const currentPayload = this.jwtService.decodeToken(accessToken);
      
      if (!currentPayload?.sub) {
        this.logger.warn('Invalid access token payload for refresh');
        return;
      }

      // Create user object for token refresh
      const user: User = {
        id: currentPayload.sub,
        email: currentPayload.email,
        role: currentPayload.role || UserRole.USER,
        name: currentPayload.name
      };

      // Refresh tokens
      const newTokenPair = await this.jwtService.refreshTokens(refreshToken, user);

      // Set new tokens in response headers
      this.setRefreshedTokens(res, newTokenPair);

      // Update request with new access token
      req.headers.authorization = `Bearer ${newTokenPair.accessToken}`;
      req.isTokenRefreshed = true;

      this.logger.debug(`Tokens automatically refreshed for user ${user.id}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown refresh error';
      this.logger.warn('Automatic token refresh failed', {
        error: errorMessage,
        userId: this.jwtService.decodeToken(accessToken)?.sub
      });

      // If refresh fails, we might want to clear invalid tokens
      if (errorMessage.includes('Invalid refresh token') || 
          errorMessage.includes('revoked')) {
        this.clearTokens(res);
      }
    }
  }

  /**
   * Extract refresh token from request
   */
  private extractRefreshToken(req: JWTAuthRequest): string | null {
    // Check refresh token in cookies
    if (req.cookies?.refreshToken) {
      return req.cookies.refreshToken;
    }

    // Check refresh token in custom header
    const refreshHeader = req.headers['x-refresh-token'] as string;
    if (refreshHeader) {
      return refreshHeader;
    }

    // Check if refresh token is in the request body (for specific endpoints)
    if (req.body?.refreshToken) {
      return req.body.refreshToken;
    }

    return null;
  }

  /**
   * Set refreshed tokens in response
   */
  private setRefreshedTokens(res: Response, tokenPair: any): void {
    // Set new access token in custom header
    res.setHeader('X-New-Access-Token', tokenPair.accessToken);
    res.setHeader('X-New-Refresh-Token', tokenPair.refreshToken);
    res.setHeader('X-Token-Refreshed', 'true');
    res.setHeader('X-Token-Expires-In', tokenPair.expiresIn.toString());

    // Optionally set tokens in cookies (if using cookie-based auth)
    const isSecure = process.env.NODE_ENV === 'production';
    const sameSite = isSecure ? 'strict' : 'lax';

    res.cookie('accessToken', tokenPair.accessToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite,
      maxAge: tokenPair.expiresIn * 1000, // Convert to milliseconds
      path: '/'
    });

    res.cookie('refreshToken', tokenPair.refreshToken, {
      httpOnly: true,
      secure: isSecure,
      sameSite,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
      path: '/'
    });
  }

  /**
   * Clear tokens from response
   */
  private clearTokens(res: Response): void {
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.setHeader('X-Clear-Tokens', 'true');
  }
}

/**
 * Simple token refresh middleware for specific routes
 */
@Injectable()
export class RefreshTokenEndpointMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RefreshTokenEndpointMiddleware.name);

  constructor(private readonly jwtService: JWTService) {}

  async use(req: JWTAuthRequest, res: Response, next: NextFunction) {
    try {
      const { refreshToken } = req.body;
      
      if (!refreshToken) {
        return res.status(400).json({
          error: 'Refresh token required',
          code: 'MISSING_REFRESH_TOKEN'
        });
      }

      // Validate refresh token
      const refreshPayload = await this.jwtService.validateRefreshToken(refreshToken);
      
      // Create user object from refresh token payload
      const user: User = {
        id: refreshPayload.sub,
        email: refreshPayload.email || '',
        role: (refreshPayload.role as UserRole) || UserRole.USER,
        name: refreshPayload.name
      };

      // Generate new token pair
      const newTokenPair = await this.jwtService.refreshTokens(refreshToken, user);

      return res.json({
        success: true,
        ...newTokenPair
      });

    } catch (error) {
      this.logger.error('Token refresh endpoint error', error);
      
      return res.status(401).json({
        error: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
  }
}

/**
 * Logout middleware to handle token blacklisting
 */
@Injectable()
export class LogoutMiddleware implements NestMiddleware {
  private readonly logger = new Logger(LogoutMiddleware.name);

  constructor(private readonly jwtService: JWTService) {}

  async use(req: JWTAuthRequest, res: Response, next: NextFunction) {
    try {
      const accessToken = this.jwtService.extractTokenFromRequest(req);
      const refreshToken = req.body?.refreshToken || req.cookies?.refreshToken;

      if (accessToken || refreshToken) {
        await this.jwtService.logout(accessToken || '', refreshToken || undefined);
        this.logger.debug('User logged out successfully');
      }

      // Clear cookies
      res.clearCookie('accessToken');
      res.clearCookie('refreshToken');

      return res.json({
        success: true,
        message: 'Logged out successfully'
      });

    } catch (error) {
      this.logger.error('Logout error', error);
      
      return res.status(500).json({
        error: 'Logout failed',
        code: 'LOGOUT_ERROR'
      });
    }
  }
}