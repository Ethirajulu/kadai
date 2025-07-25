import { Injectable, NestMiddleware, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
// Note: RbacService and types should be imported from @kadai/database-config where they are now located
// This middleware works with any service that implements the RbacService interface

export interface RbacUserWithRoles {
  id: string;
  email: string;
  name: string;
  roles: Array<{
    id: string;
    name: string;
    description: string;
    permissions: Array<{
      id: string;
      name: string;
      resource: string;
      action: string;
      description: string;
    }>;
  }>;
}

export interface IRbacService {
  getUserWithRoles(userId: string): Promise<RbacUserWithRoles | null>;
  userHasAllRoles(userId: string, roles: string[]): Promise<boolean>;
  userHasAnyRole(userId: string, roles: string[]): Promise<boolean>;
  userHasAllPermissions(userId: string, permissions: string[]): Promise<boolean>;
  userHasAnyPermission(userId: string, permissions: string[]): Promise<boolean>;
  userHasResourcePermission(userId: string, resource: string, action: string): Promise<boolean>;
}

export interface RbacOptions {
  roles?: string[];
  permissions?: string[];
  resource?: string;
  action?: string;
  requireAll?: boolean; // If true, user must have ALL roles/permissions; if false, ANY is sufficient
}

interface AuthenticatedRequest extends Request {
  user?: RbacUserWithRoles;
}

@Injectable()
export class RbacMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // This middleware should be used after JWT authentication
    // It assumes req.user is already set with at least { id, email, name }
    // This is just a placeholder - use static methods for actual RBAC checking
    next();
  }

  /**
   * Create a middleware function that checks for specific RBAC requirements
   */
  static createRbacMiddleware(rbacService: IRbacService, options: RbacOptions) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        // Ensure user is authenticated
        if (!req.user || !req.user.id) {
          throw new UnauthorizedException('User not authenticated');
        }

        // Get user with full RBAC data
        const userWithRoles = await rbacService.getUserWithRoles(req.user.id);
        if (!userWithRoles) {
          throw new UnauthorizedException('User not found');
        }

        // Replace the basic user object with full RBAC data
        req.user = userWithRoles;

        // Check roles if specified
        if (options.roles && options.roles.length > 0) {
          const hasRoles = options.requireAll 
            ? await rbacService.userHasAllRoles(req.user.id, options.roles)
            : await rbacService.userHasAnyRole(req.user.id, options.roles);

          if (!hasRoles) {
            throw new ForbiddenException(
              `Access denied. Required roles: ${options.roles.join(options.requireAll ? ' AND ' : ' OR ')}`
            );
          }
        }

        // Check permissions if specified
        if (options.permissions && options.permissions.length > 0) {
          const hasPermissions = options.requireAll
            ? await rbacService.userHasAllPermissions(req.user.id, options.permissions)
            : await rbacService.userHasAnyPermission(req.user.id, options.permissions);

          if (!hasPermissions) {
            throw new ForbiddenException(
              `Access denied. Required permissions: ${options.permissions.join(options.requireAll ? ' AND ' : ' OR ')}`
            );
          }
        }

        // Check resource-action permission if specified
        if (options.resource && options.action) {
          const hasResourcePermission = await rbacService.userHasResourcePermission(
            req.user.id,
            options.resource,
            options.action
          );

          if (!hasResourcePermission) {
            throw new ForbiddenException(
              `Access denied. Required permission: ${options.resource}:${options.action}`
            );
          }
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  }
}

/**
 * Helper functions to create specific RBAC middleware
 */

export const requireRoles = (rbacService: IRbacService, ...roles: string[]) => 
  RbacMiddleware.createRbacMiddleware(rbacService, { roles });

export const requireAllRoles = (rbacService: IRbacService, ...roles: string[]) => 
  RbacMiddleware.createRbacMiddleware(rbacService, { roles, requireAll: true });

export const requirePermissions = (rbacService: IRbacService, ...permissions: string[]) => 
  RbacMiddleware.createRbacMiddleware(rbacService, { permissions });

export const requireAllPermissions = (rbacService: IRbacService, ...permissions: string[]) => 
  RbacMiddleware.createRbacMiddleware(rbacService, { permissions, requireAll: true });

export const requireResourcePermission = (rbacService: IRbacService, resource: string, action: string) => 
  RbacMiddleware.createRbacMiddleware(rbacService, { resource, action });

export const requireAdmin = (rbacService: IRbacService) => 
  requireRoles(rbacService, 'ADMIN');

export const requireSeller = (rbacService: IRbacService) => 
  requireRoles(rbacService, 'SELLER');

export const requireCustomer = (rbacService: IRbacService) => 
  requireRoles(rbacService, 'CUSTOMER');

export const requireSellerOrAdmin = (rbacService: IRbacService) => 
  requireRoles(rbacService, 'SELLER', 'ADMIN');

export const requireCustomerOrSeller = (rbacService: IRbacService) => 
  requireRoles(rbacService, 'CUSTOMER', 'SELLER');