import { IsEmail, IsString, IsOptional, IsEnum, IsBoolean, MinLength, MaxLength, Matches, IsObject, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { UserRole } from '../models/user.model';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  password!: string;

  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  @IsOptional()
  @IsObject()
  deviceInfo?: DeviceInfoDto;
}

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }
  )
  password!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessRegistrationDto)
  businessDetails?: BusinessRegistrationDto;
}

export class BusinessRegistrationDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  businessName!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  businessType!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  businessAddress!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20)
  businessPhone!: string;

  @IsEmail()
  businessEmail!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  registrationNumber?: string;
}

export class DeviceInfoDto {
  @IsString()
  deviceType!: string;

  @IsString()
  deviceName!: string;

  @IsOptional()
  @IsString()
  browserName?: string;

  @IsOptional()
  @IsString()
  browserVersion?: string;

  @IsOptional()
  @IsString()
  osName?: string;

  @IsOptional()
  @IsString()
  osVersion?: string;

  @IsString()
  ipAddress!: string;

  @IsString()
  userAgent!: string;
}

export class PasswordResetRequestDto {
  @IsEmail()
  email!: string;
}

export class PasswordResetConfirmationDto {
  @IsString()
  @MinLength(1)
  token!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }
  )
  newPassword!: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  currentPassword!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  @Matches(
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
    {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character',
    }
  )
  newPassword!: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(1)
  refreshToken!: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsBoolean()
  allDevices?: boolean;
}

export class EmailVerificationDto {
  @IsString()
  @MinLength(1)
  token!: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}

export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  address?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => BusinessRegistrationDto)
  businessDetails?: BusinessRegistrationDto;
}