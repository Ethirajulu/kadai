import { registerAs } from '@nestjs/config';
import { AUTH_CONSTANTS } from './constants';

export interface AuthConfig {
  jwtSecret: string;
  jwtRefreshSecret: string;
  accessTokenExpiration: string;
  refreshTokenExpiration: string;
  passwordSaltRounds: number;
  passwordResetExpiration: string;
  emailVerificationExpiration: string;
  maxLoginAttempts: number;
  lockoutDuration: string;
  rateLimitWindow: string;
  rateLimitMaxRequests: number;
  maxSessionsPerUser: number;
  sessionCleanupInterval: string;
  emailVerificationRequired: boolean;
  sendWelcomeEmail: boolean;
  jwtIssuer: string;
  jwtAudience: string;
  redisUrl: string;
  databaseUrl: string;
  emailServiceUrl: string;
  frontendUrl: string;
  passwordHistoryLimit: number;
}

export const authConfig = registerAs('auth', (): AuthConfig => ({
  jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'your-refresh-secret-key',
  accessTokenExpiration: process.env.ACCESS_TOKEN_EXPIRATION || AUTH_CONSTANTS.ACCESS_TOKEN_EXPIRATION,
  refreshTokenExpiration: process.env.REFRESH_TOKEN_EXPIRATION || AUTH_CONSTANTS.REFRESH_TOKEN_EXPIRATION,
  passwordSaltRounds: parseInt(process.env.PASSWORD_SALT_ROUNDS || '12', 10),
  passwordResetExpiration: process.env.PASSWORD_RESET_EXPIRATION || AUTH_CONSTANTS.PASSWORD_RESET_EXPIRATION,
  emailVerificationExpiration: process.env.EMAIL_VERIFICATION_EXPIRATION || AUTH_CONSTANTS.EMAIL_VERIFICATION_EXPIRATION,
  maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10),
  lockoutDuration: process.env.LOCKOUT_DURATION || AUTH_CONSTANTS.LOCKOUT_DURATION,
  rateLimitWindow: process.env.RATE_LIMIT_WINDOW || AUTH_CONSTANTS.RATE_LIMIT_WINDOW,
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '10', 10),
  maxSessionsPerUser: parseInt(process.env.MAX_SESSIONS_PER_USER || '5', 10),
  sessionCleanupInterval: process.env.SESSION_CLEANUP_INTERVAL || AUTH_CONSTANTS.SESSION_CLEANUP_INTERVAL,
  emailVerificationRequired: process.env.EMAIL_VERIFICATION_REQUIRED === 'true',
  sendWelcomeEmail: process.env.SEND_WELCOME_EMAIL === 'true',
  jwtIssuer: process.env.JWT_ISSUER || AUTH_CONSTANTS.JWT_ISSUER,
  jwtAudience: process.env.JWT_AUDIENCE || AUTH_CONSTANTS.JWT_AUDIENCE,
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://localhost:5432/kadai',
  emailServiceUrl: process.env.EMAIL_SERVICE_URL || 'http://localhost:3005',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:4200',
  passwordHistoryLimit: parseInt(process.env.PASSWORD_HISTORY_LIMIT || '5', 10),
}));

export const validateAuthConfig = (config: AuthConfig): void => {
  const requiredFields = ['jwtSecret', 'jwtRefreshSecret', 'databaseUrl', 'redisUrl'];
  
  for (const field of requiredFields) {
    if (!config[field as keyof AuthConfig]) {
      throw new Error(`Missing required auth configuration: ${field}`);
    }
  }

  if (config.passwordSaltRounds < 10 || config.passwordSaltRounds > 15) {
    throw new Error('Password salt rounds must be between 10 and 15');
  }

  if (config.maxLoginAttempts < 1 || config.maxLoginAttempts > 10) {
    throw new Error('Max login attempts must be between 1 and 10');
  }

  if (config.maxSessionsPerUser < 1 || config.maxSessionsPerUser > 20) {
    throw new Error('Max sessions per user must be between 1 and 20');
  }

  if (config.rateLimitMaxRequests < 1 || config.rateLimitMaxRequests > 100) {
    throw new Error('Rate limit max requests must be between 1 and 100');
  }

  if (config.passwordHistoryLimit < 1 || config.passwordHistoryLimit > 10) {
    throw new Error('Password history limit must be between 1 and 10');
  }
};