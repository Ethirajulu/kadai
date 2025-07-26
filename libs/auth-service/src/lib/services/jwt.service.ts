import { Injectable, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { IJwtService } from './interfaces/auth.interface';
import { JwtPayload, TokenPair } from '../models/auth.model';
import { User, UserRole } from '../models/user.model';
import { AUTH_CONSTANTS, getRedisKey } from '../utils/constants';
import {
  TokenExpiredException,
  TokenInvalidException,
  TokenBlacklistedException,
} from '../utils/exceptions';

export interface RedisClient {
  setex(key: string, seconds: number, value: string): Promise<string>;
  get(key: string): Promise<string | null>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
}

@Injectable()
export class JwtService implements IJwtService {
  private readonly jwtSecret: string;
  private readonly jwtRefreshSecret: string;
  private readonly accessTokenExpiration: string;
  private readonly refreshTokenExpiration: string;
  private readonly jwtIssuer: string;
  private readonly jwtAudience: string;

  constructor(
    private readonly configService: ConfigService,
    @Inject('REDIS_CLIENT') private readonly redisClient: RedisClient,
  ) {
    const authConfig = this.configService.get('auth');
    this.jwtSecret = authConfig.jwtSecret;
    this.jwtRefreshSecret = authConfig.jwtRefreshSecret;
    this.accessTokenExpiration = authConfig.accessTokenExpiration;
    this.refreshTokenExpiration = authConfig.refreshTokenExpiration;
    this.jwtIssuer = authConfig.jwtIssuer;
    this.jwtAudience = authConfig.jwtAudience;
  }

  /**
   * Generate access token with user payload
   */
  generateAccessToken(payload: JwtPayload): string {
    const tokenPayload = {
      sub: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    };

    return jwt.sign(tokenPayload, this.jwtSecret, {
      expiresIn: this.accessTokenExpiration,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  /**
   * Generate refresh token with user payload
   */
  generateRefreshToken(payload: JwtPayload): string {
    const tokenPayload = {
      sub: payload.sub,
      email: payload.email,
      type: 'refresh',
    };

    return jwt.sign(tokenPayload, this.jwtRefreshSecret, {
      expiresIn: this.refreshTokenExpiration,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(user: User): TokenPair {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      permissions: this.getUserPermissions(user.role),
      iat: Math.floor(Date.now() / 1000),
      exp: 0, // Will be set by JWT library
    };

    const accessToken = this.generateAccessToken(payload);
    const refreshToken = this.generateRefreshToken(payload);

    // Calculate expiration times in seconds
    const accessExpiresIn = this.parseExpirationTime(this.accessTokenExpiration);
    const refreshExpiresIn = this.parseExpirationTime(this.refreshTokenExpiration);

    return {
      accessToken,
      refreshToken,
      expiresIn: accessExpiresIn,
      refreshExpiresIn: refreshExpiresIn,
    };
  }

  /**
   * Validate access token
   */
  async validateToken(token: string): Promise<JwtPayload | null> {
    try {
      // Check if token is blacklisted
      if (await this.isTokenBlacklisted(token)) {
        throw new TokenBlacklistedException();
      }

      const decoded = jwt.verify(token, this.jwtSecret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        algorithms: ['HS256'],
      }) as JwtPayload;

      return decoded;
    } catch (error) {
      if (error instanceof TokenBlacklistedException) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredException();
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new TokenInvalidException();
      }

      throw new TokenInvalidException();
    }
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(token: string): Promise<JwtPayload | null> {
    try {
      // Check if token is blacklisted
      if (await this.isTokenBlacklisted(token)) {
        throw new TokenBlacklistedException();
      }

      const decoded = jwt.verify(token, this.jwtRefreshSecret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        algorithms: ['HS256'],
      }) as JwtPayload;

      // Verify it's a refresh token
      if ((decoded as any).type !== 'refresh') {
        throw new TokenInvalidException('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error instanceof TokenBlacklistedException) {
        throw error;
      }

      if (error instanceof jwt.TokenExpiredError) {
        throw new TokenExpiredException();
      }

      if (error instanceof jwt.JsonWebTokenError) {
        throw new TokenInvalidException();
      }

      throw new TokenInvalidException();
    }
  }

  /**
   * Blacklist a token by storing it in Redis with TTL
   */
  async blacklistToken(token: string): Promise<void> {
    try {
      const decoded = jwt.decode(token) as JwtPayload;
      if (!decoded || !decoded.exp) {
        return; // Invalid token, nothing to blacklist
      }

      const now = Math.floor(Date.now() / 1000);
      const ttl = decoded.exp - now;

      if (ttl > 0) {
        const redisKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.BLACKLISTED_TOKENS, token);
        await this.redisClient.setex(redisKey, ttl, 'true');
      }
    } catch (error) {
      // Token might be malformed, but we don't throw an error
      // as blacklisting should be a silent operation
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    try {
      const redisKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.BLACKLISTED_TOKENS, token);
      const result = await this.redisClient.exists(redisKey);
      return result === 1;
    } catch (error) {
      // If Redis is down, we don't want to break authentication
      // Log the error and assume token is not blacklisted
      console.error('Redis error checking blacklist:', error);
      return false;
    }
  }

  /**
   * Extract token from Authorization header
   */
  extractTokenFromHeader(authHeader: string): string | null {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    return authHeader.substring(7); // Remove 'Bearer ' prefix
  }

  /**
   * Refresh token and generate new token pair with rotation tracking
   */
  async refreshTokenPair(refreshToken: string, user: User): Promise<TokenPair> {
    // Validate the refresh token
    const refreshPayload = await this.validateRefreshToken(refreshToken);
    
    if (!refreshPayload) {
      throw new TokenInvalidException('Invalid refresh token');
    }

    // Store token family relationship for rotation tracking
    const tokenFamily = await this.getTokenFamily(refreshToken);
    
    // Blacklist the old refresh token
    await this.blacklistToken(refreshToken);

    // Generate new token pair
    const newTokenPair = this.generateTokenPair(user);
    
    // Track token rotation in Redis for security monitoring
    await this.trackTokenRotation(refreshToken, newTokenPair.refreshToken, tokenFamily);

    return newTokenPair;
  }

  /**
   * Enhanced refresh with automatic user fetching
   */
  async refreshTokenPairByToken(refreshToken: string): Promise<TokenPair & { user: { id: string; email: string; role: string } }> {
    // Validate the refresh token
    const refreshPayload = await this.validateRefreshToken(refreshToken);
    
    if (!refreshPayload) {
      throw new TokenInvalidException('Invalid refresh token');
    }

    // Create minimal user object from token payload
    const user = {
      id: refreshPayload.sub,
      email: refreshPayload.email,
      role: refreshPayload.role || UserRole.CUSTOMER,
      permissions: refreshPayload.permissions || [],
      password: '', // Not needed for token generation
      name: '',     // Not needed for token generation
      status: 'active' as any,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date()
    } as User;

    // Generate new token pair
    const tokenPair = await this.refreshTokenPair(refreshToken, user);

    return {
      ...tokenPair,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
      }
    };
  }

  /**
   * Decode token without verification (for inspection purposes)
   */
  decodeToken(token: string): JwtPayload | null {
    try {
      return jwt.decode(token) as JwtPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.exp) {
      return null;
    }

    return new Date(decoded.exp * 1000);
  }

  /**
   * Check if token is expired (without throwing)
   */
  isTokenExpired(token: string): boolean {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return true;
    }

    return expiration < new Date();
  }

  /**
   * Get remaining time until token expires
   */
  getTokenTimeToLive(token: string): number {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) {
      return 0;
    }

    const now = new Date();
    const ttl = Math.floor((expiration.getTime() - now.getTime()) / 1000);
    return Math.max(0, ttl);
  }

  /**
   * Batch blacklist multiple tokens
   */
  async blacklistTokens(tokens: string[]): Promise<void> {
    const promises = tokens.map(token => this.blacklistToken(token));
    await Promise.allSettled(promises);
  }

  /**
   * Get user permissions based on role
   */
  private getUserPermissions(role: string): string[] {
    return AUTH_CONSTANTS.ROLE_PERMISSIONS[role as keyof typeof AUTH_CONSTANTS.ROLE_PERMISSIONS] || [];
  }

  /**
   * Parse expiration time string to seconds
   */
  private parseExpirationTime(expiration: string): number {
    const units: { [key: string]: number } = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
    };

    const match = expiration.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error(`Invalid expiration format: ${expiration}`);
    }

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit];
  }

  /**
   * Verify token signature without checking expiration
   */
  verifyTokenSignature(token: string, isRefreshToken = false): boolean {
    try {
      const secret = isRefreshToken ? this.jwtRefreshSecret : this.jwtSecret;
      jwt.verify(token, secret, {
        issuer: this.jwtIssuer,
        audience: this.jwtAudience,
        algorithms: ['HS256'],
        ignoreExpiration: true,
      });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Create a token with custom payload and expiration
   */
  createCustomToken(payload: Record<string, any>, expiresIn: string): string {
    return jwt.sign(payload, this.jwtSecret, {
      expiresIn,
      issuer: this.jwtIssuer,
      audience: this.jwtAudience,
      algorithm: 'HS256',
    } as jwt.SignOptions);
  }

  /**
   * Get token statistics for monitoring
   */
  getTokenInfo(token: string): {
    valid: boolean;
    expired: boolean;
    timeToLive: number;
    payload: JwtPayload | null;
  } {
    const payload = this.decodeToken(token);
    const expired = this.isTokenExpired(token);
    const timeToLive = this.getTokenTimeToLive(token);
    const validSignature = this.verifyTokenSignature(token);

    return {
      valid: validSignature && !expired,
      expired,
      timeToLive,
      payload,
    };
  }

  /**
   * Track token rotation for security monitoring
   */
  private async trackTokenRotation(
    oldToken: string, 
    newToken: string, 
    tokenFamily: string
  ): Promise<void> {
    try {
      const rotationKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.TOKEN_ROTATION, tokenFamily);
      const rotationData = {
        oldToken: this.hashToken(oldToken),
        newToken: this.hashToken(newToken),
        timestamp: Date.now(),
        rotationCount: await this.getRotationCount(tokenFamily) + 1
      };

      // Store rotation data with 7 day TTL
      await this.redisClient.setex(rotationKey, 7 * 24 * 60 * 60, JSON.stringify(rotationData));
      
      // Update family rotation count
      const familyKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.TOKEN_FAMILY, tokenFamily);
      await this.redisClient.setex(familyKey, 7 * 24 * 60 * 60, rotationData.rotationCount.toString());
    } catch (error) {
      // Log error but don't fail token refresh
      console.error('Failed to track token rotation:', error);
    }
  }

  /**
   * Get token family identifier for rotation tracking
   */
  private async getTokenFamily(token: string): Promise<string> {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded) {
        return this.generateTokenFamily();
      }

      // Check if token already has a family ID in Redis
      const tokenHash = this.hashToken(token);
      const familyKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.TOKEN_FAMILY_LOOKUP, tokenHash);
      const existingFamily = await this.redisClient.get(familyKey);
      
      if (existingFamily) {
        return existingFamily;
      }

      // Generate new family ID
      const newFamily = this.generateTokenFamily();
      await this.redisClient.setex(familyKey, 7 * 24 * 60 * 60, newFamily);
      
      return newFamily;
    } catch (error) {
      return this.generateTokenFamily();
    }
  }

  /**
   * Generate unique token family identifier
   */
  private generateTokenFamily(): string {
    return `tf_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Get current rotation count for a token family
   */
  private async getRotationCount(tokenFamily: string): Promise<number> {
    try {
      const familyKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.TOKEN_FAMILY, tokenFamily);
      const count = await this.redisClient.get(familyKey);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      return 0;
    }
  }

  /**
   * Hash token for secure storage and comparison
   */
  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Detect suspicious token rotation patterns
   */
  async detectSuspiciousRotation(tokenFamily: string): Promise<{
    suspicious: boolean;
    rotationCount: number;
    timeWindow: number;
  }> {
    try {
      const rotationCount = await this.getRotationCount(tokenFamily);
      const rotationKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.TOKEN_ROTATION, tokenFamily);
      const rotationData = await this.redisClient.get(rotationKey);
      
      if (!rotationData) {
        return { suspicious: false, rotationCount: 0, timeWindow: 0 };
      }

      const data = JSON.parse(rotationData);
      const timeWindow = Date.now() - data.timestamp;
      const hoursSinceRotation = timeWindow / (1000 * 60 * 60);

      // Flag as suspicious if more than 10 rotations in an hour
      const suspicious = rotationCount > 10 && hoursSinceRotation < 1;

      return {
        suspicious,
        rotationCount,
        timeWindow: Math.floor(timeWindow / 1000) // return in seconds
      };
    } catch (error) {
      return { suspicious: false, rotationCount: 0, timeWindow: 0 };
    }
  }

  /**
   * Revoke entire token family (useful for security incidents)
   */
  async revokeTokenFamily(tokenFamily: string): Promise<void> {
    try {
      // Get all tokens in this family and blacklist them
      const rotationKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.TOKEN_ROTATION, tokenFamily);
      const rotationData = await this.redisClient.get(rotationKey);
      
      if (rotationData) {
        // In a production system, you'd iterate through all tokens in the family
        // For now, we'll just mark the family as revoked
        const revokedKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.REVOKED_FAMILIES, tokenFamily);
        await this.redisClient.setex(revokedKey, 7 * 24 * 60 * 60, 'true');
      }
    } catch (error) {
      console.error('Failed to revoke token family:', error);
    }
  }

  /**
   * Check if token family is revoked
   */
  async isTokenFamilyRevoked(tokenFamily: string): Promise<boolean> {
    try {
      const revokedKey = getRedisKey(AUTH_CONSTANTS.REDIS_KEYS.REVOKED_FAMILIES, tokenFamily);
      const result = await this.redisClient.exists(revokedKey);
      return result === 1;
    } catch (error) {
      return false;
    }
  }
}