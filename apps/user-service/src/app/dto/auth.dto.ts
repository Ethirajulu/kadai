import { IsEmail, IsString, IsOptional, IsBoolean, MinLength, MaxLength, IsPhoneNumber } from 'class-validator';
import { UserRole } from '@kadai/auth-service';

export class RegisterDto {
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
  @IsString()
  role?: UserRole;
}

export class LoginDto {
  @IsString()
  identifier: string; // Can be email or phone

  @IsString()
  password: string;

  @IsOptional()
  @IsString()
  device?: string;

  @IsOptional()
  @IsString()
  userAgent?: string;
}

export class RefreshTokenDto {
  @IsString()
  refreshToken: string;

  @IsOptional()
  @IsString()
  device?: string;
}

export class LogoutDto {
  @IsOptional()
  @IsString()
  token?: string;

  @IsOptional()
  @IsBoolean()
  logoutAll?: boolean;
}

export class ForgotPasswordDto {
  @IsString()
  identifier: string; // Can be email or phone
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class VerifyEmailDto {
  @IsString()
  token: string;
}

export class ResendVerificationDto {
  @IsEmail()
  email: string;
}

export class AuthResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    role: UserRole;
    emailVerified: boolean;
    isActive: boolean;
    createdAt: Date;
  };
  tokens: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  };
  session: {
    id: string;
    device?: string;
    expiresAt: Date;
  };
}

export class TokenResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export class PasswordResetResponseDto {
  message: string;
  email?: string;
  phone?: string;
}

export class EmailVerificationResponseDto {
  message: string;
  email: string;
  verified: boolean;
}

export class SessionResponseDto {
  id: string;
  device?: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  createdAt: Date;
  expiresAt: Date;
  lastActivity?: Date;
}

export class SessionListResponseDto {
  sessions: SessionResponseDto[];
  total: number;
  current?: string; // Current session ID
}

export class LogoutResponseDto {
  message: string;
  loggedOutSessions: number;
}