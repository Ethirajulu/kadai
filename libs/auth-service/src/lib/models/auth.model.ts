import { UserRole } from './user.model';

export interface JwtPayload {
  sub: string; // user id
  email: string;
  role: UserRole;
  permissions: string[];
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  refreshExpiresIn: number;
}

export interface AuthResponse {
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    emailVerified: boolean;
  };
  tokens: TokenPair;
}

export interface LoginRequest {
  email: string;
  password: string;
  rememberMe?: boolean;
  deviceInfo?: DeviceInfo;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
  phone?: string;
  address?: string;
  role?: UserRole;
  businessDetails?: BusinessRegistrationDetails;
}

export interface BusinessRegistrationDetails {
  businessName: string;
  businessType: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  taxId?: string;
  registrationNumber?: string;
}

export interface DeviceInfo {
  deviceType: string;
  deviceName: string;
  browserName?: string;
  browserVersion?: string;
  osName?: string;
  osVersion?: string;
  ipAddress: string;
  userAgent: string;
}

export interface PasswordResetRequest {
  email: string;
}

export interface PasswordResetConfirmation {
  token: string;
  newPassword: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface LogoutRequest {
  refreshToken?: string;
  allDevices?: boolean;
}

export interface EmailVerificationRequest {
  token: string;
}

export interface ResendVerificationRequest {
  email: string;
}

export interface AuthenticationConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenExpiration: string;
  refreshTokenExpiration: string;
  passwordSaltRounds: number;
  passwordResetExpiration: string;
  emailVerificationExpiration: string;
  maxLoginAttempts: number;
  lockoutDuration: string;
}

export interface AuthenticationResult {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    emailVerified: boolean;
  };
  tokens?: TokenPair;
  error?: string;
  requiresVerification?: boolean;
}