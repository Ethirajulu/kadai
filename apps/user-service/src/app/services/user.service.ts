import { PasswordService } from '@kadai/auth-service';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ChangePasswordDto,
  CreateUserDto,
  ResetPasswordDto,
  UpdateUserDto,
  UserListResponseDto,
  UserQueryDto,
  UserResponseDto,
  UserStatsDto,
} from '../dto/user.dto';
import { UserEntity } from '../entities/user.entity';
import { UserRepository } from '../repositories/user.repository';

@Injectable()
export class UserService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordService: PasswordService
  ) {}

  async createUser(createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(
      createUserDto.email
    );
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (createUserDto.phone) {
      const existingUserByPhone = await this.userRepository.findByPhone(
        createUserDto.phone
      );
      if (existingUserByPhone) {
        throw new ConflictException(
          'User with this phone number already exists'
        );
      }
    }

    // Hash password
    const hashedPassword = await this.passwordService.hashPassword(
      createUserDto.password
    );

    // Create user
    const user = await this.userRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });

    return this.mapToResponseDto(user);
  }

  async getUserById(id: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapToResponseDto(user);
  }

  async getUserByEmail(email: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapToResponseDto(user);
  }

  async getUserByPhone(phone: string): Promise<UserResponseDto> {
    const user = await this.userRepository.findByPhone(phone);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapToResponseDto(user);
  }

  async updateUser(
    id: string,
    updateUserDto: UpdateUserDto
  ): Promise<UserResponseDto> {
    const existingUser = await this.userRepository.findById(id);
    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    // Check for phone number conflicts
    if (updateUserDto.phone && updateUserDto.phone !== existingUser.phone) {
      const userWithPhone = await this.userRepository.findByPhone(
        updateUserDto.phone
      );
      if (userWithPhone && userWithPhone.id !== id) {
        throw new ConflictException('Phone number already in use');
      }
    }

    const updatedUser = await this.userRepository.update(id, updateUserDto);
    if (!updatedUser) {
      throw new NotFoundException('User not found');
    }

    return this.mapToResponseDto(updatedUser);
  }

  async changePassword(
    id: string,
    changePasswordDto: ChangePasswordDto
  ): Promise<void> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Verify current password
    const isCurrentPasswordValid = await this.passwordService.verifyPassword(
      changePasswordDto.currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Hash new password
    const hashedNewPassword = await this.passwordService.hashPassword(
      changePasswordDto.newPassword
    );

    // Update password
    await this.userRepository.updatePassword(id, hashedNewPassword);
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    // This would typically involve verifying a reset token
    // For now, we'll assume the token is valid
    // In a real implementation, you'd validate the token against stored reset tokens

    // Find user by reset token (simplified - you'd need to implement token storage)
    // const user = await this.userRepository.findByResetToken(resetPasswordDto.token);
    // if (!user) {
    //   throw new BadRequestException('Invalid or expired reset token');
    // }

    // Hash new password
    const hashedNewPassword = await this.passwordService.hashPassword(
      resetPasswordDto.newPassword
    );

    // Update password (for now, we'll skip the actual implementation)
    // await this.userRepository.updatePassword(user.id, hashedNewPassword);

    throw new BadRequestException('Password reset not fully implemented');
  }

  async deactivateUser(id: string): Promise<void> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.deactivate(id);
  }

  async activateUser(id: string): Promise<void> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.activate(id);
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepository.findById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.userRepository.softDelete(id);
  }

  async getUsers(query: UserQueryDto): Promise<UserListResponseDto> {
    const { users, total } = await this.userRepository.findMany(query);

    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const totalPages = Math.ceil(total / limit);

    return {
      users: users.map((user) => this.mapToResponseDto(user)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getUserStats(): Promise<UserStatsDto> {
    return await this.userRepository.getUserStats();
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.userRepository.updateLastLogin(id);
  }

  // Internal method for authentication
  async validateUser(
    email: string,
    password: string
  ): Promise<UserEntity | null> {
    const user = await this.userRepository.findByEmail(email);
    if (!user) {
      return null;
    }

    const isPasswordValid = await this.passwordService.verifyPassword(
      password,
      user.password
    );
    if (!isPasswordValid) {
      return null;
    }

    if (!user.canLogin()) {
      return null;
    }

    return user;
  }

  // Enhanced methods for ProfileController
  async searchUsers(
    query: any
  ): Promise<{ users: UserResponseDto[]; total: number }> {
    const { users, total } = await this.userRepository.findMany(query);
    return {
      users: users.map((user) => this.mapToResponseDto(user)),
      total,
    };
  }

  async getUserAnalytics(query: any): Promise<any> {
    // This would typically query analytics data
    return {
      totalUsers: 100,
      activeUsers: 80,
      newUsers: 5,
      userGrowth: [],
      usersByRole: {},
      usersByStatus: {},
    };
  }

  async performBulkActions(
    bulkActionDto: any
  ): Promise<{ processed: number; failed: number }> {
    // This would typically perform bulk operations
    return {
      processed: bulkActionDto.userIds.length,
      failed: 0,
    };
  }

  async getUserAuditLog(id: string, query: any): Promise<any> {
    // This would typically fetch audit log data
    return {
      logs: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 1,
    };
  }

  async createImpersonationToken(
    adminId: string,
    targetUserId: string
  ): Promise<{ impersonationToken: string }> {
    // This would typically create an impersonation token
    return {
      impersonationToken: `impersonation-token-${targetUserId}`,
    };
  }

  async sendNotificationToUser(
    id: string,
    notificationDto: any
  ): Promise<{ sent: boolean }> {
    // This would typically send a notification
    return {
      sent: true,
    };
  }

  async getUserSessionsForAdmin(id: string): Promise<any> {
    // This would typically fetch user sessions
    return {
      sessions: [],
      total: 0,
      activeCount: 0,
    };
  }

  async terminateAllUserSessions(id: string): Promise<void> {
    // This would typically terminate all user sessions
    // Implementation would involve session repository
  }

  private mapToResponseDto(user: UserEntity): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      phone: user.phone || undefined,
      address: user.address || undefined,
      role: user.role,
      status: user.status,
      emailVerified: user.emailVerified,
      lastLogin: user.lastLogin,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      businessDetails: user.businessDetails
        ? JSON.parse(user.businessDetails as string)
        : undefined,
    };
  }
}
