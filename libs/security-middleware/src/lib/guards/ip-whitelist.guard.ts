import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class IPWhitelistGuard implements CanActivate {
  private readonly logger = new Logger(IPWhitelistGuard.name);
  private readonly whitelist: string[];
  private readonly blacklist: string[];

  constructor(private configService: ConfigService) {
    this.whitelist = this.configService
      .get('IP_WHITELIST', '')
      .split(',')
      .filter(Boolean);
    this.blacklist = this.configService
      .get('IP_BLACKLIST', '')
      .split(',')
      .filter(Boolean);
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
        this.logger.warn(
          `Blocked request from non-whitelisted IP: ${clientIP}`
        );
        throw new ForbiddenException('Access denied');
      }
    }

    return true;
  }

  private getClientIP(req: SecurityRequest): string {
    // Handle null/undefined headers
    if (!req.headers) {
      return (
        req.connection?.remoteAddress ||
        req.socket?.remoteAddress ||
        req.ip ||
        '127.0.0.1'
      );
    }

    // Get IP from x-forwarded-for header (first IP in the list)
    const xForwardedFor = req.headers['x-forwarded-for'] as string;
    if (xForwardedFor) {
      const firstIP = xForwardedFor.split(',')[0]?.trim();
      if (firstIP && this.isValidIP(firstIP)) {
        return firstIP;
      }
    }

    // Get IP from x-real-ip header
    const xRealIP = req.headers['x-real-ip'] as string;
    if (xRealIP && this.isValidIP(xRealIP.trim())) {
      return xRealIP.trim();
    }

    // Fallback to connection/socket/req.ip
    return (
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      req.ip ||
      '127.0.0.1'
    );
  }

  private isValidIP(ip: string): boolean {
    // Basic IP validation - check if it's a valid IPv4 or IPv6 format
    const ipv4Regex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    return ipv4Regex.test(ip) || ipv6Regex.test(ip);
  }
}
