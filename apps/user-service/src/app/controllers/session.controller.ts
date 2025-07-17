import {
  Controller,
  Get,
  Delete,
  Post,
  Param,
  Query,
  UseGuards,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { SessionService, SessionInfo, SessionStatsDto } from '../services/session.service';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RbacGuard } from '../guards/rbac.guard';
import { RequireAnyRole, RequireAdmin } from '../decorators/rbac.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard)
export class SessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('my-sessions')
  @RequireAnyRole()
  async getMySessions(@Req() request: any): Promise<{ sessions: SessionInfo[] }> {
    const userId = request.user.userId;
    const sessions = await this.sessionService.getUserSessions(userId);
    return { sessions };
  }

  @Get('my-active-sessions')
  @RequireAnyRole()
  async getMyActiveSessions(@Req() request: any): Promise<{ sessions: SessionInfo[] }> {
    const userId = request.user.userId;
    const sessions = await this.sessionService.getActiveSessions(userId);
    return { sessions };
  }

  @Delete('my-sessions/:sessionId')
  @RequireAnyRole()
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateMySession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: any
  ): Promise<void> {
    const userId = request.user.userId;
    
    // Verify the session belongs to the user
    const session = await this.sessionService.getSession(sessionId);
    if (!session || session.userId !== userId) {
      throw new Error('Session not found or unauthorized');
    }

    await this.sessionService.deactivateSession(sessionId);
  }

  @Delete('my-sessions')
  @RequireAnyRole()
  async terminateAllMySessions(@Req() request: any): Promise<{ terminatedCount: number }> {
    const userId = request.user.userId;
    const currentSessionId = request.user.sessionId;

    // Get all user sessions except current one
    const sessions = await this.sessionService.getUserSessions(userId);
    const otherSessions = sessions.filter(s => s.id !== currentSessionId && s.isActive);

    let terminatedCount = 0;
    for (const session of otherSessions) {
      await this.sessionService.deactivateSession(session.id);
      terminatedCount++;
    }

    return { terminatedCount };
  }

  @Get('my-suspicious-activity')
  @RequireAnyRole()
  async getMySuspiciousActivity(@Req() request: any): Promise<{
    suspiciousActivities: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  }> {
    const userId = request.user.userId;
    const suspiciousActivities = await this.sessionService.detectSuspiciousActivity(userId);
    return { suspiciousActivities };
  }

  @Get('validate/:sessionId')
  @RequireAnyRole()
  async validateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
    @Req() request: any
  ): Promise<{ valid: boolean; session?: SessionInfo }> {
    const userId = request.user.userId;
    const session = await this.sessionService.getSession(sessionId);
    
    if (!session || session.userId !== userId) {
      return { valid: false };
    }

    const isValid = await this.sessionService.validateSession(sessionId);
    return { 
      valid: isValid,
      session: isValid ? session : undefined 
    };
  }
}

// Admin Session Management Controller
@Controller('admin/sessions')
@UseGuards(JwtAuthGuard, RbacGuard)
export class AdminSessionController {
  constructor(private readonly sessionService: SessionService) {}

  @Get('stats')
  @RequireAdmin()
  async getSessionStats(): Promise<SessionStatsDto> {
    return await this.sessionService.getSessionStats();
  }

  @Get('user/:userId')
  @RequireAdmin()
  async getUserSessions(
    @Param('userId', ParseUUIDPipe) userId: string
  ): Promise<{ sessions: SessionInfo[] }> {
    const sessions = await this.sessionService.getUserSessions(userId);
    return { sessions };
  }

  @Get('user/:userId/suspicious-activity')
  @RequireAdmin()
  async getUserSuspiciousActivity(
    @Param('userId', ParseUUIDPipe) userId: string
  ): Promise<{
    suspiciousActivities: Array<{ type: string; description: string; severity: 'low' | 'medium' | 'high' }>;
  }> {
    const suspiciousActivities = await this.sessionService.detectSuspiciousActivity(userId);
    return { suspiciousActivities };
  }

  @Delete('user/:userId')
  @RequireAdmin()
  async terminateAllUserSessions(
    @Param('userId', ParseUUIDPipe) userId: string
  ): Promise<{ terminatedCount: number }> {
    const terminatedCount = await this.sessionService.deactivateAllUserSessions(userId);
    return { terminatedCount };
  }

  @Delete(':sessionId')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async terminateSession(
    @Param('sessionId', ParseUUIDPipe) sessionId: string
  ): Promise<void> {
    await this.sessionService.deactivateSession(sessionId);
  }

  @Post('cleanup-expired')
  @RequireAdmin()
  async cleanupExpiredSessions(): Promise<{ cleanedCount: number }> {
    const cleanedCount = await this.sessionService.cleanupExpiredSessions();
    return { cleanedCount };
  }

  @Get(':sessionId')
  @RequireAdmin()
  async getSessionDetails(
    @Param('sessionId', ParseUUIDPipe) sessionId: string
  ): Promise<{ session: SessionInfo | null }> {
    const session = await this.sessionService.getSession(sessionId);
    return { session };
  }
}