import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { RbacRepository } from '../repositories/rbac.repository';
import { RbacService as AuthRbacService } from '@kadai/database-config';
import {
  RoleEntity,
  PermissionEntity,
  UserRoleEntity,
  RolePermissionEntity,
  RoleWithPermissions,
  UserWithRoles,
  UserPermissions,
} from '../entities/rbac.entity';
import {
  CreateRoleDto,
  UpdateRoleDto,
  CreatePermissionDto,
  UpdatePermissionDto,
  AssignRoleDto,
  RemoveRoleDto,
  CheckPermissionDto,
  RoleResponseDto,
  PermissionResponseDto,
  RoleWithPermissionsDto,
  UserWithRolesDto,
  PermissionCheckResultDto,
  UserPermissionsDto,
} from '../dto/rbac.dto';

@Injectable()
export class RbacService {
  constructor(
    private readonly rbacRepository: RbacRepository,
    private readonly authRbacService: AuthRbacService
  ) {}

  // Role Management
  async createRole(createRoleDto: CreateRoleDto): Promise<RoleResponseDto> {
    const existingRole = await this.rbacRepository.findRoleByName(
      createRoleDto.name
    );
    if (existingRole) {
      throw new ConflictException('Role with this name already exists');
    }

    const role = await this.rbacRepository.createRole(createRoleDto);
    return this.mapRoleToResponseDto(role);
  }

  async getRoleById(id: string): Promise<RoleWithPermissionsDto> {
    const role = await this.rbacRepository.findRoleById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.mapRoleWithPermissionsToDto(role as RoleWithPermissions);
  }

  async getRoleByName(name: string): Promise<RoleWithPermissionsDto> {
    const role = await this.rbacRepository.findRoleByName(name);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return this.mapRoleWithPermissionsToDto(role as RoleWithPermissions);
  }

  async updateRole(
    id: string,
    updateRoleDto: UpdateRoleDto
  ): Promise<RoleResponseDto> {
    const existingRole = await this.rbacRepository.findRoleById(id);
    if (!existingRole) {
      throw new NotFoundException('Role not found');
    }

    if (updateRoleDto.name && updateRoleDto.name !== existingRole.name) {
      const roleWithSameName = await this.rbacRepository.findRoleByName(
        updateRoleDto.name
      );
      if (roleWithSameName) {
        throw new ConflictException('Role with this name already exists');
      }
    }

    const updatedRole = await this.rbacRepository.updateRole(id, updateRoleDto);
    if (!updatedRole) {
      throw new NotFoundException('Role not found');
    }

    return this.mapRoleToResponseDto(updatedRole);
  }

  async deleteRole(id: string): Promise<void> {
    const role = await this.rbacRepository.findRoleById(id);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    if (role.isSystemRole()) {
      throw new BadRequestException('Cannot delete system role');
    }

    await this.rbacRepository.deleteRole(id);
  }

  async getAllRoles(): Promise<RoleWithPermissionsDto[]> {
    const roles = await this.rbacRepository.findAllRoles();
    return roles.map((role) =>
      this.mapRoleWithPermissionsToDto(role as RoleWithPermissions)
    );
  }

  // Permission Management
  async createPermission(
    createPermissionDto: CreatePermissionDto
  ): Promise<PermissionResponseDto> {
    const existingPermission = await this.rbacRepository.findPermissionByName(
      createPermissionDto.name
    );
    if (existingPermission) {
      throw new ConflictException('Permission with this name already exists');
    }

    const existingByResourceAction =
      await this.rbacRepository.findPermissionByResourceAndAction(
        createPermissionDto.resource,
        createPermissionDto.action
      );
    if (existingByResourceAction) {
      throw new ConflictException(
        'Permission with this resource and action already exists'
      );
    }

    const permission = await this.rbacRepository.createPermission(
      createPermissionDto
    );
    return this.mapPermissionToResponseDto(permission);
  }

  async getPermissionById(id: string): Promise<PermissionResponseDto> {
    const permission = await this.rbacRepository.findPermissionById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return this.mapPermissionToResponseDto(permission);
  }

  async getPermissionByName(name: string): Promise<PermissionResponseDto> {
    const permission = await this.rbacRepository.findPermissionByName(name);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    return this.mapPermissionToResponseDto(permission);
  }

