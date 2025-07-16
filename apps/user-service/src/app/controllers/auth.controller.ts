import { 
  Controller, 
  Post, 
  Get,
  Delete,
  Body, 
  Param,
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  Req,
  UseGuards,
  Ip,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from '../services/auth.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
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

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  async register(
    @Body() registerDto: RegisterDto,
    @Ip() ipAddress: string,
    @Req() request: Request
  ): Promise<AuthResponseDto> {
    const userAgent = request.headers['user-agent'];
    return await this.authService.register(registerDto, ipAddress, userAgent);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() loginDto: LoginDto,
    @Ip() ipAddress: string
  ): Promise<AuthResponseDto> {
    return await this.authService.login(loginDto, ipAddress);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(
    @Body() refreshTokenDto: RefreshTokenDto,
    @Ip() ipAddress: string
  ): Promise<TokenResponseDto> {
    return await this.authService.refreshToken(refreshTokenDto, ipAddress);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async logout(
    @Body() logoutDto: LogoutDto,
    @Req() request: any
  ): Promise<LogoutResponseDto> {
    const userId = request.user.userId;
    return await this.authService.logout(userId, logoutDto);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(
    @Body() forgotPasswordDto: ForgotPasswordDto
  ): Promise<PasswordResetResponseDto> {
    return await this.authService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(
    @Body() resetPasswordDto: ResetPasswordDto
  ): Promise<{ message: string }> {
    await this.authService.resetPassword(resetPasswordDto);
    return { message: 'Password reset successfully' };
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() verifyEmailDto: VerifyEmailDto
  ): Promise<EmailVerificationResponseDto> {
    return await this.authService.verifyEmail(verifyEmailDto);
  }

  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(
    @Body() resendVerificationDto: ResendVerificationDto
  ): Promise<EmailVerificationResponseDto> {
    return await this.authService.resendVerification(resendVerificationDto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getProfile(@Req() request: any) {
    return request.user;
  }

  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  async getUserSessions(@Req() request: any): Promise<SessionListResponseDto> {
    const userId = request.user.userId;
    return await this.authService.getUserSessions(userId);
  }

  @Delete('sessions/:sessionId')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: any
  ): Promise<void> {
    const userId = request.user.userId;
    await this.authService.terminateSession(userId, sessionId);
  }
}

@Controller('auth/admin')
export class AdminAuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('sessions/cleanup')
  @UseGuards(JwtAuthGuard)
  async cleanupExpiredSessions(): Promise<{ message: string; cleaned: number }> {
    // This would typically require admin permissions
    // For now, it's a placeholder
    return { message: 'Cleanup completed', cleaned: 0 };
  }
}