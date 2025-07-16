import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@kadai/database-config';

export interface RoleWithPermissions {
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
}

export interface RbacUserWithRoles {
  id: string;
  email: string;
  name: string;
  roles: RoleWithPermissions[];
}

@Injectable()
export class RbacService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = new PrismaClient();
  }

  async onModuleDestroy() {
    await this.prisma.$disconnect();
  }

  /**
   * Get user with their roles and permissions
   */
  async getUserWithRoles(userId: string): Promise<RbacUserWithRoles | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.userRoles.map((userRole: any) => ({
        id: userRole.role.id,
        name: userRole.role.name,
        description: userRole.role.description || '',
        permissions: userRole.role.rolePermissions.map((rp: any) => ({
          id: rp.permission.id,
          name: rp.permission.name,
          resource: rp.permission.resource,
          action: rp.permission.action,
          description: rp.permission.description || '',
        })),
      })),
    };
  }

  /**
   * Check if user has a specific role
   */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return false;

    return user.roles.some((role) => role.name === roleName);
  }

  /**
   * Check if user has any of the specified roles
   */
  async userHasAnyRole(userId: string, roleNames: string[]): Promise<boolean> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return false;

    const userRoles = user.roles.map((role) => role.name);
    return roleNames.some((role) => userRoles.includes(role));
  }

  /**
   * Check if user has all specified roles
   */
  async userHasAllRoles(userId: string, roleNames: string[]): Promise<boolean> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return false;

    const userRoles = user.roles.map((role) => role.name);
    return roleNames.every((role) => userRoles.includes(role));
  }

  /**
   * Check if user has a specific permission
   */
  async userHasPermission(
    userId: string,
    permissionName: string
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return false;

    const userPermissions = new Set<string>();
    user.roles.forEach((role) => {
      role.permissions.forEach((permission) => {
        userPermissions.add(permission.name);
      });
    });

    return userPermissions.has(permissionName);
  }

  /**
   * Check if user has resource-action permission
   */
  async userHasResourcePermission(
    userId: string,
    resource: string,
    action: string
  ): Promise<boolean> {
    const permissionName = `${resource}:${action}`;
    return this.userHasPermission(userId, permissionName);
  }

  /**
   * Check if user has any of the specified permissions
   */
  async userHasAnyPermission(
    userId: string,
    permissions: string[]
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return false;

    const userPermissions = new Set<string>();
    user.roles.forEach((role) => {
      role.permissions.forEach((permission) => {
        userPermissions.add(permission.name);
      });
    });

    return permissions.some((permission) => userPermissions.has(permission));
  }

  /**
   * Check if user has all specified permissions
   */
  async userHasAllPermissions(
    userId: string,
    permissions: string[]
  ): Promise<boolean> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return false;

    const userPermissions = new Set<string>();
    user.roles.forEach((role) => {
      role.permissions.forEach((permission) => {
        userPermissions.add(permission.name);
      });
    });

    return permissions.every((permission) => userPermissions.has(permission));
  }

  /**
   * Get all roles
   */
  async getRoles(): Promise<RoleWithPermissions[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return roles.map((role: any) => ({
      id: role.id,
      name: role.name,
      description: role.description || '',
      permissions: role.rolePermissions.map((rp: any) => ({
        id: rp.permission.id,
        name: rp.permission.name,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description || '',
      })),
    }));
  }

  /**
   * Get all permissions
   */
  async getPermissions() {
    return this.prisma.permission.findMany();
  }

  /**
   * Assign role to user
   */
  async assignRoleToUser(userId: string, roleName: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await this.prisma.userRole.upsert({
      where: {
        userId_roleId: {
          userId,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId,
        roleId: role.id,
      },
    });
  }

  /**
   * Remove role from user
   */
  async removeRoleFromUser(userId: string, roleName: string): Promise<void> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
    });

    if (!role) {
      throw new Error(`Role ${roleName} not found`);
    }

    await this.prisma.userRole.deleteMany({
      where: {
        userId,
        roleId: role.id,
      },
    });
  }

  /**
   * Get user roles
   */
  async getUserRoles(userId: string): Promise<string[]> {
    const user = await this.getUserWithRoles(userId);
    return user?.roles.map((role) => role.name) || [];
  }

  /**
   * Get user permissions
   */
  async getUserPermissions(userId: string): Promise<string[]> {
    const user = await this.getUserWithRoles(userId);
    if (!user) return [];

    const permissions = new Set<string>();
    user.roles.forEach((role) => {
      role.permissions.forEach((permission) => {
        permissions.add(permission.name);
      });
    });

    return Array.from(permissions);
  }
}
