import { 
  Controller, 
  Get, 
  Put, 
  Post,
  Delete,
  Body, 
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserService } from '../services/user.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RbacGuard } from '../guards/rbac.guard';
import { 
  RequireAnyRole,
  RequireUserWrite,
  RequireUserDelete,
  RequireAdmin,
} from '../decorators/rbac.decorator';
import { 
  UpdateUserDto, 
  ChangePasswordDto,
  UserResponseDto,
  UserStatsDto,
} from '../dto/user.dto';

@Controller('profile')
@UseGuards(JwtAuthGuard)
export class ProfileController {
  constructor(private readonly userService: UserService) {}

  @Get()
  @RequireAnyRole()
  async getMyProfile(@Req() request: any): Promise<UserResponseDto> {
    const userId = request.user.userId;
    return await this.userService.getUserById(userId);
  }

  @Put()
  @RequireAnyRole()
  async updateMyProfile(
    @Body() updateUserDto: UpdateUserDto,
    @Req() request: any
  ): Promise<UserResponseDto> {
    const userId = request.user.userId;
    return await this.userService.updateUser(userId, updateUserDto);
  }

  @Put('password')
  @RequireAnyRole()
  @HttpCode(HttpStatus.NO_CONTENT)
  async changeMyPassword(
    @Body() changePasswordDto: ChangePasswordDto,
    @Req() request: any
  ): Promise<void> {
    const userId = request.user.userId;
    await this.userService.changePassword(userId, changePasswordDto);
  }

  @Post('avatar')
  @RequireAnyRole()
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(
    @UploadedFile() file: Express.Multer.File,
    @Req() request: any
  ): Promise<{ avatarUrl: string }> {
    const userId = request.user.userId;
    // This would typically upload to cloud storage
    // For now, return a placeholder
    return { avatarUrl: `https://api.example.com/avatars/${userId}` };
  }

  @Delete('avatar')
  @RequireAnyRole()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteAvatar(@Req() request: any): Promise<void> {
    const userId = request.user.userId;
    // This would typically delete from cloud storage
    // For now, just return success
  }

  @Get('preferences')
  @RequireAnyRole()
  async getMyPreferences(@Req() request: any): Promise<UserPreferencesDto> {
    const userId = request.user.userId;
    // This would typically fetch from user preferences table
    return {
      language: 'en',
      timezone: 'Asia/Kolkata',
      notifications: {
        email: true,
        sms: true,
        push: true,
      },
      theme: 'light',
    };
  }

  @Put('preferences')
  @RequireAnyRole()
  async updateMyPreferences(
    @Body() preferences: UserPreferencesDto,
    @Req() request: any
  ): Promise<UserPreferencesDto> {
    const userId = request.user.userId;
    // This would typically update user preferences table
    return preferences;
  }

  @Get('activity')
  @RequireAnyRole()
  async getMyActivity(
    @Query() query: ActivityQueryDto,
    @Req() request: any
  ): Promise<UserActivityResponseDto> {
    const userId = request.user.userId;
    // This would typically fetch from activity log
    return {
      activities: [
        {
          id: '1',
          type: 'login',
          description: 'User logged in',
          timestamp: new Date(),
          metadata: { ip: '192.168.1.1', device: 'Chrome' },
        },
      ],
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
  }

  @Delete()
  @RequireAnyRole()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteMyAccount(@Req() request: any): Promise<void> {
    const userId = request.user.userId;
    await this.userService.deleteUser(userId);
  }
}

// Enhanced User Management Controller
@Controller('users')
@UseGuards(JwtAuthGuard, RbacGuard)
export class EnhancedUserController {
  constructor(private readonly userService: UserService) {}

  @Get('search')
  @RequireUserWrite()
  async searchUsers(
    @Query() query: UserSearchDto
  ): Promise<{ users: UserResponseDto[]; total: number }> {
    const result = await this.userService.searchUsers(query);
    return result;
  }

