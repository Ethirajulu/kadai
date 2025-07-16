import { UserSession as PrismaUserSession } from '@prisma/client';

export class UserSessionEntity implements PrismaUserSession {
  id: string;
  userId: string;
  token: string;
  device: string | null;
  ipAddress: string | null;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<UserSessionEntity>) {
    Object.assign(this, partial);
  }

  // Business logic methods
  isExpired(): boolean {
    return new Date() > this.expiresAt;
  }

  canBeUsed(): boolean {
    return this.isActive && !this.isExpired();
  }

  deactivate(): void {
    this.isActive = false;
  }

  getRemainingTime(): number {
    const now = new Date();
    const remaining = this.expiresAt.getTime() - now.getTime();
    return Math.max(0, remaining);
  }

  getRemainingTimeInMinutes(): number {
    return Math.floor(this.getRemainingTime() / (1000 * 60));
  }

  // Security methods
  matchesDevice(device: string): boolean {
    return this.device === device;
  }

  matchesIpAddress(ipAddress: string): boolean {
    return this.ipAddress === ipAddress;
  }
}

export interface SessionInfo {
  id: string;
  device: string | null;
  ipAddress: string | null;
  isActive: boolean;
  expiresAt: Date;
  createdAt: Date;
  remainingTimeInMinutes: number;
}