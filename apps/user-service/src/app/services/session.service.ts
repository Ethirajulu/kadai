import { Injectable, Logger } from '@nestjs/common';
import { UserSessionEntity } from '../entities/user-session.entity';
import { UserSessionRepository } from '../repositories/user-session.repository';

export interface SessionInfo {
  id: string;
  userId: string;
  device?: string;
  ipAddress?: string;
  userAgent?: string;
  isActive: boolean;
  expiresAt: Date;
  lastActivity: Date;
  createdAt: Date;
}

export interface CreateSessionDto {
  userId: string;
  token: string;
  device?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt?: Date;
}

export interface SessionStatsDto {
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  averageSessionDuration: number;
  topDevices: Array<{ device: string; count: number }>;
  recentLogins: Array<{
    userId: string;
    device?: string;
    ipAddress?: string;
    timestamp: Date;
  }>;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  private readonly maxSessionsPerUser = 5;
  private readonly sessionTimeout = 7 * 24 * 60 * 60 * 1000; // 7 days

  constructor(private readonly userSessionRepository: UserSessionRepository) {}

  async createSession(
    createSessionDto: CreateSessionDto
  ): Promise<SessionInfo> {
    const { userId, token, device, ipAddress, userAgent } = createSessionDto;

    // Check existing active sessions for user
    const existingSessions = await this.userSessionRepository.findByUserId(
      userId
    );
    const activeSessions = existingSessions.filter((session) =>
      session.canBeUsed()
    );

    // If user has too many active sessions, deactivate the oldest one
    if (activeSessions.length >= this.maxSessionsPerUser) {
      const oldestSession = activeSessions.sort(
        (a, b) => a.lastActivity.getTime() - b.lastActivity.getTime()
      )[0];

      await this.userSessionRepository.deactivateSession(oldestSession.id);
      this.logger.warn(
        `Deactivated oldest session for user ${userId} due to session limit`
      );
    }

    // Create new session
    const expiresAt =
      createSessionDto.expiresAt || new Date(Date.now() + this.sessionTimeout);

    const session = await this.userSessionRepository.create({
      userId,
      token,
      device,
      ipAddress,
      expiresAt,
    });

    this.logger.log(
      `Created new session ${session.id} for user ${userId} from ${ipAddress}`
    );

    return this.mapToSessionInfo(session);
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.userSessionRepository.findById(sessionId);
    if (!session) {
      return null;
    }

    return this.mapToSessionInfo(session);
  }

  async getSessionByToken(token: string): Promise<SessionInfo | null> {
    const session = await this.userSessionRepository.findByToken(token);
    if (!session) {
      return null;
    }

    return this.mapToSessionInfo(session);
  }

