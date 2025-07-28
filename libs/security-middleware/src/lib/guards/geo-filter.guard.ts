import { Injectable, CanActivate, ExecutionContext, ForbiddenException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import * as geoip from 'geoip-lite';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class GeoFilterGuard implements CanActivate {
  private readonly logger = new Logger(GeoFilterGuard.name);
  private readonly allowedCountries: string[];
  private readonly blockedCountries: string[];

  constructor(
    private configService: ConfigService,
    private reflector: Reflector,
  ) {
    this.allowedCountries = this.configService.get('ALLOWED_COUNTRIES', 'IN,US,GB').split(',').filter(Boolean);
    this.blockedCountries = this.configService.get('BLOCKED_COUNTRIES', '').split(',').filter(Boolean);
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const clientIP = this.getClientIP(request);
    
    // Get country-specific configuration from decorator if present
    const routeAllowedCountries = this.reflector.get<string[]>('allowedCountries', context.getHandler()) || this.allowedCountries;
    const routeBlockedCountries = this.reflector.get<string[]>('blockedCountries', context.getHandler()) || this.blockedCountries;

    const geoInfo = geoip.lookup(clientIP);
    
    if (geoInfo) {
      const country = geoInfo.country;

      // Check blocked countries first
      if (routeBlockedCountries.includes(country)) {
        this.logger.warn(`Blocked request from blocked country: ${country} (IP: ${clientIP})`);
        throw new ForbiddenException('Access denied from your location');
      }

      // Check allowed countries
      if (routeAllowedCountries.length > 0 && !routeAllowedCountries.includes(country)) {
        this.logger.warn(`Blocked request from non-allowed country: ${country} (IP: ${clientIP})`);
        throw new ForbiddenException('Access denied from your location');
      }

      // Store geo info in request for later use
      request.ipInfo = {
        country: geoInfo.country,
        region: geoInfo.region,
        city: geoInfo.city,
        ll: geoInfo.ll,
        metro: geoInfo.metro || 0,
        area: geoInfo.area || 0,
      };
    } else {
      // Handle unknown IPs - log and allow by default but could be configured to block
      this.logger.warn(`Unable to determine country for IP: ${clientIP}`);
      request.ipInfo = {
        country: 'Unknown',
        region: 'Unknown',
        city: 'Unknown',
        ll: [0, 0],
        metro: 0,
        area: 0,
      };
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