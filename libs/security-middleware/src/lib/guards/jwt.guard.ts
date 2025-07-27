import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JWTService } from '../services/jwt.service';
import { JWTAuthRequest, JWTSecurityOptions, UserRole } from '../types/security.types';

@Injectable()
export class JwtGuard implements CanActivate {
  private readonly logger = new Logger(JwtGuard.name);

  constructor(
    private readonly jwtService: JWTService,
    private readonly reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<JWTAuthRequest>();
    
    try {
      
      // Get security options from decorator metadata
      const securityOptions = this.reflector.getAllAndOverride<JWTSecurityOptions>('jwt-security', [
        context.getHandler(),
        context.getClass(),
      ]);

      // Check if authentication is required
      const requireAuth = securityOptions?.requireAuth ?? true;
      if (!requireAuth) {
        return true;
      }
      // Extract token from request
      const token = this.jwtService.extractTokenFromRequest(request);
      
      if (!token) {
        this.logger.warn('No authentication token provided');
        throw new UnauthorizedException('Authentication token required');
      }

      // Validate token
      const payload = await this.jwtService.validateAccessToken(token);
      
      // Attach user information to request
      request.user = payload;
      request.token = token;
      request.tokenPayload = payload;

      // Check role-based access
      if (securityOptions?.requireRoles?.length) {
        if (!payload.role || !this.hasRequiredRole(payload.role, securityOptions.requireRoles)) {
          this.logger.warn(`User ${payload.sub} lacks required role. Has: ${payload.role || 'none'}, Required: ${securityOptions.requireRoles.join(', ')}`);
          throw new ForbiddenException('Insufficient role permissions');
        }
      }

      // Check permission-based access
      if (securityOptions?.requirePermissions?.length) {
        if (!this.hasRequiredPermissions(payload.permissions || [], securityOptions.requirePermissions)) {
          this.logger.warn(`User ${payload.sub} lacks required permissions`);
          throw new ForbiddenException('Insufficient permissions');
        }
      }

      // Check token age if required
      if (securityOptions?.maxTokenAge) {
        const tokenAge = Math.floor(Date.now() / 1000) - payload.iat;
        if (tokenAge > securityOptions.maxTokenAge) {
          this.logger.warn(`Token too old for user ${payload.sub}. Age: ${tokenAge}s, Max: ${securityOptions.maxTokenAge}s`);
          throw new UnauthorizedException('Token too old');
        }
      }

      // Check if token is near expiration and should be refreshed
      if (this.jwtService.isTokenNearExpiration(token)) {
        request.isTokenRefreshed = true;
        this.logger.debug(`Token near expiration for user ${payload.sub}`);
      }

      // Log successful authentication
      this.logger.debug(`Authentication successful for user ${payload.sub} with role ${payload.role}`);
      
      return true;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
      request.authError = errorMessage;
      
      if (error instanceof UnauthorizedException || error instanceof ForbiddenException) {
        throw error;
      }

      // Handle specific JWT errors
      if (errorMessage.includes('expired')) {
        this.logger.warn('Token expired', { error: errorMessage });
        throw new UnauthorizedException('Token expired');
      }

      if (errorMessage.includes('revoked')) {
        this.logger.warn('Token revoked', { error: errorMessage });
        throw new UnauthorizedException('Token revoked');
      }

      if (errorMessage.includes('invalid')) {
        this.logger.warn('Invalid token', { error: errorMessage });
        throw new UnauthorizedException('Invalid token');
      }

      // Generic authentication error
      this.logger.error('Authentication failed', error);
      throw new UnauthorizedException('Authentication failed');
    }
  }

  /**
   * Check if user has required role
   */
  private hasRequiredRole(userRole: string, requiredRoles: string[]): boolean {
    // Admin role has access to everything
    if (userRole === UserRole.ADMIN) {
      return true;
    }

    return requiredRoles.includes(userRole);
  }

  /**
   * Check if user has required permissions
   */
  private hasRequiredPermissions(userPermissions: string[], requiredPermissions: string[]): boolean {
    return requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
  }
}

/**
 * Optional JWT Guard that doesn't throw errors for unauthenticated requests
 */
@Injectable()
export class OptionalJwtGuard implements CanActivate {
  private readonly logger = new Logger(OptionalJwtGuard.name);

  constructor(private readonly jwtService: JWTService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<JWTAuthRequest>();
    
    try {
      const token = this.jwtService.extractTokenFromRequest(request);
      
      if (token) {
        const payload = await this.jwtService.validateAccessToken(token);
        request.user = payload;
        request.token = token;
        request.tokenPayload = payload;
        
        this.logger.debug(`Optional authentication successful for user ${payload.sub}`);
      }
      
      return true;
    } catch (error) {
      // Don't throw errors for optional authentication
      const errorMessage = error instanceof Error ? error.message : 'Unknown authentication error';
      this.logger.debug('Optional authentication failed, continuing without auth', errorMessage);
      return true;
    }
  }
}