import { User, UserRole, UserProfile } from '../../models/user.model';
import { 
  AuthResponse, 
  LoginRequest, 
  RegisterRequest, 
  PasswordResetRequest, 
  PasswordResetConfirmation,
  ChangePasswordRequest,
  RefreshTokenRequest,
  LogoutRequest,
  EmailVerificationRequest,
  ResendVerificationRequest,
  TokenPair,
  JwtPayload
} from '../../models/auth.model';

export interface IAuthService {
  register(request: RegisterRequest): Promise<AuthResponse>;
  login(request: LoginRequest): Promise<AuthResponse>;
  logout(userId: string, request: LogoutRequest): Promise<void>;
  refreshToken(request: RefreshTokenRequest): Promise<TokenPair>;
  forgotPassword(request: PasswordResetRequest): Promise<void>;
  resetPassword(request: PasswordResetConfirmation): Promise<void>;
  changePassword(userId: string, request: ChangePasswordRequest): Promise<void>;
  verifyEmail(request: EmailVerificationRequest): Promise<void>;
  resendVerification(request: ResendVerificationRequest): Promise<void>;
  validateUser(email: string, password: string): Promise<User | null>;
  getUserProfile(userId: string): Promise<UserProfile>;
  updateProfile(userId: string, updates: Partial<UserProfile>): Promise<UserProfile>;
}

export interface IJwtService {
  generateAccessToken(payload: JwtPayload): string;
  generateRefreshToken(payload: JwtPayload): string;
  generateTokenPair(user: User): TokenPair;
  validateToken(token: string): Promise<JwtPayload | null>;
  validateRefreshToken(token: string): Promise<JwtPayload | null>;
  blacklistToken(token: string): Promise<void>;
  isTokenBlacklisted(token: string): Promise<boolean>;
  extractTokenFromHeader(authHeader: string): string | null;
}

export interface IPasswordService {
  hashPassword(password: string): Promise<string>;
  verifyPassword(password: string, hash: string): Promise<boolean>;
  validateStrength(password: string): boolean;
  generateResetToken(): string;
  validateResetToken(token: string, hash: string): boolean;
  isPasswordReused(userId: string, password: string): Promise<boolean>;
  savePasswordHistory(userId: string, passwordHash: string): Promise<void>;
}

export interface IUserService {
  createUser(userData: RegisterRequest): Promise<User>;
  findUserById(id: string): Promise<User | null>;
  findUserByEmail(email: string): Promise<User | null>;
  updateUser(id: string, updates: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<void>;
  activateUser(id: string): Promise<void>;
  deactivateUser(id: string): Promise<void>;
  setEmailVerified(id: string): Promise<void>;
  updateLastLogin(id: string): Promise<void>;
  findUsersByRole(role: UserRole): Promise<User[]>;
  countUsers(): Promise<number>;
  searchUsers(query: string): Promise<User[]>;
}

export interface ISessionService {
  createSession(userId: string, token: string, refreshToken: string, deviceInfo: any): Promise<void>;
  getSession(token: string): Promise<any | null>;
  updateSession(sessionId: string, updates: any): Promise<void>;
  deleteSession(sessionId: string): Promise<void>;
  deleteAllUserSessions(userId: string): Promise<void>;
  cleanupExpiredSessions(): Promise<void>;
  getUserSessions(userId: string): Promise<any[]>;
  revokeSession(sessionId: string): Promise<void>;
}

export interface IRoleService {
  createRole(name: string, description: string, permissions: string[]): Promise<any>;
  findRoleById(id: string): Promise<any | null>;
  findRoleByName(name: string): Promise<any | null>;
  updateRole(id: string, updates: any): Promise<any>;
  deleteRole(id: string): Promise<void>;
  assignRoleToUser(userId: string, roleId: string): Promise<void>;
  removeRoleFromUser(userId: string, roleId: string): Promise<void>;
  getUserRoles(userId: string): Promise<any[]>;
  getRolePermissions(roleId: string): Promise<string[]>;
}

export interface IPermissionService {
  createPermission(name: string, resource: string, action: string, description: string): Promise<any>;
  findPermissionById(id: string): Promise<any | null>;
  findPermissionByName(name: string): Promise<any | null>;
  updatePermission(id: string, updates: any): Promise<any>;
  deletePermission(id: string): Promise<void>;
  getUserPermissions(userId: string): Promise<string[]>;
  hasPermission(userId: string, permission: string): Promise<boolean>;
  hasAnyPermission(userId: string, permissions: string[]): Promise<boolean>;
  hasAllPermissions(userId: string, permissions: string[]): Promise<boolean>;
}