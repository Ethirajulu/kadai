import { Injectable } from '@nestjs/common';
import { PrismaService } from '@kadai/database-config';
import { RoleEntity, PermissionEntity, UserRoleEntity, RolePermissionEntity } from '../entities/rbac.entity';
import { CreateRoleDto, UpdateRoleDto, CreatePermissionDto, UpdatePermissionDto } from '../dto/rbac.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class RbacRepository {
  constructor(private readonly prisma: PrismaService) {}

  // Role operations
  async createRole(createRoleDto: CreateRoleDto): Promise<RoleEntity> {
    const role = await this.prisma.role.create({
      data: {
        name: createRoleDto.name,
        description: createRoleDto.description,
      },
    });

    if (createRoleDto.permissionIds && createRoleDto.permissionIds.length > 0) {
      await this.assignPermissionsToRole(role.id, createRoleDto.permissionIds);
    }

    return new RoleEntity(role);
  }

  async findRoleById(id: string): Promise<RoleEntity | null> {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) return null;

    return new RoleEntity({
      ...role,
      permissions: role.rolePermissions.map(rp => new PermissionEntity(rp.permission)),
    });
  }

  async findRoleByName(name: string): Promise<RoleEntity | null> {
    const role = await this.prisma.role.findUnique({
      where: { name },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (!role) return null;

    return new RoleEntity({
      ...role,
      permissions: role.rolePermissions.map(rp => new PermissionEntity(rp.permission)),
    });
  }

  async updateRole(id: string, updateRoleDto: UpdateRoleDto): Promise<RoleEntity | null> {
    const updateData: Prisma.RoleUpdateInput = {
      name: updateRoleDto.name,
      description: updateRoleDto.description,
    };

    const role = await this.prisma.role.update({
      where: { id },
      data: updateData,
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    if (updateRoleDto.permissionIds !== undefined) {
      // Remove existing permissions and add new ones
      await this.prisma.rolePermission.deleteMany({
        where: { roleId: id },
      });

      if (updateRoleDto.permissionIds.length > 0) {
        await this.assignPermissionsToRole(id, updateRoleDto.permissionIds);
      }
    }

    return new RoleEntity({
      ...role,
      permissions: role.rolePermissions.map(rp => new PermissionEntity(rp.permission)),
    });
  }

  async deleteRole(id: string): Promise<void> {
    await this.prisma.role.delete({
      where: { id },
    });
  }

  async findAllRoles(): Promise<RoleEntity[]> {
    const roles = await this.prisma.role.findMany({
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return roles.map(role => new RoleEntity({
      ...role,
      permissions: role.rolePermissions.map(rp => new PermissionEntity(rp.permission)),
    }));
  }

  // Permission operations
  async createPermission(createPermissionDto: CreatePermissionDto): Promise<PermissionEntity> {
    const permission = await this.prisma.permission.create({
      data: {
        name: createPermissionDto.name,
        description: createPermissionDto.description,
        resource: createPermissionDto.resource,
        action: createPermissionDto.action,
      },
    });

    return new PermissionEntity(permission);
  }

  async findPermissionById(id: string): Promise<PermissionEntity | null> {
    const permission = await this.prisma.permission.findUnique({
      where: { id },
    });

    if (!permission) return null;

    return new PermissionEntity(permission);
  }

  async findPermissionByName(name: string): Promise<PermissionEntity | null> {
    const permission = await this.prisma.permission.findUnique({
      where: { name },
    });

    if (!permission) return null;

    return new PermissionEntity(permission);
  }

  async findPermissionByResourceAndAction(resource: string, action: string): Promise<PermissionEntity | null> {
    const permission = await this.prisma.permission.findFirst({
      where: {
        resource,
        action,
      },
    });

    if (!permission) return null;

    return new PermissionEntity(permission);
  }

  async updatePermission(id: string, updatePermissionDto: UpdatePermissionDto): Promise<PermissionEntity | null> {
    const updateData: Prisma.PermissionUpdateInput = {
      name: updatePermissionDto.name,
      description: updatePermissionDto.description,
      resource: updatePermissionDto.resource,
      action: updatePermissionDto.action,
    };

    const permission = await this.prisma.permission.update({
      where: { id },
      data: updateData,
    });

    return new PermissionEntity(permission);
  }

  async deletePermission(id: string): Promise<void> {
    await this.prisma.permission.delete({
      where: { id },
    });
  }

  async findAllPermissions(): Promise<PermissionEntity[]> {
    const permissions = await this.prisma.permission.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return permissions.map(permission => new PermissionEntity(permission));
  }

  // User-Role operations
  async assignRoleToUser(userId: string, roleId: string): Promise<UserRoleEntity> {
    const userRole = await this.prisma.userRole.create({
      data: {
        userId,
        roleId,
      },
    });

    return new UserRoleEntity(userRole);
  }

  async removeRoleFromUser(userId: string, roleId: string): Promise<void> {
    await this.prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId,
        },
      },
    });
  }

  async getUserRoles(userId: string): Promise<RoleEntity[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
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
    });

    return userRoles.map(ur => new RoleEntity({
      ...ur.role,
      permissions: ur.role.rolePermissions.map(rp => new PermissionEntity(rp.permission)),
    }));
  }

  async getRoleUsers(roleId: string): Promise<string[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { roleId },
      select: { userId: true },
    });

    return userRoles.map(ur => ur.userId);
  }

  // Role-Permission operations
  async assignPermissionToRole(roleId: string, permissionId: string): Promise<RolePermissionEntity> {
    const rolePermission = await this.prisma.rolePermission.create({
      data: {
        roleId,
        permissionId,
      },
    });

    return new RolePermissionEntity(rolePermission);
  }

  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    await this.prisma.rolePermission.delete({
      where: {
        roleId_permissionId: {
          roleId,
          permissionId,
        },
      },
    });
  }

  async getRolePermissions(roleId: string): Promise<PermissionEntity[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { roleId },
      include: {
        permission: true,
      },
    });

    return rolePermissions.map(rp => new PermissionEntity(rp.permission));
  }

  async getPermissionRoles(permissionId: string): Promise<RoleEntity[]> {
    const rolePermissions = await this.prisma.rolePermission.findMany({
      where: { permissionId },
      include: {
        role: true,
      },
    });

    return rolePermissions.map(rp => new RoleEntity(rp.role));
  }

  // Permission checking
  async checkUserPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
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
    });

    // Check if user has the required permission through any of their roles
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        const permission = rolePermission.permission;
        if (permission.resource === resource && permission.action === action) {
          return true;
        }
      }
    }

    return false;
  }

  async getUserPermissions(userId: string): Promise<PermissionEntity[]> {
    const userRoles = await this.prisma.userRole.findMany({
      where: { userId },
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
    });

    const permissions = new Map<string, PermissionEntity>();

    // Collect all permissions from all roles
    for (const userRole of userRoles) {
      for (const rolePermission of userRole.role.rolePermissions) {
        const permission = rolePermission.permission;
        permissions.set(permission.id, new PermissionEntity(permission));
      }
    }

    return Array.from(permissions.values());
  }

  // Helper methods
  private async assignPermissionsToRole(roleId: string, permissionIds: string[]): Promise<void> {
    const rolePermissions = permissionIds.map(permissionId => ({
      roleId,
      permissionId,
    }));

    await this.prisma.rolePermission.createMany({
      data: rolePermissions,
    });
  }
}