import { 
  Role as PrismaRole, 
  Permission as PrismaPermission, 
  UserRole as PrismaUserRole, 
  RolePermission as PrismaRolePermission 
} from '@prisma/client';

export class RoleEntity implements PrismaRole {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<RoleEntity>) {
    Object.assign(this, partial);
  }

  // Business logic methods
  isSystemRole(): boolean {
    return ['admin', 'seller', 'customer'].includes(this.name.toLowerCase());
  }

  canBeDeleted(): boolean {
    return !this.isSystemRole();
  }
}

export class PermissionEntity implements PrismaPermission {
  id: string;
  name: string;
  description: string | null;
  resource: string;
  action: string;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<PermissionEntity>) {
    Object.assign(this, partial);
  }

  // Business logic methods
  getPermissionKey(): string {
    return `${this.resource}:${this.action}`;
  }

  matches(resource: string, action: string): boolean {
    return this.resource === resource && this.action === action;
  }

  isSystemPermission(): boolean {
    const systemPermissions = [
      'user:read', 'user:write', 'user:delete',
      'product:read', 'product:write', 'product:delete',
      'order:read', 'order:write', 'order:delete',
      'payment:read', 'payment:write',
      'system:admin'
    ];
    return systemPermissions.includes(this.getPermissionKey());
  }
}

export class UserRoleEntity implements PrismaUserRole {
  id: string;
  userId: string;
  roleId: string;

  constructor(partial: Partial<UserRoleEntity>) {
    Object.assign(this, partial);
  }
}

export class RolePermissionEntity implements PrismaRolePermission {
  id: string;
  roleId: string;
  permissionId: string;

  constructor(partial: Partial<RolePermissionEntity>) {
    Object.assign(this, partial);
  }
}

// Extended entities with relations
export interface RoleWithPermissions extends RoleEntity {
  permissions: PermissionEntity[];
}

export interface UserWithRoles extends UserEntity {
  roles: RoleWithPermissions[];
}

export interface PermissionCheck {
  resource: string;
  action: string;
  hasPermission: boolean;
}

export interface UserPermissions {
  userId: string;
  roles: string[];
  permissions: string[];
  permissionChecks: PermissionCheck[];
}

// Import UserEntity to avoid circular dependency
import { UserEntity } from './user.entity';