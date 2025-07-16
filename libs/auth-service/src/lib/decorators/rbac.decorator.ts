import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to specify required roles for a route
 * @param roles - Array of role names that can access the route
 */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator to specify required permissions for a route
 * @param permissions - Array of permission names that can access the route
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to specify required resource-action combinations for a route
 * @param resource - The resource being accessed (e.g., 'user', 'product')
 * @param action - The action being performed (e.g., 'read', 'write', 'delete')
 */
export const RequirePermission = (resource: string, action: string) => 
  SetMetadata(PERMISSIONS_KEY, [`${resource}:${action}`]);

/**
 * Decorator to specify that a route requires admin access
 */
export const RequireAdmin = () => SetMetadata(ROLES_KEY, ['ADMIN']);

/**
 * Decorator to specify that a route requires seller access
 */
export const RequireSeller = () => SetMetadata(ROLES_KEY, ['SELLER']);

/**
 * Decorator to specify that a route requires customer access
 */
export const RequireCustomer = () => SetMetadata(ROLES_KEY, ['CUSTOMER']);