  async updatePermission(
    id: string,
    updatePermissionDto: UpdatePermissionDto
  ): Promise<PermissionResponseDto> {
    const existingPermission = await this.rbacRepository.findPermissionById(id);
    if (!existingPermission) {
      throw new NotFoundException('Permission not found');
    }

    if (
      updatePermissionDto.name &&
      updatePermissionDto.name !== existingPermission.name
    ) {
      const permissionWithSameName =
        await this.rbacRepository.findPermissionByName(
          updatePermissionDto.name
        );
      if (permissionWithSameName) {
        throw new ConflictException('Permission with this name already exists');
      }
    }

    const updatedPermission = await this.rbacRepository.updatePermission(
      id,
      updatePermissionDto
    );
    if (!updatedPermission) {
      throw new NotFoundException('Permission not found');
    }

    return this.mapPermissionToResponseDto(updatedPermission);
  }

  async deletePermission(id: string): Promise<void> {
    const permission = await this.rbacRepository.findPermissionById(id);
    if (!permission) {
      throw new NotFoundException('Permission not found');
    }

    if (permission.isSystemPermission()) {
      throw new BadRequestException('Cannot delete system permission');
    }

    await this.rbacRepository.deletePermission(id);
  }

  async getAllPermissions(): Promise<PermissionResponseDto[]> {
    const permissions = await this.rbacRepository.findAllPermissions();
    return permissions.map((permission) =>
      this.mapPermissionToResponseDto(permission)
    );
  }

