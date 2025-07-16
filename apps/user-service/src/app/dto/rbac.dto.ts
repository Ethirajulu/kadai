import { IsString, IsOptional, IsUUID, IsArray, MinLength, MaxLength } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  permissionIds?: string[];
}

export class UpdateRoleDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(4, { each: true })
  permissionIds?: string[];
}

export class CreatePermissionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  resource: string;

  @IsString()
  @MinLength(2)
  @MaxLength(50)
  action: string;
}

export class UpdatePermissionDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  resource?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  action?: string;
}

export class AssignRoleDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  roleId: string;
}

export class RemoveRoleDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  roleId: string;
}

export class AssignPermissionToRoleDto {
  @IsUUID()
  roleId: string;

  @IsUUID()
  permissionId: string;
}

export class RemovePermissionFromRoleDto {
  @IsUUID()
  roleId: string;

  @IsUUID()
  permissionId: string;
}

export class CheckPermissionDto {
  @IsUUID()
  userId: string;

  @IsString()
  resource: string;

  @IsString()
  action: string;
}

export class RoleResponseDto {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class PermissionResponseDto {
  id: string;
  name: string;
  description?: string;
  resource: string;
  action: string;
  createdAt: Date;
  updatedAt: Date;
}

export class RoleWithPermissionsDto extends RoleResponseDto {
  permissions: PermissionResponseDto[];
}

export class UserWithRolesDto {
  id: string;
  email: string;
  name: string;
  roles: RoleWithPermissionsDto[];
}

export class PermissionCheckResultDto {
  userId: string;
  resource: string;
  action: string;
  hasPermission: boolean;
  grantedByRoles: string[];
}

export class UserPermissionsDto {
  userId: string;
  roles: string[];
  permissions: string[];
  permissionChecks: Array<{
    resource: string;
    action: string;
    hasPermission: boolean;
  }>;
}

export class RoleListResponseDto {
  roles: RoleResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class PermissionListResponseDto {
  permissions: PermissionResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}