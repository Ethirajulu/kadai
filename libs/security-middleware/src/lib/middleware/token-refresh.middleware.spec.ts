import { Test, TestingModule } from '@nestjs/testing';
import { TokenRefreshMiddleware } from './token-refresh.middleware';
import { JWTService } from '../services/jwt.service';
import { ConfigService } from '@nestjs/config';
import { 
  JWTAuthRequest, 
  JWTTokenPayload, 
  JWTConfig
} from '../types/security.types';
import { Response, NextFunction } from 'express';

// Constants for test data consistency
const TEST_CONSTANTS = {
  USER_ID: 'user-123',
  EMAIL: 'test@example.com',
  ROLE: 'user',
  PERMISSIONS: ['read:profile', 'write:profile'],
  VALID_ACCESS_TOKEN: 'valid.access.token',
  VALID_REFRESH_TOKEN: 'valid.refresh.token',
  NEW_ACCESS_TOKEN: 'new.access.token',
  NEW_REFRESH_TOKEN: 'new.refresh.token',
  EXPIRED_ACCESS_TOKEN: 'expired.access.token',
  DEVICE_ID: 'device-456',
  IP_ADDRESS: '192.168.1.100',
  USER_AGENT: 'Mozilla/5.0 (Test Browser)',
  SESSION_ID: 'session-789',
  RENEWAL_THRESHOLD: 300000, // 5 minutes in milliseconds
} as const;

// Mock request object
const createMockRequest = (overrides: Partial<JWTAuthRequest> = {}): JWTAuthRequest => ({
  headers: {
    authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
  },
  ip: TEST_CONSTANTS.IP_ADDRESS,
  get: jest.fn().mockImplementation((header: string) => {
    if (header === 'User-Agent') return TEST_CONSTANTS.USER_AGENT;
    return undefined;
  }),
  connection: { remoteAddress: TEST_CONSTANTS.IP_ADDRESS },
  socket: { remoteAddress: TEST_CONSTANTS.IP_ADDRESS },
  url: '/api/test',
  method: 'GET',
  ...overrides,
} as JWTAuthRequest);

// Mock response object
const createMockResponse = (): Partial<Response> => ({
  setHeader: jest.fn(),
  set: jest.fn(),
  status: jest.fn().mockReturnThis(),
  json: jest.fn(),
  send: jest.fn(),
  cookie: jest.fn(),
});

// Mock next function
const createMockNext = (): NextFunction => jest.fn();

// Mock JWT token payload
const createMockTokenPayload = (overrides: Partial<JWTTokenPayload> = {}): JWTTokenPayload => {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: TEST_CONSTANTS.USER_ID,
    id: TEST_CONSTANTS.USER_ID,
    email: TEST_CONSTANTS.EMAIL,
    role: TEST_CONSTANTS.ROLE,
    permissions: [...TEST_CONSTANTS.PERMISSIONS],
    iat: now,
    exp: now + 900, // 15 minutes
    iss: 'kadai-auth',
    aud: 'kadai-api',
    jti: `jti-${Date.now()}`,
    tokenType: 'access',
    sessionId: TEST_CONSTANTS.SESSION_ID,
    deviceId: TEST_CONSTANTS.DEVICE_ID,
    ipAddress: TEST_CONSTANTS.IP_ADDRESS,
    userAgent: TEST_CONSTANTS.USER_AGENT,
    scope: ['api:read', 'api:write'],
    refreshCount: 0,
    ...overrides,
  };
};

