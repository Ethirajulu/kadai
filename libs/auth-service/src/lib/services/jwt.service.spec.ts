import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService as NestJwtService } from '@nestjs/jwt';
import { JwtService } from './jwt.service';
import { MockRedisClient } from './redis.factory';
import { UserRole } from '../models/user.model';
import { User } from '../models/user.model';
import {
  TokenInvalidException,
  TokenBlacklistedException,
} from '../utils/exceptions';

describe('JwtService', () => {
  let service: JwtService;
  let redisClient: MockRedisClient;
  let configService: ConfigService;

  const mockAuthConfig = {
    jwtSecret: 'test-secret',
    jwtRefreshSecret: 'test-refresh-secret',
    accessTokenExpiration: '15m',
    refreshTokenExpiration: '7d',
    jwtIssuer: 'kadai-platform',
    jwtAudience: 'kadai-users',
  };

  const mockUser: User = {
    id: 'user-123',
    email: 'test@example.com',
    password: 'hashed-password',
    name: 'Test User',
    role: UserRole.CUSTOMER,
    status: 'active' as any,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    redisClient = new MockRedisClient();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtService,
        {
          provide: NestJwtService,
          useValue: {
            sign: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(mockAuthConfig),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: redisClient,
        },
      ],
    }).compile();

    service = module.get<JwtService>(JwtService);
    configService = module.get<ConfigService>(ConfigService);
  });

  afterEach(() => {
    redisClient.clear();
  });

  describe('generateTokenPair', () => {
    it('should generate access and refresh tokens', () => {
      const tokenPair = service.generateTokenPair(mockUser);

      expect(tokenPair).toHaveProperty('accessToken');
      expect(tokenPair).toHaveProperty('refreshToken');
      expect(tokenPair).toHaveProperty('expiresIn');
      expect(tokenPair).toHaveProperty('refreshExpiresIn');
      expect(typeof tokenPair.accessToken).toBe('string');
      expect(typeof tokenPair.refreshToken).toBe('string');
      expect(tokenPair.expiresIn).toBe(900); // 15 minutes
      expect(tokenPair.refreshExpiresIn).toBe(604800); // 7 days
    });

    it('should include correct payload in access token', () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const decoded = service.decodeToken(tokenPair.accessToken);

      expect(decoded).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        permissions: expect.any(Array),
      });
    });
  });

  describe('validateToken', () => {
    it('should validate a valid token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const payload = await service.validateToken(tokenPair.accessToken);

      expect(payload).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('should throw TokenBlacklistedException for blacklisted token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      await service.blacklistToken(tokenPair.accessToken);

      await expect(service.validateToken(tokenPair.accessToken))
        .rejects.toThrow(TokenBlacklistedException);
    });

    it('should throw TokenInvalidException for invalid token', async () => {
      await expect(service.validateToken('invalid-token'))
        .rejects.toThrow(TokenInvalidException);
    });
  });

  describe('validateRefreshToken', () => {
    it('should validate a valid refresh token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const payload = await service.validateRefreshToken(tokenPair.refreshToken);

      expect(payload).toMatchObject({
        sub: mockUser.id,
        email: mockUser.email,
      });
    });

    it('should throw error for access token used as refresh token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);

      await expect(service.validateRefreshToken(tokenPair.accessToken))
        .rejects.toThrow(TokenInvalidException);
    });
  });

  describe('blacklistToken', () => {
    it('should blacklist a token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);

      await service.blacklistToken(tokenPair.accessToken);
      const isBlacklisted = await service.isTokenBlacklisted(tokenPair.accessToken);

      expect(isBlacklisted).toBe(true);
    });

    it('should not throw error for invalid token', async () => {
      await expect(service.blacklistToken('invalid-token'))
        .resolves.not.toThrow();
    });
  });

  describe('isTokenBlacklisted', () => {
    it('should return false for non-blacklisted token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const isBlacklisted = await service.isTokenBlacklisted(tokenPair.accessToken);

      expect(isBlacklisted).toBe(false);
    });

    it('should return true for blacklisted token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      await service.blacklistToken(tokenPair.accessToken);

      const isBlacklisted = await service.isTokenBlacklisted(tokenPair.accessToken);

      expect(isBlacklisted).toBe(true);
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from Bearer header', () => {
      const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...';
      const authHeader = `Bearer ${token}`;

      const extracted = service.extractTokenFromHeader(authHeader);

      expect(extracted).toBe(token);
    });

    it('should return null for invalid header', () => {
      expect(service.extractTokenFromHeader('Invalid header')).toBeNull();
      expect(service.extractTokenFromHeader('')).toBeNull();
      expect(service.extractTokenFromHeader('Basic dGVzdA==')).toBeNull();
    });
  });

  describe('refreshTokenPair', () => {
    it('should generate new token pair and blacklist old refresh token', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      
      // Wait a bit to ensure different timestamps
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const newTokenPair = await service.refreshTokenPair(tokenPair.refreshToken, mockUser);

      expect(newTokenPair.accessToken).not.toBe(tokenPair.accessToken);
      expect(newTokenPair.refreshToken).not.toBe(tokenPair.refreshToken);

      // Old refresh token should be blacklisted
      const isOldTokenBlacklisted = await service.isTokenBlacklisted(tokenPair.refreshToken);
      expect(isOldTokenBlacklisted).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return correct expiration date', () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const expiration = service.getTokenExpiration(tokenPair.accessToken);

      expect(expiration).toBeInstanceOf(Date);
      expect(expiration!.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null for invalid token', () => {
      const expiration = service.getTokenExpiration('invalid-token');
      expect(expiration).toBeNull();
    });
  });

  describe('isTokenExpired', () => {
    it('should return false for valid token', () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const isExpired = service.isTokenExpired(tokenPair.accessToken);

      expect(isExpired).toBe(false);
    });

    it('should return true for invalid token', () => {
      const isExpired = service.isTokenExpired('invalid-token');
      expect(isExpired).toBe(true);
    });
  });

  describe('getTokenTimeToLive', () => {
    it('should return positive TTL for valid token', () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const ttl = service.getTokenTimeToLive(tokenPair.accessToken);

      expect(ttl).toBeGreaterThan(0);
      expect(ttl).toBeLessThanOrEqual(900); // 15 minutes
    });

    it('should return 0 for invalid token', () => {
      const ttl = service.getTokenTimeToLive('invalid-token');
      expect(ttl).toBe(0);
    });
  });

  describe('blacklistTokens', () => {
    it('should blacklist multiple tokens', async () => {
      const tokenPair1 = service.generateTokenPair(mockUser);
      const tokenPair2 = service.generateTokenPair(mockUser);

      await service.blacklistTokens([tokenPair1.accessToken, tokenPair2.accessToken]);

      const isToken1Blacklisted = await service.isTokenBlacklisted(tokenPair1.accessToken);
      const isToken2Blacklisted = await service.isTokenBlacklisted(tokenPair2.accessToken);

      expect(isToken1Blacklisted).toBe(true);
      expect(isToken2Blacklisted).toBe(true);
    });
  });

  describe('verifyTokenSignature', () => {
    it('should verify valid token signature', () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const isValid = service.verifyTokenSignature(tokenPair.accessToken);

      expect(isValid).toBe(true);
    });

    it('should return false for invalid signature', () => {
      const isValid = service.verifyTokenSignature('invalid-token');
      expect(isValid).toBe(false);
    });
  });

  describe('createCustomToken', () => {
    it('should create token with custom payload', () => {
      const customPayload = { customField: 'customValue' };
      const token = service.createCustomToken(customPayload, '1h');

      const decoded = service.decodeToken(token);
      expect(decoded).toMatchObject(customPayload);
    });
  });

  describe('refreshTokenPairByToken', () => {
    it('should refresh token pair and return user info', async () => {
      const tokenPair = service.generateTokenPair(mockUser);
      
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const result = await service.refreshTokenPairByToken(tokenPair.refreshToken);

      expect(result.accessToken).not.toBe(tokenPair.accessToken);
      expect(result.refreshToken).not.toBe(tokenPair.refreshToken);
      expect(result.user).toMatchObject({
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      });
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(service.refreshTokenPairByToken('invalid-refresh-token'))
        .rejects.toThrow(TokenInvalidException);
    });
  });

  describe('detectSuspiciousRotation', () => {
    it('should return rotation analysis results', async () => {
      const tokenFamily = 'test-family';
      
      const result = await service.detectSuspiciousRotation(tokenFamily);
      
      // Just verify the structure is correct
      expect(typeof result.suspicious).toBe('boolean');
      expect(typeof result.rotationCount).toBe('number');
      expect(typeof result.timeWindow).toBe('number');
    });

    it('should not flag normal rotation as suspicious', async () => {
      const tokenFamily = 'normal-family';
      
      const result = await service.detectSuspiciousRotation(tokenFamily);
      
      expect(result.suspicious).toBe(false);
    });
  });

  describe('revokeTokenFamily', () => {
    it('should handle revoking family gracefully', async () => {
      const tokenFamily = 'revoke-family';
      
      await expect(service.revokeTokenFamily(tokenFamily))
        .resolves.not.toThrow();
    });

    it('should handle revoking non-existent family gracefully', async () => {
      await expect(service.revokeTokenFamily('non-existent-family'))
        .resolves.not.toThrow();
    });
  });

  describe('isTokenFamilyRevoked', () => {
    it('should return false for non-revoked family', async () => {
      const tokenFamily = 'normal-family';
      
      const isRevoked = await service.isTokenFamilyRevoked(tokenFamily);
      expect(isRevoked).toBe(false);
    });

    it('should handle checking revoked family gracefully', async () => {
      const tokenFamily = 'revoked-family';
      
      const isRevoked = await service.isTokenFamilyRevoked(tokenFamily);
      expect(typeof isRevoked).toBe('boolean');
    });
  });

  describe('getTokenInfo', () => {
    it('should return complete token information', () => {
      const tokenPair = service.generateTokenPair(mockUser);
      const tokenInfo = service.getTokenInfo(tokenPair.accessToken);

      expect(tokenInfo).toMatchObject({
        valid: true,
        expired: false,
        timeToLive: expect.any(Number),
        payload: expect.objectContaining({
          sub: mockUser.id,
          email: mockUser.email,
        }),
      });
    });

    it('should return correct info for invalid token', () => {
      const tokenInfo = service.getTokenInfo('invalid-token');

      expect(tokenInfo).toMatchObject({
        valid: false,
        expired: true,
        timeToLive: 0,
        payload: null,
      });
    });
  });
});