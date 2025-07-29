import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as geoip from 'geoip-lite';
import { SecurityRequest, IPInfo } from '../types/security.types';

@Injectable()
export class GeoSecurityService {
  private readonly logger = new Logger(GeoSecurityService.name);
  private readonly allowedCountries: string[];
  private readonly blockedCountries: string[];
  // fallbackCountry removed as it's not used

  constructor(private configService: ConfigService) {
    this.allowedCountries = this.configService
      .get('ALLOWED_COUNTRIES', '')
      .split(',')
      .filter((country: string) => country.trim());
    
    this.blockedCountries = this.configService
      .get('BLOCKED_COUNTRIES', '')
      .split(',')
      .filter((country: string) => country.trim());
    
    // fallbackCountry assignment removed
  }

  /**
   * Get geographic information for an IP address
   */
  getGeoInfo(ip: string): IPInfo | null {
    try {
      const geoData = geoip.lookup(ip);
      if (!geoData) {
        return null;
      }

      return {
        country: geoData.country,
        region: geoData.region,
        city: geoData.city,
        ll: geoData.ll,
        metro: geoData.metro || 0,
        area: geoData.area || 0,
      };
    } catch (error) {
      this.logger.warn(`Failed to get geo info for IP ${ip}:`, error);
      return null;
    }
  }

  /**
   * Check if a country is allowed
   */
  isCountryAllowed(country: string): boolean {
    // If no allowed countries specified, all are allowed (except blocked)
    if (this.allowedCountries.length === 0) {
      return !this.isCountryBlocked(country);
    }

    return this.allowedCountries.includes(country.toUpperCase()) && !this.isCountryBlocked(country);
  }

  /**
   * Check if a country is blocked
   */
  isCountryBlocked(country: string): boolean {
    return this.blockedCountries.includes(country.toUpperCase());
  }

  /**
   * Detect geographic anomalies based on request patterns
   */
  isGeographicAnomaly(req: SecurityRequest, geoInfo: IPInfo): boolean {
    try {
      // Check for rapid location changes (if user info available)
      if (req.user && req.user.lastLoginLocation) {
        const lastLocation = req.user.lastLoginLocation;
        const currentLocation = [geoInfo.ll[0], geoInfo.ll[1]];
        
        // Calculate distance between locations (rough calculation)
        const distance = this.calculateDistance(
          lastLocation[0], lastLocation[1],
          currentLocation[0], currentLocation[1]
        );
        
        // If user traveled more than 1000km in less than 2 hours, flag as anomaly
        const timeDiff = Date.now() - (req.user.lastLoginTime || 0);
        const twoHours = 2 * 60 * 60 * 1000;
        
        if (distance > 1000 && timeDiff < twoHours) {
          this.logger.warn('Geographic anomaly detected: Rapid location change', {
            userId: req.user.id,
            previousLocation: lastLocation,
            currentLocation,
            distance: `${distance}km`,
            timeDiff: `${Math.round(timeDiff / 1000 / 60)}min`,
          });
          return true;
        }
      }

      // Check for access from high-risk countries
      const highRiskCountries = ['CN', 'RU', 'KP', 'IR']; // Example high-risk countries
      if (highRiskCountries.includes(geoInfo.country)) {
        this.logger.warn('Access from high-risk country detected', {
          country: geoInfo.country,
          ip: this.getClientIP(req),
          city: geoInfo.city,
        });
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error('Error detecting geographic anomaly:', error);
      return false;
    }
  }

  /**
   * Calculate distance between two coordinates (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.deg2rad(lat2 - lat1);
    const dLon = this.deg2rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.deg2rad(lat1)) * Math.cos(this.deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Convert degrees to radians
   */
  private deg2rad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Get client IP address from request
   */
  private getClientIP(req: SecurityRequest): string {
    const forwardedFor = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];
    const cfConnectingIP = req.headers['cf-connecting-ip'];
    
    if (forwardedFor) {
      const ips = Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor;
      return ips.split(',')[0].trim();
    }
    
    if (realIP) {
      return Array.isArray(realIP) ? realIP[0] : realIP;
    }
    
    if (cfConnectingIP) {
      return Array.isArray(cfConnectingIP) ? cfConnectingIP[0] : cfConnectingIP;
    }
    
    return req.connection?.remoteAddress || req.socket?.remoteAddress || req.ip || 'unknown';
  }
}