  @Get('analytics')
  @RequireAdmin()
  async getUserAnalytics(
    @Query() query: AnalyticsQueryDto
  ): Promise<UserAnalyticsDto> {
    return await this.userService.getUserAnalytics(query);
  }

  @Get('export')
  @RequireAdmin()
  async exportUsers(
    @Query() query: ExportQueryDto
  ): Promise<{ downloadUrl: string }> {
    // This would typically generate and return a download URL
    return { downloadUrl: 'https://api.example.com/exports/users.csv' };
  }

  @Post('bulk-actions')
  @RequireAdmin()
  async bulkUserActions(
    @Body() bulkActionDto: BulkActionDto
  ): Promise<{ processed: number; failed: number }> {
    return await this.userService.performBulkActions(bulkActionDto);
  }

  @Get(':id/audit-log')
  @RequireAdmin()
  async getUserAuditLog(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: AuditLogQueryDto
  ): Promise<UserAuditLogResponseDto> {
    return await this.userService.getUserAuditLog(id, query);
  }

  @Post(':id/impersonate')
  @RequireAdmin()
  async impersonateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Req() request: any
  ): Promise<{ impersonationToken: string }> {
    const adminId = request.user.userId;
    return await this.userService.createImpersonationToken(adminId, id);
  }

  @Post(':id/send-notification')
  @RequireAdmin()
  async sendNotificationToUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() notificationDto: UserNotificationDto
  ): Promise<{ sent: boolean }> {
    return await this.userService.sendNotificationToUser(id, notificationDto);
  }

  @Get(':id/sessions')
  @RequireAdmin()
  async getUserSessions(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<UserSessionsResponseDto> {
    return await this.userService.getUserSessionsForAdmin(id);
  }

  @Delete(':id/sessions')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateAllUserSessions(
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    await this.userService.terminateAllUserSessions(id);
  }
}

// DTOs for the new endpoints
export interface UserPreferencesDto {
  language: string;
  timezone: string;
  notifications: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  theme: 'light' | 'dark';
}

export interface ActivityQueryDto {
  page?: string;
  limit?: string;
  type?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface UserActivityResponseDto {
  activities: Array<{
    id: string;
    type: string;
    description: string;
    timestamp: Date;
    metadata?: any;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserSearchDto {
  query: string;
  filters?: {
    role?: string;
    status?: string;
    emailVerified?: boolean;
    dateFrom?: string;
    dateTo?: string;
  };
  page?: string;
  limit?: string;
}

export interface AnalyticsQueryDto {
  dateFrom?: string;
  dateTo?: string;
  groupBy?: 'day' | 'week' | 'month';
}

export interface UserAnalyticsDto {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  userGrowth: Array<{
    date: string;
    count: number;
  }>;
  usersByRole: Record<string, number>;
  usersByStatus: Record<string, number>;
}

export interface ExportQueryDto {
  format?: 'csv' | 'xlsx' | 'json';
  filters?: {
    role?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  };
}

export interface BulkActionDto {
  action: 'activate' | 'deactivate' | 'delete' | 'assign-role' | 'remove-role';
  userIds: string[];
  parameters?: {
    roleId?: string;
    reason?: string;
  };
}

export interface AuditLogQueryDto {
  page?: string;
  limit?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface UserAuditLogResponseDto {
  logs: Array<{
    id: string;
    action: string;
    description: string;
    timestamp: Date;
    performedBy: string;
    metadata?: any;
  }>;
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserNotificationDto {
  type: 'email' | 'sms' | 'push';
  subject: string;
  message: string;
  priority: 'low' | 'medium' | 'high';
}

export interface UserSessionsResponseDto {
  sessions: Array<{
    id: string;
    device?: string;
    ipAddress?: string;
    userAgent?: string;
    isActive: boolean;
    createdAt: Date;
    expiresAt: Date;
    lastActivity?: Date;
  }>;
  total: number;
  activeCount: number;
}