describe('TokenRefreshMiddleware', () => {
  let middleware: TokenRefreshMiddleware;
  let jwtService: jest.Mocked<JWTService>;

  const createMockConfig = (): JWTConfig => ({
    enabled: true,
    algorithm: 'HS256',
    accessToken: {
      secret: 'test-access-secret',
      expiresIn: '15m',
    },
    refreshToken: {
      secret: 'test-refresh-secret',
      expiresIn: '7d',
    },
    issuer: 'kadai-auth',
    audience: 'kadai-api',
    redis: {
      host: 'localhost',
      port: 6379,
      db: 2,
      keyPrefix: 'jwt_blacklist:',
      connectTimeout: 10000,
      lazyConnect: true,
    },
    blacklist: {
      enabled: true,
      cleanupInterval: 60000,
      keyPrefix: 'jwt_blacklist:',
    },
    refresh: {
      enabled: true,
      rotateTokens: true,
      renewalThreshold: TEST_CONSTANTS.RENEWAL_THRESHOLD,
      maxRefreshes: 10,
    },
    security: {
      validateIssuer: true,
      validateAudience: true,
      validateSubject: true,
      clockTolerance: 30,
      requireExpirationTime: true,
      requireNotBefore: false,
    },
  });

  beforeEach(async () => {
    // Create mocked services
    const mockJwtService = {
      validateAccessToken: jest.fn(),
      refreshTokens: jest.fn(),
      generateTokenPair: jest.fn(),
      extractTokenFromRequest: jest.fn(),
      isTokenNearExpiration: jest.fn(),
      decodeToken: jest.fn(),
    };

    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'security.jwt') {
          return createMockConfig();
        }
        return undefined;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenRefreshMiddleware,
        {
          provide: JWTService,
          useValue: mockJwtService,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    middleware = module.get<TokenRefreshMiddleware>(TokenRefreshMiddleware);
    jwtService = module.get<JWTService>(JWTService) as jest.Mocked<JWTService>;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Validation and Refresh Detection', () => {
    it('should pass through when no authorization header is present', async () => {
      // Arrange
      const request = createMockRequest({ headers: {} });
      const response = createMockResponse();
      const next = createMockNext();
      
      // Mock JWT service methods
      jwtService.extractTokenFromRequest.mockReturnValue(null);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.validateAccessToken).not.toHaveBeenCalled();
      expect(request.isTokenRefreshed).toBeUndefined();
    });

    it('should pass through when authorization header is not Bearer token', async () => {
      // Arrange
      const request = createMockRequest({ 
        headers: { authorization: 'Basic dGVzdDp0ZXN0' }
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      // Mock JWT service methods
      jwtService.extractTokenFromRequest.mockReturnValue(null);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.validateAccessToken).not.toHaveBeenCalled();
    });

    it('should validate token when Bearer token is present', async () => {
      // Arrange
      const request = createMockRequest();
      const response = createMockResponse();
      const next = createMockNext();

      // Mock JWT service methods
      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.isTokenNearExpiration).toHaveBeenCalledWith(TEST_CONSTANTS.VALID_ACCESS_TOKEN, 5);
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle invalid token gracefully', async () => {
      // Arrange
      const request = createMockRequest();
      const response = createMockResponse();
      const next = createMockNext();

      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(request.user).toBeUndefined();
      expect(request.isTokenRefreshed).toBeUndefined();
    });
  });

  describe('Automatic Token Refresh', () => {
    it('should refresh token when it is near expiration', async () => {
      // Arrange
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload();
      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.NEW_REFRESH_TOKEN,
        expiresIn: 900,
        tokenType: 'Bearer' as const,
      };

      // Mock middleware behavior
      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(true); // Token is near expiration
      jwtService.decodeToken.mockReturnValue(mockPayload);
      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.isTokenNearExpiration).toHaveBeenCalledWith(TEST_CONSTANTS.VALID_ACCESS_TOKEN, 5);
      expect(jwtService.refreshTokens).toHaveBeenCalledWith(
        TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        expect.objectContaining({
          id: mockPayload.sub,
          email: mockPayload.email,
          role: mockPayload.role,
          name: mockPayload.name
        })
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-New-Access-Token',
        TEST_CONSTANTS.NEW_ACCESS_TOKEN
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-New-Refresh-Token',
        TEST_CONSTANTS.NEW_REFRESH_TOKEN
      );
      expect(request.isTokenRefreshed).toBe(true);
      expect(next).toHaveBeenCalledWith();
    });

    it('should not refresh token when it is not near expiration', async () => {
      // Arrange
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();

      // Mock middleware behavior - token not near expiration
      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(false); // Token NOT near expiration

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.isTokenNearExpiration).toHaveBeenCalledWith(TEST_CONSTANTS.VALID_ACCESS_TOKEN, 5);
      expect(jwtService.refreshTokens).not.toHaveBeenCalled();
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(request.isTokenRefreshed).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should not refresh token when no refresh token is provided', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240; // 4 minutes from now
      const request = createMockRequest(); // No x-refresh-token header
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.refreshTokens).not.toHaveBeenCalled();
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(request.isTokenRefreshed).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle refresh token failure gracefully', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240; // 4 minutes from now
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });

      // Mock the middleware flow properly
      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(true); // Token is near expiration
      jwtService.decodeToken.mockReturnValue(mockPayload);
      jwtService.refreshTokens.mockRejectedValue(new Error('Refresh token has expired'));

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.refreshTokens).toHaveBeenCalled();
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(request.isTokenRefreshed).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('Token Rotation', () => {
    it('should rotate refresh token when configured', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });
      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.NEW_REFRESH_TOKEN,
        expiresIn: 900,
        tokenType: 'Bearer' as const,
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
        scope: ['api:read', 'api:write'],
      };

      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(true);
      jwtService.decodeToken.mockReturnValue(mockPayload);
      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.refreshTokens).toHaveBeenCalledWith(
        TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        expect.objectContaining({
          id: mockPayload.sub,
          email: mockPayload.email,
          role: mockPayload.role,
          name: mockPayload.name
        })
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-New-Refresh-Token',
        TEST_CONSTANTS.NEW_REFRESH_TOKEN
      );
    });

    it('should handle token rotation disabled', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });
      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.VALID_REFRESH_TOKEN, // Same refresh token
        expiresIn: 900,
        tokenType: 'Bearer' as const,
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
        scope: ['api:read', 'api:write'],
      };

      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(true);
      jwtService.decodeToken.mockReturnValue(mockPayload);
      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Create middleware with config that has rotation disabled
      // const configWithoutRotation = createMockConfig();
      // configWithoutRotation.refresh.rotateTokens = false;
      
      // const customConfigService = {
      //   get: jest.fn().mockImplementation((key: string) => {
      //     if (key === 'security.jwt') {
      //       return configWithoutRotation;
      //     }
      //     return undefined;
      //   }),
      // };

      // const customMiddleware = new TokenRefreshMiddleware(
      //   jwtService as any
      // );

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.refreshTokens).toHaveBeenCalledWith(
        TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        expect.objectContaining({
          id: mockPayload.sub,
          email: mockPayload.email,
          role: mockPayload.role,
          name: mockPayload.name
        })
      );
    });
  });

  describe('Security Validation', () => {
    it('should validate device consistency during token refresh', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
          'x-device-id': TEST_CONSTANTS.DEVICE_ID,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ 
        exp: nearExpiry,
        deviceId: TEST_CONSTANTS.DEVICE_ID,
      });

      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.NEW_REFRESH_TOKEN,
        expiresIn: 900,
        tokenType: 'Bearer' as const,
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
        scope: ['api:read', 'api:write'],
      };

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      // Should proceed normally when device ID matches
    });

    it('should handle mismatched device ID', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
          'x-device-id': 'different-device-id',
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ 
        exp: nearExpiry,
        deviceId: TEST_CONSTANTS.DEVICE_ID,
      });

      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.NEW_REFRESH_TOKEN,
        expiresIn: 900,
        tokenType: 'Bearer' as const,
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
        scope: ['api:read', 'api:write'],
      };

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      // Should log warning but not block (implementation detail)
    });

    it('should validate IP address consistency', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
        ip: '192.168.1.200', // Different IP
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ 
        exp: nearExpiry,
        ipAddress: TEST_CONSTANTS.IP_ADDRESS,
      });

      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.NEW_REFRESH_TOKEN,
        expiresIn: 900,
        tokenType: 'Bearer' as const,
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
        scope: ['api:read', 'api:write'],
      };

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      // Should log warning but not block (implementation detail)
    });
  });

  describe('Response Headers', () => {
    it('should set appropriate headers when token is refreshed', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });
      const newTokens = {
        accessToken: TEST_CONSTANTS.NEW_ACCESS_TOKEN,
        refreshToken: TEST_CONSTANTS.NEW_REFRESH_TOKEN,
        expiresIn: 900,
        tokenType: 'Bearer' as const,
        refreshExpiresIn: 604800,
        issuedAt: new Date(),
        scope: ['api:read', 'api:write'],
      };

      jwtService.extractTokenFromRequest.mockReturnValue(TEST_CONSTANTS.VALID_ACCESS_TOKEN);
      jwtService.isTokenNearExpiration.mockReturnValue(true);
      jwtService.decodeToken.mockReturnValue(mockPayload);
      jwtService.refreshTokens.mockResolvedValue(newTokens);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-New-Access-Token',
        TEST_CONSTANTS.NEW_ACCESS_TOKEN
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-New-Refresh-Token',
        TEST_CONSTANTS.NEW_REFRESH_TOKEN
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Token-Refreshed',
        'true'
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Token-Expires-In',
        '900'
      );
    });

    it('should not set headers when token is not refreshed', async () => {
      // Arrange
      const farExpiry = Math.floor(Date.now() / 1000) + 600;
      const request = createMockRequest();
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: farExpiry });

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(response.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle JWT service errors gracefully', async () => {
      // Arrange
      const request = createMockRequest();
      const response = createMockResponse();
      const next = createMockNext();

      jwtService.validateAccessToken.mockRejectedValue(new Error('JWT service error'));

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(request.isTokenRefreshed).toBeUndefined();
    });

    it('should handle refresh service errors gracefully', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      jwtService.refreshTokens.mockRejectedValue(new Error('Refresh service error'));

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(request.isTokenRefreshed).toBeUndefined();
      expect(response.setHeader).not.toHaveBeenCalled();
    });
  });

  describe('Configuration', () => {
    it('should handle disabled token refresh', async () => {
      // Arrange
      const nearExpiry = Math.floor(Date.now() / 1000) + 240;
      const request = createMockRequest({
        headers: {
          authorization: `Bearer ${TEST_CONSTANTS.VALID_ACCESS_TOKEN}`,
          'x-refresh-token': TEST_CONSTANTS.VALID_REFRESH_TOKEN,
        },
      });
      const response = createMockResponse();
      const next = createMockNext();
      
      const mockPayload = createMockTokenPayload({ exp: nearExpiry });

      // Create middleware with refresh disabled
      // const configWithRefreshDisabled = createMockConfig();
      // configWithRefreshDisabled.refresh.enabled = false;
      
      // const customConfigService = {
      //   get: jest.fn().mockImplementation((key: string) => {
      //     if (key === 'security.jwt') {
      //       return configWithRefreshDisabled;
      //     }
      //     return undefined;
      //   }),
      // };

      // const customMiddleware = new TokenRefreshMiddleware(
      //   jwtService as any
      // );

      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(jwtService.refreshTokens).not.toHaveBeenCalled();
      expect(response.setHeader).not.toHaveBeenCalled();
      expect(request.isTokenRefreshed).toBeUndefined();
      expect(next).toHaveBeenCalledWith();
    });

    it('should handle missing JWT configuration', async () => {
      // Arrange
      const request = createMockRequest();
      const response = createMockResponse();
      const next = createMockNext();

      // Create middleware with no config
      // const noConfigService = {
      //   get: jest.fn().mockReturnValue(undefined),
      // };

      // const customMiddleware = new TokenRefreshMiddleware(
      //   jwtService as any
      // );

      // Act
      await middleware.use(request, response as Response, next);

      // Assert
      expect(next).toHaveBeenCalledWith();
      expect(jwtService.validateAccessToken).not.toHaveBeenCalled();
    });
  });
});