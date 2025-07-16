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
  UseGuards,
} from '@nestjs/common';
import { UserService } from '../services/user.service';
import { RbacGuard } from '../guards/rbac.guard';
import { 
  RequireAdmin,
  RequireSeller,
  RequireCustomer,
  RequireSellerOrAdmin,
  RequireAnyRole,
  RequireUserRead,
  RequireUserWrite,
  RequireUserDelete,
  RequireSystemAdmin,
} from '../decorators/rbac.decorator';
import { 
  CreateUserDto, 
  UpdateUserDto, 
  UserQueryDto, 
  UserResponseDto, 
  UserListResponseDto, 
  UserStatsDto,
  ChangePasswordDto,
} from '../dto/user.dto';

@Controller('users')
@UseGuards(RbacGuard)
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireUserWrite()
  async createUser(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    return await this.userService.createUser(createUserDto);
  }

  @Get()
  @RequireUserRead()
  async getUsers(@Query() query: UserQueryDto): Promise<UserListResponseDto> {
    return await this.userService.getUsers(query);
  }

  @Get('stats')
  @RequireAdmin()
  async getUserStats(): Promise<UserStatsDto> {
    return await this.userService.getUserStats();
  }

  @Get('me')
  @RequireAnyRole()
  async getCurrentUser(@Body() user: any): Promise<UserResponseDto> {
    // In a real implementation, user would come from JWT token
    return await this.userService.getUserById(user.userId);
  }

  @Get(':id')
  @RequireUserRead()
  async getUserById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return await this.userService.getUserById(id);
  }

  @Put(':id')
  @RequireUserWrite()
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateUserDto: UpdateUserDto
  ): Promise<UserResponseDto> {
    return await this.userService.updateUser(id, updateUserDto);
  }

  @Put(':id/password')
  @RequireAnyRole()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() changePasswordDto: ChangePasswordDto
  ): Promise<void> {
    await this.userService.changePassword(id, changePasswordDto);
  }

  @Put(':id/activate')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async activateUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.userService.activateUser(id);
  }

  @Put(':id/deactivate')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deactivateUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.userService.deactivateUser(id);
  }

  @Delete(':id')
  @RequireUserDelete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.userService.deleteUser(id);
  }
}

@Controller('admin/users')
@UseGuards(RbacGuard)
@RequireSystemAdmin()
export class AdminUserController {
  constructor(private readonly userService: UserService) {}

  @Get('all')
  async getAllUsers(): Promise<UserListResponseDto> {
    return await this.userService.getUsers({});
  }

  @Post('bulk-deactivate')
  @HttpCode(HttpStatus.NO_CONTENT)
  async bulkDeactivateUsers(@Body() userIds: string[]): Promise<void> {
    for (const userId of userIds) {
      await this.userService.deactivateUser(userId);
    }
  }

  @Get('analytics')
  async getDetailedAnalytics(): Promise<UserStatsDto> {
    return await this.userService.getUserStats();
  }
}