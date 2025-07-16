import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RbacService } from '../services/rbac.service';
import { ROLES_KEY, PERMISSIONS_KEY } from '../decorators/rbac.decorator';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rbacService: RbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
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

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Check roles if required
    if (requiredRoles && requiredRoles.length > 0) {
      const userRoles = await this.rbacService.getUserRoles(user.userId);
      const userRoleNames = userRoles.map(role => role.name);
      
      const hasRequiredRole = requiredRoles.some(role => userRoleNames.includes(role));
      if (!hasRequiredRole) {
        throw new ForbiddenException(`User does not have required role: ${requiredRoles.join(', ')}`);
      }
    }

    // Check permissions if required
    if (requiredPermissions && requiredPermissions.length > 0) {
      const userPermissions = await this.rbacService.getUserPermissions(user.userId);
      const userPermissionNames = userPermissions.permissions;
      
      const hasRequiredPermission = requiredPermissions.some(permission => 
        userPermissionNames.includes(permission)
      );
      
      if (!hasRequiredPermission) {
        throw new ForbiddenException(`User does not have required permission: ${requiredPermissions.join(', ')}`);
      }
    }

    return true;
  }
}

@Injectable()
export class ResourcePermissionGuard implements CanActivate {
  constructor(private readonly rbacService: RbacService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user || !user.userId) {
      throw new ForbiddenException('User not authenticated');
    }

    // Extract resource and action from request
    const { resource, action } = this.extractResourceAndAction(request);

    if (!resource || !action) {
      return true; // If no resource/action can be determined, allow access
    }

    const permissionCheck = await this.rbacService.checkUserPermission({
      userId: user.userId,
      resource,
      action,
    });

    if (!permissionCheck.hasPermission) {
      throw new ForbiddenException(`User does not have permission to ${action} ${resource}`);
    }

    return true;
  }

  private extractResourceAndAction(request: any): { resource: string; action: string } {
    const method = request.method.toLowerCase();
    const path = request.route?.path || request.url;

    // Extract resource from path (e.g., /users/:id -> users)
    const pathParts = path.split('/').filter(part => part && !part.startsWith(':'));
    const resource = pathParts[0] || 'unknown';

    // Map HTTP methods to actions
    const actionMap = {
      'get': 'read',
      'post': 'write',
      'put': 'write',
      'patch': 'write',
      'delete': 'delete',
    };

    const action = actionMap[method] || 'read';

    return { resource, action };
  }
}