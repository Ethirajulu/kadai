import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JWTSecurityOptions, JWTAuthRequest, JWTTokenPayload } from '../types/security.types';

/**
 * JWT Security decorator to configure authentication and authorization requirements
 */
export const JwtSecurity = (options: JWTSecurityOptions = {}) => SetMetadata('jwt-security', options);

/**
 * Require authentication for this endpoint
 */
export const RequireAuth = () => JwtSecurity({ requireAuth: true });

/**
 * Optional authentication for this endpoint
 */
export const OptionalAuth = () => JwtSecurity({ requireAuth: false });

/**
 * Require specific roles for this endpoint
 */
export const RequireRoles = (...roles: string[]) => JwtSecurity({ requireRoles: roles });

/**
 * Require specific permissions for this endpoint
 */
export const RequirePermissions = (...permissions: string[]) => JwtSecurity({ requirePermissions: permissions });

/**
 * Require admin role for this endpoint
 */
export const RequireAdmin = () => RequireRoles('admin');

/**
 * Require seller role for this endpoint
 */
export const RequireSeller = () => RequireRoles('seller');

/**
 * Require user role (authenticated user) for this endpoint
 */
export const RequireUser = () => RequireRoles('user');

/**
 * Set maximum token age for this endpoint
 */
export const MaxTokenAge = (maxAge: number) => JwtSecurity({ maxTokenAge: maxAge });

/**
 * Get current user from JWT token
 */
export const CurrentUser = createParamDecorator(
  (data: keyof JWTTokenPayload | undefined, ctx: ExecutionContext): JWTTokenPayload | any => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    const user = request.user || request.tokenPayload;
    
    return data ? user?.[data] : user;
  },
);

/**
 * Get user ID from JWT token
 */
export const UserId = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    const user = request.user || request.tokenPayload;
    
    return user?.sub;
  },
);

/**
 * Get user role from JWT token
 */
export const UserRoleDecorator = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    const user = request.user || request.tokenPayload;
    
    return user?.role;
  },
);

/**
 * Get user permissions from JWT token
 */
export const UserPermissions = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string[] => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    const user = request.user || request.tokenPayload;
    
    return user?.permissions || [];
  },
);

/**
 * Get current JWT token
 */
export const JwtToken = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    
    return request.token;
  },
);

/**
 * Check if token was refreshed during this request
 */
export const IsTokenRefreshed = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): boolean => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    
    return request.isTokenRefreshed || false;
  },
);

/**
 * Get authentication error if any
 */
export const AuthError = createParamDecorator(
  (data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest<JWTAuthRequest>();
    
    return request.authError;
  },
);

/**
 * Combine multiple JWT security options
 */
export const CombinedJwtSecurity = (...options: JWTSecurityOptions[]) => {
  const combined = options.reduce((acc, option) => ({ ...acc, ...option }), {});
  return JwtSecurity(combined);
};

/**
 * Predefined security levels
 */
export const SecurityLevel = {
  /**
   * Public endpoint - no authentication required
   */
  Public: () => OptionalAuth(),
  
  /**
   * Basic authentication required
   */
  User: () => RequireAuth(),
  
  /**
   * Seller authentication and role required
   */
  Seller: () => CombinedJwtSecurity({ requireAuth: true, requireRoles: ['seller', 'admin'] }),
  
  /**
   * Admin authentication and role required
   */
  Admin: () => CombinedJwtSecurity({ requireAuth: true, requireRoles: ['admin'] }),
  
  /**
   * High security - recent token required (max 1 hour old)
   */
  HighSecurity: () => CombinedJwtSecurity({ 
    requireAuth: true, 
    maxTokenAge: 3600, // 1 hour
    validateDevice: true 
  }),
  
  /**
   * System level access
   */
  System: () => CombinedJwtSecurity({ 
    requireAuth: true, 
    requireRoles: ['admin'], 
    maxTokenAge: 1800, // 30 minutes
    requireSecureContext: true 
  })
};