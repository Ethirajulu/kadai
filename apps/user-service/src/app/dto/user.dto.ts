import { IsEmail, IsString, IsOptional, IsBoolean, IsEnum, IsUUID, MinLength, MaxLength, IsPhoneNumber } from 'class-validator';
import { UserRole, UserStatus } from '@kadai/auth-service';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsPhoneNumber('IN', { message: 'Phone number must be a valid Indian phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  businessDetails?: BusinessDetailsDto;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsPhoneNumber('IN', { message: 'Phone number must be a valid Indian phone number' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  businessDetails?: BusinessDetailsDto;
}

export class BusinessDetailsDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessType: string;

  @IsString()
  @MaxLength(500)
  businessAddress: string;

  @IsPhoneNumber('IN', { message: 'Business phone number must be a valid Indian phone number' })
  businessPhone: string;

  @IsEmail()
  businessEmail: string;

  @IsOptional()
  @IsString()
  taxId?: string;

  @IsOptional()
  @IsString()
  registrationNumber?: string;

  @IsOptional()
  @IsEnum(['pending', 'verified', 'rejected'])
  verificationStatus?: 'pending' | 'verified' | 'rejected';

  @IsOptional()
  verificationDocuments?: string[];
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class UserQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'updatedAt' | 'name' | 'email';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class UserResponseDto {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role?: UserRole;
  status?: UserStatus;
  emailVerified?: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  businessDetails?: BusinessDetailsDto;
}

export class UserListResponseDto {
  users: UserResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class UserStatsDto {
  totalUsers: number;
  activeUsers: number;
  inactiveUsers: number;
  pendingVerification: number;
  usersByRole: {
    [key in UserRole]: number;
  };
  recentRegistrations: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}