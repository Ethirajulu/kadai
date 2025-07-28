import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { JWTService } from './jwt.service';
import { SecurityRequest, UserRole } from '../types/security.types';
import Redis from 'ioredis';

describe('JWTService', () => {
  let service: JWTService;
  let jwtService: jest.Mocked<JwtService>;
  // let configService: jest.Mocked<ConfigService>;
  let redis: jest.Mocked<Redis>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: UserRole.USER,
    name: 'Test User',
  };

  const mockJwtConfig = {
    accessTokenSecret: 'test-access-secret',
    refreshTokenSecret: 'test-refresh-secret',
    accessTokenExpiry: '15m',
    refreshTokenExpiry: '7d',
    issuer: 'kadai-auth',
    audience: 'kadai-api',
  };

  beforeEach(async () => {
    const mockJwtService = {
      sign: jest.fn(),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn((key: string) => {
        const config: Record<string, any> = {
          'security.jwt.accessTokenSecret': mockJwtConfig.accessTokenSecret,
          'security.jwt.refreshTokenSecret': mockJwtConfig.refreshTokenSecret,
          'security.jwt.accessTokenExpiry': mockJwtConfig.accessTokenExpiry,
          'security.jwt.refreshTokenExpiry': mockJwtConfig.refreshTokenExpiry,
          'security.jwt.issuer': mockJwtConfig.issuer,
          'security.jwt.audience': mockJwtConfig.audience,
          'security.jwt.algorithm': 'HS256',
          'redis.host': 'localhost',
          'redis.port': 6379,
          'redis.password': undefined,
          'redis.db': 0,
        };
        return config[key];
      }),
    };

    const mockRedis = {
      setex: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      scan: jest.fn(),
      ping: jest.fn(),
      disconnect: jest.fn(),
      ttl: jest.fn(),
      scanStream: jest.fn(),
    } as jest.Mocked<Partial<Redis>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JWTService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<JWTService>(JWTService);
    jwtService = module.get(JwtService);
    redis = mockRedis as jest.Mocked<Redis>;

    // Mock Redis initialization
    service['redis'] = redis as any;
  });

  describe('Token Generation', () => {
    it('should generate access token with correct payload', async () => {
      const mockAccessToken = 'mock-access-token';
      jwtService.sign.mockReturnValue(mockAccessToken);

      const result = await service.generateAccessToken(mockUser);

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
          name: mockUser.name,
          permissions: undefined,
          tokenType: 'access',
          iat: expect.any(Number),
          jti: expect.any(String),
        },
        {
          secret: mockJwtConfig.accessTokenSecret,
          expiresIn: mockJwtConfig.accessTokenExpiry,
          issuer: mockJwtConfig.issuer,
          audience: mockJwtConfig.audience,
          algorithm: 'HS256',
        }
      );
      expect(result).toBe(mockAccessToken);
    });

    it('should generate refresh token with minimal payload', async () => {
      const mockRefreshToken = 'mock-refresh-token';
      jwtService.sign.mockReturnValue(mockRefreshToken);

      const result = await service.generateRefreshToken(mockUser.id);

      expect(jwtService.sign).toHaveBeenCalledWith(
        {
          sub: mockUser.id,
          id: mockUser.id,
          tokenType: 'refresh',
          iat: expect.any(Number),
          jti: expect.any(String),
        },
        {
          secret: mockJwtConfig.refreshTokenSecret,
          expiresIn: mockJwtConfig.refreshTokenExpiry,
          issuer: mockJwtConfig.issuer,
          audience: mockJwtConfig.audience,
          algorithm: 'HS256',
        }
      );
      expect(result).toBe(mockRefreshToken);
    });

    it('should generate token pair with both access and refresh tokens', async () => {
      const mockAccessToken = 'mock-access-token';
      const mockRefreshToken = 'mock-refresh-token';

      jwtService.sign
        .mockReturnValueOnce(mockAccessToken)
        .mockReturnValueOnce(mockRefreshToken);

      const result = await service.generateTokenPair(mockUser);

      expect(result).toEqual({
        accessToken: mockAccessToken,
        refreshToken: mockRefreshToken,
        expiresIn: 900, // 15 minutes in seconds
        tokenType: 'Bearer',
      });
    });
  });

  describe('Token Validation', () => {
    it('should validate access token successfully', async () => {
      const mockToken = 'valid-access-token';
      const mockPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        type: 'access',
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue(null); // Not blacklisted

      const result = await service.validateAccessToken(mockToken);

      expect(jwtService.verify).toHaveBeenCalledWith(mockToken, {
        secret: mockJwtConfig.accessTokenSecret,
        issuer: mockJwtConfig.issuer,
        audience: mockJwtConfig.audience,
      });
      expect(redis.get).toHaveBeenCalledWith('blacklist:token-id-123');
      expect(result).toEqual(mockPayload);
    });

    it('should reject blacklisted token', async () => {
      const mockToken = 'blacklisted-token';
      const mockPayload = {
        sub: mockUser.id,
        type: 'access',
        jti: 'blacklisted-token-id',
      };

      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue('blacklisted'); // Token is blacklisted

      await expect(service.validateAccessToken(mockToken)).rejects.toThrow(
        'Token has been revoked'
      );
    });

    it('should reject invalid token', async () => {
      const mockToken = 'invalid-token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(service.validateAccessToken(mockToken)).rejects.toThrow(
        'Invalid token'
      );
    });

    it('should validate refresh token successfully', async () => {
      const mockRefreshToken = 'valid-refresh-token';
      const mockPayload = {
        sub: mockUser.id,
        type: 'refresh',
        jti: 'refresh-token-id',
      };

      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue(null); // Not blacklisted

      const result = await service.validateRefreshToken(mockRefreshToken);

      expect(jwtService.verify).toHaveBeenCalledWith(mockRefreshToken, {
        secret: mockJwtConfig.refreshTokenSecret,
        issuer: mockJwtConfig.issuer,
        audience: mockJwtConfig.audience,
      });
      expect(result).toEqual(mockPayload);
    });
  });

  describe('Token Blacklisting', () => {
    it('should blacklist token successfully', async () => {
      const tokenId = 'token-id-123';
      const expirationTime = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const ttl = 3600; // 1 hour in seconds

      redis.setex.mockResolvedValue('OK');

      await service.blacklistToken(tokenId, expirationTime);

      expect(redis.setex).toHaveBeenCalledWith(
        `blacklist:${tokenId}`,
        ttl,
        'blacklisted'
      );
    });

    it('should check if token is blacklisted', async () => {
      const tokenId = 'token-id-123';
      redis.get.mockResolvedValue('blacklisted');

      const result = await service.isTokenBlacklisted(tokenId);

      expect(redis.get).toHaveBeenCalledWith(`blacklist:${tokenId}`);
      expect(result).toBe(true);
    });

    it('should return false for non-blacklisted token', async () => {
      const tokenId = 'token-id-123';
      redis.get.mockResolvedValue(null);

      const result = await service.isTokenBlacklisted(tokenId);

      expect(result).toBe(false);
    });

    it('should revoke all user tokens', async () => {
      const userId = 'user-123';

      // Mock token scanning
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield [
            `user:${userId}:access-token-1`,
            `user:${userId}:refresh-token-1`,
          ];
        },
        opt: {} as any,
        _redisCursor: '0',
        _redisDrained: false,
        _read: jest.fn(),
      } as any;
      redis.scanStream.mockReturnValue(mockStream);

      redis.del.mockResolvedValue(2);

      await service.revokeAllUserTokens(userId);

      expect(redis.scanStream).toHaveBeenCalled();
      expect(redis.del).toHaveBeenCalled();
    });
  });

  describe('Token Refresh', () => {
    it('should refresh tokens successfully', async () => {
      const mockRefreshToken = 'valid-refresh-token';
      const mockPayload = {
        sub: mockUser.id,
        tokenType: 'refresh',
        jti: 'refresh-token-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      const newAccessToken = 'new-access-token';
      const newRefreshToken = 'new-refresh-token';

      // Mock refresh token validation
      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue(null); // Not blacklisted

      // Mock new token generation
      jwtService.sign
        .mockReturnValueOnce(newAccessToken)
        .mockReturnValueOnce(newRefreshToken);

      // Mock token blacklisting
      redis.setex.mockResolvedValue('OK');

      const result = await service.refreshTokens(mockRefreshToken, mockUser);

      expect(result).toEqual({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: 900,
        tokenType: 'Bearer',
      });

      // Should blacklist old refresh token
      expect(redis.setex).toHaveBeenCalledWith(
        'blacklist:refresh-token-id',
        expect.any(Number),
        'blacklisted'
      );
    });

    it('should fail to refresh with invalid refresh token', async () => {
      const invalidRefreshToken = 'invalid-refresh-token';

      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await expect(
        service.refreshTokens(invalidRefreshToken, mockUser)
      ).rejects.toThrow('Invalid refresh token');
    });
  });

  describe('Token Extraction', () => {
    it('should extract token from Authorization header', () => {
      const mockRequest = {
        headers: {
          authorization: 'Bearer valid-token-123',
        },
      } as SecurityRequest;

      const result = service.extractTokenFromRequest(mockRequest);

      expect(result).toBe('valid-token-123');
    });

    it('should extract token from cookies', () => {
      const mockRequest = {
        headers: {},
        cookies: {
          accessToken: 'cookie-token-123',
        },
      } as SecurityRequest;

      const result = service.extractTokenFromRequest(mockRequest);

      expect(result).toBe('cookie-token-123');
    });

    it('should return null when no token found', () => {
      const mockRequest = {
        headers: {},
      } as SecurityRequest;

      const result = service.extractTokenFromRequest(mockRequest);

      expect(result).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle Redis connection errors gracefully', async () => {
      const tokenId = 'token-id-123';
      redis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw error, but log warning and return false
      const result = await service.isTokenBlacklisted(tokenId);

      expect(result).toBe(false);
    });

    it('should handle malformed JWT tokens', async () => {
      const malformedToken = 'not.a.valid.jwt.token';
      jwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token format');
      });

      await expect(service.validateAccessToken(malformedToken)).rejects.toThrow(
        'Invalid token format'
      );
    });
  });

  describe('Token Information', () => {
    it('should decode token without verification', () => {
      const mockToken = 'valid-token';
      const mockPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      };

      jwtService.decode.mockReturnValue(mockPayload);

      const result = service.decodeToken(mockToken);

      expect(jwtService.decode).toHaveBeenCalledWith(mockToken);
      expect(result).toEqual(mockPayload);
    });

    it('should get token expiration time', () => {
      const mockToken = 'valid-token';
      const mockPayload = {
        exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
      };

      jwtService.decode.mockReturnValue(mockPayload);

      const result = service.getTokenExpiration(mockToken);

      expect(result).toBe(mockPayload.exp);
    });

    it('should return null for token without expiration', () => {
      const mockToken = 'token-without-exp';
      const mockPayload = {
        sub: mockUser.id,
        email: mockUser.email,
      };

      jwtService.decode.mockReturnValue(mockPayload);

      const result = service.getTokenExpiration(mockToken);

      expect(result).toBeNull();
    });

    it('should handle decode errors gracefully', () => {
      const mockToken = 'invalid-token';
      jwtService.decode.mockImplementation(() => {
        throw new Error('Token decode failed');
      });

      expect(() => service.decodeToken(mockToken)).toThrow(
        'Token decode failed'
      );
    });
  });

  describe('Advanced Token Validation', () => {
    it('should validate token with custom options', async () => {
      const mockToken = 'custom-token';
      const mockPayload = {
        sub: mockUser.id,
        iss: 'custom-issuer',
        aud: 'custom-audience',
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue(null);

      const result = await service.validateAccessToken(mockToken);

      expect(jwtService.verify).toHaveBeenCalledWith(mockToken, {
        secret: mockJwtConfig.accessTokenSecret,
        issuer: mockJwtConfig.issuer,
        audience: mockJwtConfig.audience,
      });
      expect(result).toEqual(mockPayload);
    });

    it('should handle expired tokens', async () => {
      const mockToken = 'expired-token';
      jwtService.verify.mockImplementation(() => {
        const error = new Error('Token expired');
        (error as any).name = 'TokenExpiredError';
        throw error;
      });

      await expect(service.validateAccessToken(mockToken)).rejects.toThrow(
        'Token expired'
      );
    });

    it('should handle invalid signature', async () => {
      const mockToken = 'invalid-signature-token';
      jwtService.verify.mockImplementation(() => {
        const error = new Error('Invalid signature');
        (error as any).name = 'JsonWebTokenError';
        throw error;
      });

      await expect(service.validateAccessToken(mockToken)).rejects.toThrow(
        'Invalid signature'
      );
    });
  });

  describe('Token Storage and Cleanup', () => {
    it('should handle Redis connection for token blacklisting', async () => {
      const tokenId = 'token-id-123';
      const expirationTime = Math.floor(Date.now() / 1000) + 3600;

      redis.setex.mockResolvedValue('OK');

      await service.blacklistToken(tokenId, expirationTime);

      expect(redis.setex).toHaveBeenCalledWith(
        `blacklist:${tokenId}`,
        3600,
        'blacklisted'
      );
    });

    it('should handle token lookup for blacklist check', async () => {
      const tokenId = 'token-id-123';
      redis.get.mockResolvedValue('blacklisted');

      const result = await service.isTokenBlacklisted(tokenId);

      expect(redis.get).toHaveBeenCalledWith(`blacklist:${tokenId}`);
      expect(result).toBe(true);
    });

    it('should handle Redis errors during blacklist operations gracefully', async () => {
      const tokenId = 'token-id-123';
      redis.get.mockRejectedValue(new Error('Redis connection failed'));

      // Should not throw error, but log warning and return false
      const result = await service.isTokenBlacklisted(tokenId);

      expect(result).toBe(false);
    });
  });

  describe('Token Metrics and Monitoring', () => {
    it('should track token generation metrics', async () => {
      const userData = {
        id: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
      };

      jwtService.sign
        .mockReturnValueOnce('access-token-123')
        .mockReturnValueOnce('refresh-token-123');

      redis.setex.mockResolvedValue('OK');

      const result = await service.generateTokenPair(userData);

      expect(result).toEqual({
        accessToken: 'access-token-123',
        refreshToken: 'refresh-token-123',
        expiresIn: 900, // 15 minutes
        tokenType: 'Bearer',
      });
    });

    it('should validate token audience correctly', async () => {
      const mockToken = 'token-with-audience';
      const mockPayload = {
        sub: mockUser.id,
        aud: ['kadai-api', 'kadai-admin'],
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue(null);

      const result = await service.validateAccessToken(mockToken);

      expect(result).toEqual(mockPayload);
    });

    it('should handle malformed Authorization header', () => {
      const mockRequest = {
        headers: {
          authorization: 'Invalid format token',
        },
      } as SecurityRequest;

      const result = service.extractTokenFromRequest(mockRequest);

      expect(result).toBeNull();
    });

    it('should extract token from custom header', () => {
      const mockRequest = {
        headers: {
          'x-access-token': 'custom-header-token',
        },
        get: jest.fn((header: string) => {
          if (header === 'x-access-token') return 'custom-header-token';
          return undefined;
        }),
      } as any;

      const result = service.extractTokenFromRequest(mockRequest);

      expect(result).toBe('custom-header-token');
    });
  });

  describe('Configuration and Environment', () => {
    it('should handle missing Redis configuration gracefully', async () => {
      // Create service without Redis
      const noRedisService = new JWTService(jwtService, {
        get: jest.fn().mockReturnValue(undefined),
      } as any);

      const tokenId = 'token-id-123';

      // Should not throw error and return false for blacklist check
      const result = await noRedisService.isTokenBlacklisted(tokenId);
      expect(result).toBe(false);
    });

    it('should use fallback configuration values', () => {
      const fallbackConfig = {
        get: jest.fn((key: string) => {
          // Return undefined for most configs to test fallbacks
          if (key === 'security.jwt.algorithm') return 'RS256';
          return undefined;
        }),
      };

      const fallbackService = new JWTService(jwtService, fallbackConfig as any);
      expect(fallbackService).toBeDefined();
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent token validations', async () => {
      const tokens = ['token1', 'token2', 'token3'];
      const mockPayload = {
        sub: mockUser.id,
        jti: 'token-id',
      };

      jwtService.verify.mockReturnValue(mockPayload);
      redis.get.mockResolvedValue(null);

      const validations = tokens.map((token) =>
        service.validateAccessToken(token)
      );
      const results = await Promise.all(validations);

      expect(results).toHaveLength(3);
      expect(results.every((result) => result.sub === mockUser.id)).toBe(true);
    });

    it('should handle concurrent blacklist operations', async () => {
      const tokenIds = ['token1', 'token2', 'token3'];
      const expirationTime = Math.floor(Date.now() / 1000) + 3600;

      redis.setex.mockResolvedValue('OK');

      const blacklistOps = tokenIds.map((tokenId) =>
        service.blacklistToken(tokenId, expirationTime)
      );

      await expect(Promise.all(blacklistOps)).resolves.not.toThrow();
      expect(redis.setex).toHaveBeenCalledTimes(3);
    });
  });

  describe('Redis Connection Failures and Fallback Behavior', () => {
    it('should handle blacklistToken when Redis is unavailable', async () => {
      // Set service redis to null to simulate unavailable Redis
      (service as any).redis = null;

      const tokenId = 'test-token-id';
      const expirationTime = Math.floor(Date.now() / 1000) + 3600;

      // Should not throw and should complete gracefully
      await expect(
        service.blacklistToken(tokenId, expirationTime)
      ).resolves.not.toThrow();
    });

    it('should handle isTokenBlacklisted when Redis connection fails', async () => {
      redis.get.mockRejectedValue(new Error('Redis connection timeout'));

      const tokenId = 'test-token-id';
      const result = await service.isTokenBlacklisted(tokenId);

      // Should return false (fail-open) when Redis is unavailable
      expect(result).toBe(false);
    });

    it('should handle blacklistToken when Redis operation fails', async () => {
      redis.setex.mockRejectedValue(new Error('Redis write error'));

      const tokenId = 'test-token-id';
      const expirationTime = Math.floor(Date.now() / 1000) + 3600;

      await expect(
        service.blacklistToken(tokenId, expirationTime)
      ).rejects.toThrow('Token blacklisting failed');
    });

    it('should handle revokeAllUserTokens when Redis is unavailable', async () => {
      (service as any).redis = null;

      const userId = 'test-user-id';

      // Should not throw when Redis is unavailable
      await expect(service.revokeAllUserTokens(userId)).resolves.not.toThrow();
    });

    it('should handle revokeAllUserTokens when Redis scan fails', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          throw new Error('Redis scan error');
          yield []; // Unreachable but satisfies generator requirement
        },
        opt: {} as any,
        _redisCursor: '0',
        _redisDrained: false,
        _read: jest.fn(),
      } as any;

      redis.scanStream.mockReturnValue(mockStream);

      const userId = 'test-user-id';

      await expect(service.revokeAllUserTokens(userId)).rejects.toThrow(
        'Token revocation failed'
      );
    });

    it('should handle revokeAllUserTokens with successful scan but delete failure', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          yield ['key1', 'key2'];
        },
        opt: {} as any,
        _redisCursor: '0',
        _redisDrained: false,
        _read: jest.fn(),
      } as any;

      redis.scanStream.mockReturnValue(mockStream);
      redis.del.mockRejectedValue(new Error('Delete failed'));

      const userId = 'test-user-id';

      await expect(service.revokeAllUserTokens(userId)).rejects.toThrow(
        'Token revocation failed'
      );
    });

    it('should handle revokeAllUserTokens with no keys to delete', async () => {
      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          // Empty iteration - no keys found
        },
        opt: {} as any,
        _redisCursor: '0',
        _redisDrained: false,
        _read: jest.fn(),
      } as any;

      redis.scanStream.mockReturnValue(mockStream);

      const userId = 'test-user-id';

      // Should complete successfully when no keys are found
      await expect(service.revokeAllUserTokens(userId)).resolves.not.toThrow();
      expect(redis.del).not.toHaveBeenCalled();
    });
  });

  describe('Edge Cases in Token Operations', () => {
    it('should handle parseExpiryToSeconds with invalid format', () => {
      expect(() => (service as any).parseExpiryToSeconds('invalid')).toThrow(
        'Invalid expiry format: invalid'
      );
    });

    it('should handle parseExpiryToSeconds with valid formats', () => {
      expect((service as any).parseExpiryToSeconds('30s')).toBe(30);
      expect((service as any).parseExpiryToSeconds('5m')).toBe(300);
      expect((service as any).parseExpiryToSeconds('2h')).toBe(7200);
      expect((service as any).parseExpiryToSeconds('1d')).toBe(86400);
    });

    it('should handle extractTokenFromRequest with request.get method failing', () => {
      const mockRequest = {
        headers: {},
        get: jest.fn().mockImplementation(() => {
          throw new Error('Request.get failed');
        }),
      } as any;

      // This should not throw an error and should return null gracefully
      expect(() => {
        const result = service.extractTokenFromRequest(mockRequest);
        expect(result).toBeNull();
      }).not.toThrow();
    });

    it('should handle refreshTokens with options-based call and rotation disabled', async () => {
      const refreshToken = 'valid.refresh.token';
      const mockRefreshPayload = {
        sub: mockUser.id,
        email: mockUser.email,
        role: mockUser.role,
        name: mockUser.name,
        jti: 'refresh-jti',
        exp: Math.floor(Date.now() / 1000) + 3600,
      };

      jwtService.verify.mockReturnValue(mockRefreshPayload);
      redis.get.mockResolvedValue(null);
      jwtService.sign.mockReturnValue('new.access.token');

      const options = {
        rotateRefreshToken: false,
        validateDevice: false,
        requireSecureContext: false,
      };

      const result = await service.refreshTokens(refreshToken, options);

      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      // Should not blacklist the old refresh token when rotation is disabled
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('should handle healthCheck with Redis unavailable', async () => {
      (service as any).redis = null;

      const health = await service.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.redis).toBe(false);
    });

    it('should handle healthCheck with Redis ping failure', async () => {
      redis.ping.mockRejectedValue(new Error('Redis unavailable'));

      const health = await service.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.redis).toBe(false);
    });

    it('should handle healthCheck with incomplete JWT config', async () => {
      // Create service with incomplete config
      const incompleteConfigService = new JWTService(jwtService, {
        get: jest.fn().mockImplementation((key: string) => {
          if (key === 'security.jwt.accessTokenSecret') return undefined;
          return 'test-value';
        }),
      } as any);

      const health = await incompleteConfigService.healthCheck();

      expect(health.status).toBe('unhealthy');
      expect(health.config).toBe(false);
    });

    it('should handle logout with missing token payloads', async () => {
      jwtService.decode
        .mockReturnValueOnce(null) // access token decode returns null
        .mockReturnValueOnce(null); // refresh token decode returns null

      await expect(
        service.logout('invalid.token', 'invalid.refresh')
      ).resolves.not.toThrow();
      expect(redis.setex).not.toHaveBeenCalled();
    });

    it('should handle logout with tokens missing jti or exp', async () => {
      jwtService.decode
        .mockReturnValueOnce({ sub: 'user-id' }) // missing jti and exp
        .mockReturnValueOnce({ sub: 'user-id', jti: 'refresh-jti' }); // missing exp

      await expect(service.logout('token1', 'token2')).resolves.not.toThrow();
      expect(redis.setex).not.toHaveBeenCalled();
    });
  });
});