  // User-Role Management
  async assignRoleToUser(assignRoleDto: AssignRoleDto): Promise<void> {
    const role = await this.rbacRepository.findRoleById(assignRoleDto.roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if user already has this role
    const userRoles = await this.rbacRepository.getUserRoles(
      assignRoleDto.userId
    );
    const hasRole = userRoles.some(
      (userRole) => userRole.id === assignRoleDto.roleId
    );
    if (hasRole) {
      throw new ConflictException('User already has this role');
    }

    await this.rbacRepository.assignRoleToUser(
      assignRoleDto.userId,
      assignRoleDto.roleId
    );
  }

  async removeRoleFromUser(removeRoleDto: RemoveRoleDto): Promise<void> {
    const role = await this.rbacRepository.findRoleById(removeRoleDto.roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    // Check if user has this role
    const userRoles = await this.rbacRepository.getUserRoles(
      removeRoleDto.userId
    );
    const hasRole = userRoles.some(
      (userRole) => userRole.id === removeRoleDto.roleId
    );
    if (!hasRole) {
      throw new BadRequestException('User does not have this role');
    }

    await this.rbacRepository.removeRoleFromUser(
      removeRoleDto.userId,
      removeRoleDto.roleId
    );
  }

  async getUserRoles(userId: string): Promise<RoleWithPermissionsDto[]> {
    const roles = await this.rbacRepository.getUserRoles(userId);
    return roles.map((role) =>
      this.mapRoleWithPermissionsToDto(role as RoleWithPermissions)
    );
  }

  async getRoleUsers(roleId: string): Promise<string[]> {
    const role = await this.rbacRepository.findRoleById(roleId);
    if (!role) {
      throw new NotFoundException('Role not found');
    }

    return await this.rbacRepository.getRoleUsers(roleId);
  }

  // Permission Checking
  async checkUserPermission(
    checkPermissionDto: CheckPermissionDto
  ): Promise<PermissionCheckResultDto> {
    const hasPermission = await this.rbacRepository.checkUserPermission(
      checkPermissionDto.userId,
      checkPermissionDto.resource,
      checkPermissionDto.action
    );

    // Get the roles that grant this permission
    const grantedByRoles: string[] = [];
    if (hasPermission) {
      const userRoles = await this.rbacRepository.getUserRoles(
        checkPermissionDto.userId
      );
      for (const role of userRoles) {
        const rolePermissions = await this.rbacRepository.getRolePermissions(
          role.id
        );
        const hasRolePermission = rolePermissions.some(
          (permission) =>
            permission.resource === checkPermissionDto.resource &&
            permission.action === checkPermissionDto.action
        );
        if (hasRolePermission) {
          grantedByRoles.push(role.name);
        }
      }
    }

    return {
      userId: checkPermissionDto.userId,
      resource: checkPermissionDto.resource,
      action: checkPermissionDto.action,
      hasPermission,
      grantedByRoles,
    };
  }

  async getUserPermissions(userId: string): Promise<UserPermissionsDto> {
    const userRoles = await this.rbacRepository.getUserRoles(userId);
    const userPermissions = await this.rbacRepository.getUserPermissions(
      userId
    );

    const roleNames = userRoles.map((role) => role.name);
    const permissionNames = userPermissions.map(
      (permission) => permission.name
    );

    // Generate common permission checks
    const commonResources = ['user', 'product', 'order', 'payment', 'system'];
    const commonActions = ['read', 'write', 'delete'];
    const permissionChecks = [];

    for (const resource of commonResources) {
      for (const action of commonActions) {
        const hasPermission = await this.rbacRepository.checkUserPermission(
          userId,
          resource,
          action
        );
        permissionChecks.push({
          resource,
          action,
          hasPermission,
        });
      }
    }

    return {
      userId,
      roles: roleNames,
      permissions: permissionNames,
      permissionChecks,
    };
  }

  // Helper methods for seeding default roles and permissions
  async seedDefaultRoles(): Promise<void> {
    const defaultRoles = [
      {
        name: 'admin',
        description: 'System administrator with full access',
        permissions: [
          'system:admin',
          'user:read',
          'user:write',
          'user:delete',
          'product:read',
          'product:write',
          'product:delete',
          'order:read',
          'order:write',
          'order:delete',
          'payment:read',
          'payment:write',
        ],
      },
      {
        name: 'seller',
        description: 'Seller with product and order management access',
        permissions: [
          'user:read',
          'product:read',
          'product:write',
          'order:read',
          'order:write',
          'payment:read',
        ],
      },
      {
        name: 'customer',
        description: 'Customer with basic access',
        permissions: [
          'user:read',
          'product:read',
          'order:read',
          'payment:read',
        ],
      },
    ];

    for (const roleData of defaultRoles) {
      const existingRole = await this.rbacRepository.findRoleByName(
        roleData.name
      );
      if (!existingRole) {
        const role = await this.rbacRepository.createRole({
          name: roleData.name,
          description: roleData.description,
        });

        // Assign permissions to role
        for (const permissionName of roleData.permissions) {
          const permission = await this.rbacRepository.findPermissionByName(
            permissionName
          );
          if (permission) {
            await this.rbacRepository.assignPermissionToRole(
              role.id,
              permission.id
            );
          }
        }
      }
    }
  }

  async seedDefaultPermissions(): Promise<void> {
    const defaultPermissions = [
      {
        name: 'system:admin',
        description: 'Full system administration access',
        resource: 'system',
        action: 'admin',
      },
      {
        name: 'user:read',
        description: 'Read user information',
        resource: 'user',
        action: 'read',
      },
      {
        name: 'user:write',
        description: 'Create and update users',
        resource: 'user',
        action: 'write',
      },
      {
        name: 'user:delete',
        description: 'Delete users',
        resource: 'user',
        action: 'delete',
      },
      {
        name: 'product:read',
        description: 'Read product information',
        resource: 'product',
        action: 'read',
      },
      {
        name: 'product:write',
        description: 'Create and update products',
        resource: 'product',
        action: 'write',
      },
      {
        name: 'product:delete',
        description: 'Delete products',
        resource: 'product',
        action: 'delete',
      },
      {
        name: 'order:read',
        description: 'Read order information',
        resource: 'order',
        action: 'read',
      },
      {
        name: 'order:write',
        description: 'Create and update orders',
        resource: 'order',
        action: 'write',
      },
      {
        name: 'order:delete',
        description: 'Delete orders',
        resource: 'order',
        action: 'delete',
      },
      {
        name: 'payment:read',
        description: 'Read payment information',
        resource: 'payment',
        action: 'read',
      },
      {
        name: 'payment:write',
        description: 'Process payments',
        resource: 'payment',
        action: 'write',
      },
    ];

    for (const permissionData of defaultPermissions) {
      const existingPermission = await this.rbacRepository.findPermissionByName(
        permissionData.name
      );
      if (!existingPermission) {
        await this.rbacRepository.createPermission(permissionData);
      }
    }
  }

  // Private helper methods
  private mapRoleToResponseDto(role: RoleEntity): RoleResponseDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description || '',
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
    };
  }

  private mapRoleWithPermissionsToDto(
    role: RoleWithPermissions
  ): RoleWithPermissionsDto {
    return {
      id: role.id,
      name: role.name,
      description: role.description || '',
      createdAt: role.createdAt,
      updatedAt: role.updatedAt,
      permissions: role.permissions.map((permission) =>
        this.mapPermissionToResponseDto(permission)
      ),
    };
  }

  private mapPermissionToResponseDto(
    permission: PermissionEntity
  ): PermissionResponseDto {
    return {
      id: permission.id,
      name: permission.name,
      description: permission.description || '',
      resource: permission.resource,
      action: permission.action,
      createdAt: permission.createdAt,
      updatedAt: permission.updatedAt,
    };
  }
}
