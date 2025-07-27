import { JWTConfig, JWTTokenPayload, JWTTokenPair, TokenBlacklistEntry } from './security.types';

describe('JWT Types', () => {
  describe('JWTConfig', () => {
    it('should define valid JWT configuration structure', () => {
      const config: JWTConfig = {
        enabled: true,
        algorithm: 'HS256',
        accessToken: {
          secret: 'test-secret',
          expiresIn: '15m',
        },
        refreshToken: {
          secret: 'test-refresh-secret',
          expiresIn: '7d',
        },
        issuer: 'kadai-api',
        audience: 'kadai-users',
        redis: {
          host: 'localhost',
          port: 6379,
          db: 2,
          keyPrefix: 'jwt:',
        },
        blacklist: {
          enabled: true,
          cleanupInterval: 3600000,
        },
        refresh: {
          enabled: true,
          rotateTokens: true,
          renewalThreshold: 300000,
        },
        security: {
          validateIssuer: true,
          validateAudience: true,
          validateSubject: true,
          clockTolerance: 60,
          requireExpirationTime: true,
          requireNotBefore: false,
        },
      };

      expect(config.enabled).toBe(true);
      expect(config.algorithm).toBe('HS256');
      expect(config.accessToken.expiresIn).toBe('15m');
      expect(config.refreshToken.expiresIn).toBe('7d');
      expect(config.redis.keyPrefix).toBe('jwt:');
    });

    it('should support optional configuration fields', () => {
      const minimalConfig: Partial<JWTConfig> = {
        enabled: true,
        accessToken: {
          secret: 'secret',
          expiresIn: '15m',
        },
      };

      expect(minimalConfig.enabled).toBe(true);
      expect(minimalConfig.accessToken?.secret).toBe('secret');
    });
  });

  describe('JWTTokenPayload', () => {
    it('should define valid token payload structure', () => {
      const payload: JWTTokenPayload = {
        sub: 'user-123',
        id: 'user-123',
        email: 'user@example.com',
        role: 'user',
        permissions: ['read', 'write'],
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 900,
        iss: 'kadai-api',
        aud: 'kadai-users',
        jti: 'token-123',
        tokenType: 'access',
      };

      expect(payload.sub).toBe('user-123');
      expect(payload.email).toBe('user@example.com');
      expect(payload.role).toBe('user');
      expect(payload.permissions).toEqual(['read', 'write']);
      expect(payload.tokenType).toBe('access');
    });

    it('should support refresh token payload', () => {
      const refreshPayload: JWTTokenPayload = {
        sub: 'user-123',
        id: 'user-123',
        email: 'user@example.com',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 604800,
        iss: 'kadai-api',
        aud: 'kadai-users',
        jti: 'refresh-token-123',
        tokenType: 'refresh',
      };

      expect(refreshPayload.tokenType).toBe('refresh');
      expect(refreshPayload.jti).toBe('refresh-token-123');
    });
  });

  describe('JWTTokenPair', () => {
    it('should define token pair structure', () => {
      const tokenPair: JWTTokenPair = {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        expiresIn: 900,
        tokenType: 'Bearer',
      };

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.expiresIn).toBe(900);
      expect(tokenPair.tokenType).toBe('Bearer');
    });

    it('should support optional fields', () => {
      const tokenPair: JWTTokenPair = {
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresIn: 900,
        tokenType: 'Bearer',
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
      };

      expect(tokenPair.refreshExpiresIn).toBe(604800);
      expect(tokenPair.issuedAt).toBeInstanceOf(Date);
    });
  });

  describe('TokenBlacklistEntry', () => {
    it('should define blacklist entry structure', () => {
      const entry: TokenBlacklistEntry = {
        jti: 'token-123',
        userId: 'user-123',
        tokenType: 'access',
        blacklistedAt: new Date(),
        expiresAt: new Date(Date.now() + 900000),
        reason: 'user_logout',
      };

      expect(entry.jti).toBe('token-123');
      expect(entry.userId).toBe('user-123');
      expect(entry.tokenType).toBe('access');
      expect(entry.reason).toBe('user_logout');
      expect(entry.blacklistedAt).toBeInstanceOf(Date);
      expect(entry.expiresAt).toBeInstanceOf(Date);
    });

    it('should support different blacklist reasons', () => {
      const reasons: Array<TokenBlacklistEntry['reason']> = [
        'user_logout',
        'security_breach',
        'token_rotation',
        'manual_revocation',
        'user_disabled',
      ];

      reasons.forEach(reason => {
        const entry: Partial<TokenBlacklistEntry> = { reason };
        expect(entry.reason).toBe(reason);
      });
    });
  });
});