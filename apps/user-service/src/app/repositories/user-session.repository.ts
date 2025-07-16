import { Injectable } from '@nestjs/common';
import { PrismaService } from '@kadai/database-config';
import { UserSessionEntity } from '../entities/user-session.entity';
import { Prisma } from '@prisma/client';

export interface CreateUserSessionDto {
  userId: string;
  token: string;
  device?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt: Date;
}

@Injectable()
export class UserSessionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSessionDto: CreateUserSessionDto): Promise<UserSessionEntity> {
    const session = await this.prisma.userSession.create({
      data: {
        userId: createSessionDto.userId,
        token: createSessionDto.token,
        device: createSessionDto.device,
        ipAddress: createSessionDto.ipAddress,
        userAgent: createSessionDto.userAgent,
        expiresAt: createSessionDto.expiresAt,
        isActive: true,
      },
    });

    return new UserSessionEntity(session);
  }

  async findById(id: string): Promise<UserSessionEntity | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { id },
    });

    if (!session) return null;

    return new UserSessionEntity(session);
  }

  async findByToken(token: string): Promise<UserSessionEntity | null> {
    const session = await this.prisma.userSession.findUnique({
      where: { token },
    });

    if (!session) return null;

    return new UserSessionEntity(session);
  }

  async findByUserId(userId: string): Promise<UserSessionEntity[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(session => new UserSessionEntity(session));
  }

  async findActiveByUserId(userId: string): Promise<UserSessionEntity[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: { 
        userId,
        isActive: true,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(session => new UserSessionEntity(session));
  }

  async updateTokens(sessionId: string, accessToken: string, refreshToken: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { 
        token: accessToken,
        // Note: We're storing the access token in the token field
        // In a real implementation, you might want separate fields
        updatedAt: new Date(),
      },
    });
  }

  async deactivateSession(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { isActive: false },
    });
  }

  async deactivateAllUserSessions(userId: string): Promise<number> {
    const result = await this.prisma.userSession.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });

    return result.count;
  }

  async cleanupExpiredSessions(): Promise<number> {
    const result = await this.prisma.userSession.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: new Date() } },
          { isActive: false },
        ],
      },
    });

    return result.count;
  }

  async getUserSessionStats(userId: string): Promise<{
    total: number;
    active: number;
    expired: number;
    devices: string[];
  }> {
    const sessions = await this.prisma.userSession.findMany({
      where: { userId },
    });

    const now = new Date();
    const active = sessions.filter(s => s.isActive && s.expiresAt > now).length;
    const expired = sessions.filter(s => !s.isActive || s.expiresAt <= now).length;
    const devices = [...new Set(sessions.map(s => s.device).filter(Boolean))];

    return {
      total: sessions.length,
      active,
      expired,
      devices,
    };
  }

  async findSessionsByDevice(userId: string, device: string): Promise<UserSessionEntity[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: { 
        userId,
        device,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(session => new UserSessionEntity(session));
  }

  async findSessionsByIpAddress(userId: string, ipAddress: string): Promise<UserSessionEntity[]> {
    const sessions = await this.prisma.userSession.findMany({
      where: { 
        userId,
        ipAddress,
      },
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map(session => new UserSessionEntity(session));
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    await this.prisma.userSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
  }
}