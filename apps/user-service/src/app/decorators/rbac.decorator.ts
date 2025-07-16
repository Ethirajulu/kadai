import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';
export const PERMISSIONS_KEY = 'permissions';

/**
 * Decorator to require specific roles for accessing an endpoint
 * @param roles - Array of role names required
 */
export const RequireRoles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Decorator to require specific permissions for accessing an endpoint
 * @param permissions - Array of permission names required
 */
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);

/**
 * Decorator to require admin role
 */
export const RequireAdmin = () => RequireRoles('admin');

/**
 * Decorator to require seller role
 */
export const RequireSeller = () => RequireRoles('seller');

/**
 * Decorator to require customer role
 */
export const RequireCustomer = () => RequireRoles('customer');

/**
 * Decorator to require seller or admin role
 */
export const RequireSellerOrAdmin = () => RequireRoles('seller', 'admin');

/**
 * Decorator to require customer or admin role
 */
export const RequireCustomerOrAdmin = () => RequireRoles('customer', 'admin');

/**
 * Decorator to require any authenticated user (customer, seller, or admin)
 */
export const RequireAnyRole = () => RequireRoles('customer', 'seller', 'admin');

/**
 * Decorator to require specific resource permissions
 * @param resource - Resource name (e.g., 'user', 'product')
 * @param action - Action name (e.g., 'read', 'write', 'delete')
 */
export const RequireResourcePermission = (resource: string, action: string) => 
  RequirePermissions(`${resource}:${action}`);

/**
 * Decorator to require user read permission
 */
export const RequireUserRead = () => RequireResourcePermission('user', 'read');

/**
 * Decorator to require user write permission
 */
export const RequireUserWrite = () => RequireResourcePermission('user', 'write');

/**
 * Decorator to require user delete permission
 */
export const RequireUserDelete = () => RequireResourcePermission('user', 'delete');

/**
 * Decorator to require product read permission
 */
export const RequireProductRead = () => RequireResourcePermission('product', 'read');

/**
 * Decorator to require product write permission
 */
export const RequireProductWrite = () => RequireResourcePermission('product', 'write');

/**
 * Decorator to require product delete permission
 */
export const RequireProductDelete = () => RequireResourcePermission('product', 'delete');

/**
 * Decorator to require order read permission
 */
export const RequireOrderRead = () => RequireResourcePermission('order', 'read');

/**
 * Decorator to require order write permission
 */
export const RequireOrderWrite = () => RequireResourcePermission('order', 'write');

/**
 * Decorator to require order delete permission
 */
export const RequireOrderDelete = () => RequireResourcePermission('order', 'delete');

/**
 * Decorator to require payment read permission
 */
export const RequirePaymentRead = () => RequireResourcePermission('payment', 'read');

/**
 * Decorator to require payment write permission
 */
export const RequirePaymentWrite = () => RequireResourcePermission('payment', 'write');

/**
 * Decorator to require system admin permission
 */
export const RequireSystemAdmin = () => RequirePermissions('system:admin');