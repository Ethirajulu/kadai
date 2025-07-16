import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RbacService } from '../services/rbac.service';
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
  PermissionCheckResultDto,
  UserPermissionsDto 
} from '../dto/rbac.dto';

@Controller('rbac')
export class RbacController {
  constructor(private readonly rbacService: RbacService) {}

  // Role Management Endpoints
  @Post('roles')
  @HttpCode(HttpStatus.CREATED)
  async createRole(@Body() createRoleDto: CreateRoleDto): Promise<RoleResponseDto> {
    return await this.rbacService.createRole(createRoleDto);
  }

  @Get('roles')
  async getAllRoles(): Promise<RoleWithPermissionsDto[]> {
    return await this.rbacService.getAllRoles();
  }

  @Get('roles/:id')
  async getRoleById(@Param('id', ParseUUIDPipe) id: string): Promise<RoleWithPermissionsDto> {
    return await this.rbacService.getRoleById(id);
  }

  @Get('roles/name/:name')
  async getRoleByName(@Param('name') name: string): Promise<RoleWithPermissionsDto> {
    return await this.rbacService.getRoleByName(name);
  }

  @Put('roles/:id')
  async updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateRoleDto: UpdateRoleDto
  ): Promise<RoleResponseDto> {
    return await this.rbacService.updateRole(id, updateRoleDto);
  }

  @Delete('roles/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteRole(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rbacService.deleteRole(id);
  }

  @Get('roles/:id/users')
  async getRoleUsers(@Param('id', ParseUUIDPipe) id: string): Promise<string[]> {
    return await this.rbacService.getRoleUsers(id);
  }

  // Permission Management Endpoints
  @Post('permissions')
  @HttpCode(HttpStatus.CREATED)
  async createPermission(@Body() createPermissionDto: CreatePermissionDto): Promise<PermissionResponseDto> {
    return await this.rbacService.createPermission(createPermissionDto);
  }

  @Get('permissions')
  async getAllPermissions(): Promise<PermissionResponseDto[]> {
    return await this.rbacService.getAllPermissions();
  }

  @Get('permissions/:id')
  async getPermissionById(@Param('id', ParseUUIDPipe) id: string): Promise<PermissionResponseDto> {
    return await this.rbacService.getPermissionById(id);
  }

  @Get('permissions/name/:name')
  async getPermissionByName(@Param('name') name: string): Promise<PermissionResponseDto> {
    return await this.rbacService.getPermissionByName(name);
  }

  @Put('permissions/:id')
  async updatePermission(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updatePermissionDto: UpdatePermissionDto
  ): Promise<PermissionResponseDto> {
    return await this.rbacService.updatePermission(id, updatePermissionDto);
  }

  @Delete('permissions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePermission(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.rbacService.deletePermission(id);
  }

  // User-Role Management Endpoints
  @Post('users/roles/assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  async assignRoleToUser(@Body() assignRoleDto: AssignRoleDto): Promise<void> {
    await this.rbacService.assignRoleToUser(assignRoleDto);
  }

  @Post('users/roles/remove')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeRoleFromUser(@Body() removeRoleDto: RemoveRoleDto): Promise<void> {
    await this.rbacService.removeRoleFromUser(removeRoleDto);
  }

  @Get('users/:userId/roles')
  async getUserRoles(@Param('userId', ParseUUIDPipe) userId: string): Promise<RoleWithPermissionsDto[]> {
    return await this.rbacService.getUserRoles(userId);
  }

  @Get('users/:userId/permissions')
  async getUserPermissions(@Param('userId', ParseUUIDPipe) userId: string): Promise<UserPermissionsDto> {
    return await this.rbacService.getUserPermissions(userId);
  }

  // Permission Checking Endpoints
  @Post('check-permission')
  async checkUserPermission(@Body() checkPermissionDto: CheckPermissionDto): Promise<PermissionCheckResultDto> {
    return await this.rbacService.checkUserPermission(checkPermissionDto);
  }

  @Get('users/:userId/check/:resource/:action')
  async checkUserResourcePermission(
    @Param('userId', ParseUUIDPipe) userId: string,
    @Param('resource') resource: string,
    @Param('action') action: string
  ): Promise<PermissionCheckResultDto> {
    return await this.rbacService.checkUserPermission({ userId, resource, action });
  }

  // Admin Endpoints for Seeding
  @Post('seed/permissions')
  @HttpCode(HttpStatus.NO_CONTENT)
  async seedDefaultPermissions(): Promise<void> {
    await this.rbacService.seedDefaultPermissions();
  }

  @Post('seed/roles')
  @HttpCode(HttpStatus.NO_CONTENT)
  async seedDefaultRoles(): Promise<void> {
    await this.rbacService.seedDefaultRoles();
  }

  @Post('seed/all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async seedAll(): Promise<void> {
    await this.rbacService.seedDefaultPermissions();
    await this.rbacService.seedDefaultRoles();
  }
}