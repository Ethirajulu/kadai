import { Injectable, CanActivate, ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/rbac.decorator';

export interface GuardUserWithRoles {
  id: string;
  email: string;
  name: string;
  roles: Array<{
    name: string;
    permissions: Array<{
      name: string;
      resource: string;
      action: string;
    }>;
  }>;
}

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required roles and permissions from metadata
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no roles or permissions are required, allow access
    if (!requiredRoles && !requiredPermissions) {
      return true;
    }

    // Get user from request
    const request = context.switchToHttp().getRequest();
    const user: GuardUserWithRoles = request.user;

    if (!user) {
      throw new UnauthorizedException('User not authenticated');
    }

    // Check if user has required roles
    if (requiredRoles && requiredRoles.length > 0) {
      const hasRole = this.hasAnyRole(user, requiredRoles);
      if (!hasRole) {
        throw new ForbiddenException(`Access denied. Required roles: ${requiredRoles.join(', ')}`);
      }
    }

    // Check if user has required permissions
    if (requiredPermissions && requiredPermissions.length > 0) {
      const hasPermission = this.hasAnyPermission(user, requiredPermissions);
      if (!hasPermission) {
        throw new ForbiddenException(`Access denied. Required permissions: ${requiredPermissions.join(', ')}`);
      }
    }

    return true;
  }

  private hasAnyRole(user: GuardUserWithRoles, requiredRoles: string[]): boolean {
    const userRoles = user.roles?.map(role => role.name) || [];
    return requiredRoles.some(role => userRoles.includes(role));
  }

  private hasAnyPermission(user: GuardUserWithRoles, requiredPermissions: string[]): boolean {
    const userPermissions = new Set<string>();
    
    // Collect all permissions from all roles
    user.roles?.forEach(role => {
      role.permissions?.forEach(permission => {
        userPermissions.add(permission.name);
      });
    });

    return requiredPermissions.some(permission => userPermissions.has(permission));
  }

  // Future enhancement: add support for requiring ALL roles/permissions instead of ANY
  // private hasAllRoles(user: UserWithRoles, requiredRoles: string[]): boolean {
  //   const userRoles = user.roles?.map(role => role.name) || [];
  //   return requiredRoles.every(role => userRoles.includes(role));
  // }

  // private hasAllPermissions(user: UserWithRoles, requiredPermissions: string[]): boolean {
  //   const userPermissions = new Set<string>();
  //   
  //   // Collect all permissions from all roles
  //   user.roles?.forEach(role => {
  //     role.permissions?.forEach(permission => {
  //       userPermissions.add(permission.name);
  //     });
  //   });

  //   return requiredPermissions.every(permission => userPermissions.has(permission));
  // }
}