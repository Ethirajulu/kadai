import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  JWTTokenPayload,
  JWTTokenPair,
  User,
  UserRole,
  SecurityRequest,
  JWTAuthRequest,
} from '../types/security.types';

@Injectable()
export class JWTService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(JWTService.name);
  private redis!: Redis;
  private jwtConfig: any;

  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {
    this.jwtConfig = {
      accessTokenSecret: this.configService.get<string>(
        'security.jwt.accessTokenSecret'
      ),
      refreshTokenSecret: this.configService.get<string>(
        'security.jwt.refreshTokenSecret'
      ),
      accessTokenExpiry: this.configService.get<string>(
        'security.jwt.accessTokenExpiry',
        '15m'
      ),
      refreshTokenExpiry: this.configService.get<string>(
        'security.jwt.refreshTokenExpiry',
        '7d'
      ),
      issuer: this.configService.get<string>(
        'security.jwt.issuer',
        'kadai-auth'
      ),
      audience: this.configService.get<string>(
        'security.jwt.audience',
        'kadai-api'
      ),
      algorithm: this.configService.get<string>(
        'security.jwt.algorithm',
        'HS256'
      ),
    };
  }

  async onModuleInit() {
    await this.initializeRedis();
    this.logger.log('JWT service initialized');
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.disconnect();
        this.logger.log('Redis connection closed');
      } catch (error) {
        this.logger.error('Error closing Redis connection', error);
      }
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host', 'localhost'),
        port: this.configService.get<number>('redis.port', 6379),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db', 0),
        keyPrefix: 'jwt:',
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });

      await this.redis.ping();
      this.logger.log('Redis connection established for JWT service');
    } catch (error) {
      this.logger.error('Failed to connect to Redis for JWT service', error);
      throw error;
    }
  }

  /**
   * Generate access token for authenticated user
   */
  async generateAccessToken(user: User): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jti = uuidv4();

    const payload: Partial<JWTTokenPayload> = {
      sub: user.id,
      id: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      permissions: user.permissions,
      tokenType: 'access',
      iat: now,
      jti,
    };

    try {
      const token = this.jwtService.sign(payload, {
        secret: this.jwtConfig.accessTokenSecret,
        expiresIn: this.jwtConfig.accessTokenExpiry,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        algorithm: this.jwtConfig.algorithm,
      });

      this.logger.debug(`Access token generated for user ${user.id}`);
      return token;
    } catch (error) {
      this.logger.error('Failed to generate access token', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token for user
   */
  async generateRefreshToken(userId: string): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const jti = uuidv4();

    const payload: Partial<JWTTokenPayload> = {
      sub: userId,
      id: userId,
      tokenType: 'refresh',
      iat: now,
      jti,
    };

    try {
      const token = this.jwtService.sign(payload, {
        secret: this.jwtConfig.refreshTokenSecret,
        expiresIn: this.jwtConfig.refreshTokenExpiry,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
        algorithm: this.jwtConfig.algorithm,
      });

      this.logger.debug(`Refresh token generated for user ${userId}`);
      return token;
    } catch (error) {
      this.logger.error('Failed to generate refresh token', error);
      throw new Error('Refresh token generation failed');
    }
  }

  /**
   * Generate both access and refresh tokens
   */
  async generateTokenPair(user: User): Promise<JWTTokenPair> {
    try {
      const [accessToken, refreshToken] = await Promise.all([
        this.generateAccessToken(user),
        this.generateRefreshToken(user.id),
      ]);

      const expiresIn = this.parseExpiryToSeconds(
        this.jwtConfig.accessTokenExpiry
      );

      return {
        accessToken,
        refreshToken,
        expiresIn,
        tokenType: 'Bearer',
      };
    } catch (error) {
      this.logger.error('Failed to generate token pair', error);
      throw new Error('Token pair generation failed');
    }
  }

  /**
   * Validate access token
   */
  async validateAccessToken(token: string): Promise<JWTTokenPayload> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.jwtConfig.accessTokenSecret,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
      }) as JWTTokenPayload;

      // Check if token is blacklisted
      if (payload.jti && (await this.isTokenBlacklisted(payload.jti))) {
        throw new Error('Token has been revoked');
      }

      this.logger.debug(`Access token validated for user ${payload.sub}`);
      return payload;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error';
      this.logger.warn(`Access token validation failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Validate refresh token
   */
  async validateRefreshToken(token: string): Promise<JWTTokenPayload> {
    try {
      const payload = this.jwtService.verify(token, {
        secret: this.jwtConfig.refreshTokenSecret,
        issuer: this.jwtConfig.issuer,
        audience: this.jwtConfig.audience,
      }) as JWTTokenPayload;

      // Check if token is blacklisted
      if (payload.jti && (await this.isTokenBlacklisted(payload.jti))) {
        throw new Error('Refresh token has been revoked');
      }

      this.logger.debug(`Refresh token validated for user ${payload.sub}`);
      return payload;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown validation error';
      this.logger.warn(`Refresh token validation failed: ${errorMessage}`);
      throw error;
    }
  }

  /**
   * Refresh tokens using refresh token with user object
   */
  async refreshTokens(refreshToken: string, user: User): Promise<JWTTokenPair>;
  
  /**
   * Refresh tokens using refresh token with options
   */
  async refreshTokens(refreshToken: string, options: {
    rotateRefreshToken?: boolean;
    validateDevice?: boolean;
    requireSecureContext?: boolean;
  }): Promise<JWTTokenPair>;
  
  /**
   * Refresh tokens implementation
   */
  async refreshTokens(
    refreshToken: string, 
    userOrOptions: User | {
      rotateRefreshToken?: boolean;
      validateDevice?: boolean;
      requireSecureContext?: boolean;
    }
  ): Promise<JWTTokenPair> {
    try {
      // Validate refresh token
      const refreshPayload = await this.validateRefreshToken(refreshToken);

      // Determine if we have a User object or options
      const isUserObject = 'id' in userOrOptions;
      
      if (isUserObject) {
        const user = userOrOptions as User;
        if (refreshPayload.sub !== user.id) {
          throw new Error('Refresh token does not match user');
        }

        // Generate new token pair
        const newTokenPair = await this.generateTokenPair(user);

        // Blacklist old refresh token
        if (refreshPayload.jti && refreshPayload.exp) {
          await this.blacklistToken(refreshPayload.jti, refreshPayload.exp);
        }

        this.logger.debug(`Tokens refreshed for user ${user.id}`);
        return newTokenPair;
      } else {
        // Handle options-based call
        const options = userOrOptions as {
          rotateRefreshToken?: boolean;
          validateDevice?: boolean;
          requireSecureContext?: boolean;
        };

        // Create user from refresh payload
        const user: User = {
          id: refreshPayload.sub,
          email: refreshPayload.email || '',
          role: (refreshPayload.role as UserRole) || UserRole.USER,
          name: refreshPayload.name
        };

        // Generate new token pair
        const newTokenPair = await this.generateTokenPair(user);

        // Blacklist old refresh token if rotation is enabled
        if (options.rotateRefreshToken !== false && refreshPayload.jti && refreshPayload.exp) {
          await this.blacklistToken(refreshPayload.jti, refreshPayload.exp);
        }

        this.logger.debug(`Tokens refreshed for user ${user.id} with options`, options);
        return newTokenPair;
      }
    } catch (error) {
      this.logger.error('Token refresh failed', error);
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Blacklist a token by its JTI
   */
  async blacklistToken(jti: string, expirationTime: number): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Redis not available, skipping token blacklisting');
      return;
    }

    try {
      const now = Math.floor(Date.now() / 1000);
      const ttl = Math.max(1, expirationTime - now);

      await this.redis.setex(`blacklist:${jti}`, ttl, 'blacklisted');

      this.logger.debug(`Token ${jti} blacklisted with TTL ${ttl}`);
    } catch (error) {
      this.logger.error('Failed to blacklist token', error);
      throw new Error('Token blacklisting failed');
    }
  }

  /**
   * Check if token is blacklisted
   */
  async isTokenBlacklisted(jti: string): Promise<boolean> {
    if (!this.redis) {
      this.logger.warn('Redis not available, allowing token');
      return false;
    }

    try {
      const result = await this.redis.get(`blacklist:${jti}`);
      return result === 'blacklisted';
    } catch (error) {
      this.logger.warn('Redis error checking blacklist, allowing token', error);
      return false;
    }
  }

  /**
   * Revoke all tokens for a user
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    if (!this.redis) {
      this.logger.warn('Redis not available, skipping token revocation');
      return;
    }

    try {
      const pattern = `user:${userId}:*`;
      const stream = this.redis.scanStream({
        match: pattern,
        count: 100,
      });

      const keysToDelete: string[] = [];

      for await (const keys of stream) {
        keysToDelete.push(...keys);
      }

      if (keysToDelete.length > 0) {
        await this.redis.del(...keysToDelete);
        this.logger.debug(
          `Revoked ${keysToDelete.length} tokens for user ${userId}`
        );
      }
    } catch (error) {
      this.logger.error('Failed to revoke user tokens', error);
      throw new Error('Token revocation failed');
    }
  }

  /**
   * Extract token from request
   */
  extractTokenFromRequest(
    request: SecurityRequest | JWTAuthRequest
  ): string | null {
    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check custom headers (x-access-token)
    if (request.headers['x-access-token']) {
      return request.headers['x-access-token'] as string;
    }

    // Use request.get() method if available for custom headers
    if (typeof (request as any).get === 'function') {
      const customHeaderToken = (request as any).get('x-access-token');
      if (customHeaderToken) {
        return customHeaderToken;
      }
    }

    // Check cookies
    if (request.cookies?.accessToken) {
      return request.cookies.accessToken;
    }

    return null;
  }

  /**
   * Decode token without verification (for information only)
   */
  decodeToken(token: string): any {
    return this.jwtService.decode(token);
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): number | null {
    const decoded = this.decodeToken(token);
    return decoded?.exp || null;
  }

  /**
   * Check if token is near expiration
   */
  isTokenNearExpiration(token: string, thresholdMinutes = 5): boolean {
    const exp = this.getTokenExpiration(token);
    if (!exp) return false;

    const now = Math.floor(Date.now() / 1000);
    const threshold = thresholdMinutes * 60;

    return exp - now <= threshold;
  }

  /**
   * Logout user by blacklisting current tokens
   */
  async logout(accessToken: string, refreshToken?: string): Promise<void> {
    try {
      const accessPayload = this.decodeToken(accessToken);
      const refreshPayload = refreshToken
        ? this.decodeToken(refreshToken)
        : null;

      const blacklistPromises: Promise<void>[] = [];

      if (accessPayload?.jti && accessPayload?.exp) {
        blacklistPromises.push(
          this.blacklistToken(accessPayload.jti, accessPayload.exp)
        );
      }

      if (refreshPayload?.jti && refreshPayload?.exp) {
        blacklistPromises.push(
          this.blacklistToken(refreshPayload.jti, refreshPayload.exp)
        );
      }

      await Promise.all(blacklistPromises);

      this.logger.debug(`User ${accessPayload?.sub || 'unknown'} logged out`);
    } catch (error) {
      this.logger.error('Logout failed', error);
      throw new Error('Logout failed');
    }
  }

  /**
   * Parse expiry string to seconds
   */
  private parseExpiryToSeconds(expiry: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };

    const match = expiry.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(`Invalid expiry format: ${expiry}`);
    }

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit];
  }

  /**
   * Health check for JWT service
   */
  async healthCheck(): Promise<{
    status: string;
    redis: boolean;
    config: boolean;
  }> {
    let redisStatus = false;
    let configStatus = false;

    try {
      if (this.redis) {
        await this.redis.ping();
        redisStatus = true;
      }
    } catch (error) {
      this.logger.warn('Redis health check failed', error);
    }

    try {
      configStatus = !!(
        this.jwtConfig.accessTokenSecret &&
        this.jwtConfig.refreshTokenSecret &&
        this.jwtConfig.issuer &&
        this.jwtConfig.audience
      );
    } catch (error) {
      this.logger.warn('JWT config health check failed', error);
    }

    return {
      status: redisStatus && configStatus ? 'healthy' : 'unhealthy',
      redis: redisStatus,
      config: configStatus,
    };
  }
}