  async getUserSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.userSessionRepository.findByUserId(userId);
    return sessions.map((session) => this.mapToSessionInfo(session));
  }

  async getActiveSessions(userId: string): Promise<SessionInfo[]> {
    const sessions = await this.getUserSessions(userId);
    return sessions.filter(
      (session) => session.isActive && session.expiresAt > new Date()
    );
  }

  async updateSessionActivity(sessionId: string): Promise<void> {
    await this.userSessionRepository.updateLastActivity(sessionId);
  }

  async updateSessionToken(
    sessionId: string,
    newAccessToken: string,
    newRefreshToken: string
  ): Promise<void> {
    await this.userSessionRepository.updateTokens(
      sessionId,
      newAccessToken,
      newRefreshToken
    );
    this.logger.log(`Updated tokens for session ${sessionId}`);
  }

  async validateSession(sessionId: string): Promise<boolean> {
    const session = await this.userSessionRepository.findById(sessionId);
    if (!session) {
      return false;
    }

    if (!session.canBeUsed()) {
      this.logger.warn(`Attempted to use invalid session ${sessionId}`);
      return false;
    }

    // Update last activity
    await this.updateSessionActivity(sessionId);
    return true;
  }

  async deactivateSession(sessionId: string): Promise<void> {
    await this.userSessionRepository.deactivateSession(sessionId);
    this.logger.log(`Deactivated session ${sessionId}`);
  }

  async deactivateAllUserSessions(userId: string): Promise<number> {
    const count = await this.userSessionRepository.deactivateAllUserSessions(
      userId
    );
    this.logger.log(`Deactivated ${count} sessions for user ${userId}`);
    return count;
  }

  async deactivateSessionByToken(token: string): Promise<void> {
    const session = await this.userSessionRepository.findByToken(token);
    if (session) {
      await this.deactivateSession(session.id);
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    // This would typically be called by a scheduled job
    const expiredSessions =
      await this.userSessionRepository.findExpiredSessions();

    let cleanedCount = 0;
    for (const session of expiredSessions) {
      await this.userSessionRepository.deactivateSession(session.id);
      cleanedCount++;
    }

    if (cleanedCount > 0) {
      this.logger.log(`Cleaned up ${cleanedCount} expired sessions`);
    }

    return cleanedCount;
  }

  async getSessionStats(): Promise<SessionStatsDto> {
    const allSessions = await this.userSessionRepository.findAll();
    const now = new Date();

    const activeSessions = allSessions.filter(
      (s) => s.isActive && s.expiresAt > now
    );
    const expiredSessions = allSessions.filter((s) => s.expiresAt <= now);

    // Calculate average session duration
    const completedSessions = allSessions.filter((s) => !s.isActive);
    const totalDuration = completedSessions.reduce((sum, session) => {
      const duration =
        (session.lastActivity.getTime() - session.createdAt.getTime()) / 1000;
      return sum + duration;
    }, 0);
    const averageSessionDuration =
      completedSessions.length > 0
        ? Math.round(totalDuration / completedSessions.length)
        : 0;

    // Top devices
    const deviceCounts = new Map<string, number>();
    allSessions.forEach((session) => {
      const device = session.device || 'Unknown';
      deviceCounts.set(device, (deviceCounts.get(device) || 0) + 1);
    });

    const topDevices = Array.from(deviceCounts.entries())
      .map(([device, count]) => ({ device, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent logins (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogins = allSessions
      .filter((session) => session.createdAt > oneDayAgo)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 20)
      .map((session) => ({
        userId: session.userId,
        device: session.device || undefined,
        ipAddress: session.ipAddress || undefined,
        timestamp: session.createdAt,
      }));

    return {
      totalSessions: allSessions.length,
      activeSessions: activeSessions.length,
      expiredSessions: expiredSessions.length,
      averageSessionDuration,
      topDevices,
      recentLogins,
    };
  }

  async detectSuspiciousActivity(
    userId: string
  ): Promise<
    Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
    }>
  > {
    const sessions = await this.getUserSessions(userId);
    const suspiciousActivities: Array<{
      type: string;
      description: string;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    // Check for multiple concurrent sessions from different IPs
    const activeSessions = sessions.filter(
      (s) => s.isActive && s.expiresAt > new Date()
    );
    const uniqueIPs = new Set(
      activeSessions.map((s) => s.ipAddress).filter(Boolean)
    );

    if (uniqueIPs.size > 3) {
      suspiciousActivities.push({
        type: 'multiple_ips',
        description: `User has active sessions from ${uniqueIPs.size} different IP addresses`,
        severity: 'high',
      });
    }

    // Check for rapid session creation
    const recentSessions = sessions.filter(
      (s) => s.createdAt > new Date(Date.now() - 60 * 60 * 1000) // Last hour
    );

    if (recentSessions.length > 5) {
      suspiciousActivities.push({
        type: 'rapid_sessions',
        description: `${recentSessions.length} sessions created in the last hour`,
        severity: 'medium',
      });
    }

    // Check for unusual devices
    const deviceCounts = new Map<string, number>();
    sessions.forEach((s) => {
      if (s.device) {
        deviceCounts.set(s.device, (deviceCounts.get(s.device) || 0) + 1);
      }
    });

    if (deviceCounts.size > 10) {
      suspiciousActivities.push({
        type: 'multiple_devices',
        description: `User has used ${deviceCounts.size} different devices`,
        severity: 'low',
      });
    }

    return suspiciousActivities;
  }

  private mapToSessionInfo(session: UserSessionEntity): SessionInfo {
    return {
      id: session.id,
      userId: session.userId,
      device: session.device || undefined,
      ipAddress: session.ipAddress || undefined,
      userAgent: session.userAgent || undefined,
      isActive: session.isActive,
      expiresAt: session.expiresAt,
      lastActivity: session.lastActivity,
      createdAt: session.createdAt,
    };
  }
}
