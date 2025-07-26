import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class IPWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IPWhitelistGuard.name);
  private readonly whitelist: string[];
  private readonly blacklist: string[];

  constructor(private configService: ConfigService) {
    this.whitelist = this.configService.get('IP_WHITELIST', '').split(',').filter(Boolean);
    this.blacklist = this.configService.get('IP_BLACKLIST', '').split(',').filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const clientIP = this.getClientIP(request);

    // Check blacklist first
    if (this.blacklist.includes(clientIP)) {
      this.logger.warn(`Blocked request from blacklisted IP: ${clientIP}`);
      throw new ForbiddenException('Access denied');
    }

    // Check whitelist if configured
    if (this.whitelist.length > 0) {
      if (!this.whitelist.includes(clientIP)) {
        this.logger.warn(`Blocked request from non-whitelisted IP: ${clientIP}`);
        throw new ForbiddenException('Access denied');
      }
    }

    return true;
  }

  private getClientIP(req: SecurityRequest): string {
    return (req.headers['x-forwarded-for'] as string)?.split(',')[0] ||
           (req.headers['x-real-ip'] as string) ||
           req.connection?.remoteAddress ||
           req.socket?.remoteAddress ||
           req.ip ||
           '127.0.0.1';
  }
}