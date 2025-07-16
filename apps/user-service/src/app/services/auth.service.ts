import { Injectable, UnauthorizedException, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { UserRepository } from '../repositories/user.repository';
import { UserSessionRepository } from '../repositories/user-session.repository';
import { JwtService, PasswordService } from '@kadai/auth-service';
import { UserEntity } from '../entities/user.entity';
import { UserSessionEntity } from '../entities/user-session.entity';
import { 
  RegisterDto, 
  LoginDto, 
  RefreshTokenDto, 
  LogoutDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailDto,
  ResendVerificationDto,
  AuthResponseDto,
  TokenResponseDto,
  PasswordResetResponseDto,
  EmailVerificationResponseDto,
  SessionListResponseDto,
  LogoutResponseDto,
} from '../dto/auth.dto';
import { UserRole, UserStatus } from '@kadai/auth-service';

@Injectable()
export class AuthService {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(registerDto: RegisterDto, ipAddress?: string, userAgent?: string): Promise<AuthResponseDto> {
    // Check if user already exists
    const existingUser = await this.userRepository.findByEmail(registerDto.email);
    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    if (registerDto.phone) {
      const existingUserByPhone = await this.userRepository.findByPhone(registerDto.phone);
      if (existingUserByPhone) {
        throw new ConflictException('User with this phone number already exists');
      }
    }

    // Hash password using auth-service
    const hashedPassword = await this.passwordService.hashPassword(registerDto.password);

    // Create user
    const user = await this.userRepository.create({
      ...registerDto,
      password: hashedPassword,
      role: registerDto.role || UserRole.CUSTOMER,
    });

    // Generate email verification token using auth-service
    const emailVerificationToken = await this.jwtService.generateEmailVerificationToken(user.id);

    // Update user with verification token
    await this.userRepository.update(user.id, {
      emailVerificationToken,
    });

    // Generate tokens using auth-service
    const tokens = await this.jwtService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Create session
    const session = await this.createSession(user.id, tokens.accessToken, ipAddress, userAgent);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified || false,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      tokens,
      session: {
        id: session.id,
        device: session.device,
        expiresAt: session.expiresAt,
      },
    };
  }

  async login(loginDto: LoginDto, ipAddress?: string): Promise<AuthResponseDto> {
    let user: UserEntity | null = null;

    // Try to find user by email first, then by phone
    if (loginDto.identifier.includes('@')) {
      user = await this.userRepository.findByEmail(loginDto.identifier);
    } else {
      user = await this.userRepository.findByPhone(loginDto.identifier);
    }

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Verify password using auth-service
    const isPasswordValid = await this.passwordService.verifyPassword(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user can login
    if (!user.canLogin()) {
      throw new UnauthorizedException('Account is not active or not verified');
    }

    // Generate tokens using auth-service
    const tokens = await this.jwtService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Create session
    const session = await this.createSession(
      user.id, 
      tokens.accessToken, 
      ipAddress, 
      loginDto.userAgent,
      loginDto.device
    );

    // Update last login
    await this.userRepository.updateLastLogin(user.id);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified || false,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
      tokens,
      session: {
        id: session.id,
        device: session.device,
        expiresAt: session.expiresAt,
      },
    };
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<TokenResponseDto> {
    // Use auth-service to verify and refresh tokens
    const payload = await this.jwtService.verifyRefreshToken(refreshTokenDto.refreshToken);
    
    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (!user.canLogin()) {
      throw new UnauthorizedException('Account is not active');
    }

    // Find session by refresh token
    const session = await this.userSessionRepository.findByToken(refreshTokenDto.refreshToken);
    if (!session || !session.canBeUsed()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Check device if provided
    if (refreshTokenDto.device && !session.matchesDevice(refreshTokenDto.device)) {
      throw new UnauthorizedException('Device mismatch');
    }

    // Generate new tokens using auth-service
    const tokens = await this.jwtService.generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Update session with new tokens
    await this.userSessionRepository.updateTokens(session.id, tokens.accessToken, tokens.refreshToken);

    return tokens;
  }

  async logout(userId: string, logoutDto: LogoutDto): Promise<LogoutResponseDto> {
    let loggedOutSessions = 0;

    if (logoutDto.logoutAll) {
      // Logout from all sessions
      loggedOutSessions = await this.userSessionRepository.deactivateAllUserSessions(userId);
    } else if (logoutDto.token) {
      // Logout from specific session
      const session = await this.userSessionRepository.findByToken(logoutDto.token);
      if (session && session.userId === userId) {
        await this.userSessionRepository.deactivateSession(session.id);
        loggedOutSessions = 1;
      }
    }

    return {
      message: loggedOutSessions > 0 
        ? `Successfully logged out from ${loggedOutSessions} session(s)` 
        : 'No active sessions found',
      loggedOutSessions,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<PasswordResetResponseDto> {
    let user: UserEntity | null = null;

    // Try to find user by email first, then by phone
    if (forgotPasswordDto.identifier.includes('@')) {
      user = await this.userRepository.findByEmail(forgotPasswordDto.identifier);
    } else {
      user = await this.userRepository.findByPhone(forgotPasswordDto.identifier);
    }

    if (!user) {
      // Return success message even if user not found for security
      return {
        message: 'If an account with that identifier exists, we have sent reset instructions.',
      };
    }

    // Generate password reset token using auth-service
    const resetToken = await this.jwtService.generatePasswordResetToken(user.id);
    const resetExpires = new Date(Date.now() + 3600000); // 1 hour

    // Update user with reset token
    await this.userRepository.update(user.id, {
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires,
    });

    // Send reset email/SMS (would be implemented)
    // if (user.email) {
    //   await this.emailService.sendPasswordResetEmail(user.email, resetToken);
    // }
    // if (user.phone) {
    //   await this.smsService.sendPasswordResetSms(user.phone, resetToken);
    // }

    return {
      message: 'Password reset instructions have been sent.',
      email: user.email,
      phone: user.phone,
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<void> {
    // Use auth-service to verify reset token
    const payload = await this.jwtService.verifyResetToken(resetPasswordDto.token);
    
    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new BadRequestException('Invalid reset token');
    }

    // Check if token is still valid
    if (user.passwordResetExpires && user.passwordResetExpires < new Date()) {
      throw new BadRequestException('Reset token has expired');
    }

    // Hash new password using auth-service
    const hashedPassword = await this.passwordService.hashPassword(resetPasswordDto.newPassword);

    // Update password and clear reset token
    await this.userRepository.updatePassword(user.id, hashedPassword);
    await this.userRepository.update(user.id, {
      passwordResetToken: null,
      passwordResetExpires: null,
    });

    // Invalidate all sessions for security
    await this.userSessionRepository.deactivateAllUserSessions(user.id);
  }

  async verifyEmail(verifyEmailDto: VerifyEmailDto): Promise<EmailVerificationResponseDto> {
    // Use auth-service to verify email token
    const payload = await this.jwtService.verifyEmailToken(verifyEmailDto.token);
    
    const user = await this.userRepository.findById(payload.userId);
    if (!user) {
      throw new BadRequestException('Invalid verification token');
    }

    if (user.emailVerified) {
      return {
        message: 'Email is already verified',
        email: user.email,
        verified: true,
      };
    }

    // Mark email as verified
    await this.userRepository.update(user.id, {
      emailVerified: true,
      emailVerificationToken: null,
      status: UserStatus.ACTIVE,
    });

    return {
      message: 'Email verified successfully',
      email: user.email,
      verified: true,
    };
  }

  async resendVerification(resendVerificationDto: ResendVerificationDto): Promise<EmailVerificationResponseDto> {
    const user = await this.userRepository.findByEmail(resendVerificationDto.email);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.emailVerified) {
      return {
        message: 'Email is already verified',
        email: user.email,
        verified: true,
      };
    }

    // Generate new verification token using auth-service
    const verificationToken = await this.jwtService.generateEmailVerificationToken(user.id);

    // Update user with new token
    await this.userRepository.update(user.id, {
      emailVerificationToken: verificationToken,
    });

    // Send verification email (would be implemented)
    // await this.emailService.sendVerificationEmail(user.email, verificationToken);

    return {
      message: 'Verification email sent',
      email: user.email,
      verified: false,
    };
  }

  async getUserSessions(userId: string): Promise<SessionListResponseDto> {
    const sessions = await this.userSessionRepository.findByUserId(userId);
    
    return {
      sessions: sessions.map(session => ({
        id: session.id,
        device: session.device,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
        isActive: session.isActive,
        createdAt: session.createdAt,
        expiresAt: session.expiresAt,
      })),
      total: sessions.length,
    };
  }

  async terminateSession(userId: string, sessionId: string): Promise<void> {
    const session = await this.userSessionRepository.findById(sessionId);
    if (!session || session.userId !== userId) {
      throw new NotFoundException('Session not found');
    }

    await this.userSessionRepository.deactivateSession(sessionId);
  }

  // Helper methods
  private async createSession(
    userId: string, 
    token: string, 
    ipAddress?: string, 
    userAgent?: string,
    device?: string
  ): Promise<UserSessionEntity> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    return await this.userSessionRepository.create({
      userId,
      token,
      device,
      ipAddress,
      userAgent,
      expiresAt,
    });
  }
}