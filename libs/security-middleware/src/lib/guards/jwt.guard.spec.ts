import { Test, TestingModule } from '@nestjs/testing';
import {
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtGuard } from './jwt.guard';
import { JWTService } from '../services/jwt.service';
import {
  JWTTokenPayload,
  JWTAuthRequest,
  JWTSecurityOptions,
} from '../types/security.types';

// JWT metadata keys

// Constants for test data consistency
const TEST_CONSTANTS = {
  USER_ID: 'user-123',
  EMAIL: 'test@example.com',
  ROLE_USER: 'user',
  ROLE_ADMIN: 'admin',
  ROLE_MODERATOR: 'moderator',
  PERMISSIONS: ['read:profile', 'write:profile', 'read:users'],
  VALID_TOKEN: 'Bearer valid.jwt.token',
  INVALID_TOKEN: 'Bearer invalid.jwt.token',
  EXPIRED_TOKEN: 'Bearer expired.jwt.token',
  BLACKLISTED_TOKEN: 'Bearer blacklisted.jwt.token',
  MALFORMED_TOKEN: 'invalid-format-token',
  DEVICE_ID: 'device-456',
  IP_ADDRESS: '192.168.1.100',
  USER_AGENT: 'Mozilla/5.0 (Test Browser)',
  SESSION_ID: 'session-789',
} as const;

// Mock request object
const createMockRequest = (
  overrides: Partial<JWTAuthRequest> = {}
): JWTAuthRequest =>
  ({
    headers: {
      authorization: TEST_CONSTANTS.VALID_TOKEN,
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

// Mock execution context
const createMockExecutionContext = (
  request: JWTAuthRequest
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({}),
    }),
    getHandler: jest.fn(),
    getClass: jest.fn(),
    getArgs: jest.fn(),
    getArgByIndex: jest.fn(),
    switchToRpc: jest.fn(),
    switchToWs: jest.fn(),
    getType: jest.fn(),
  } as any);

// Mock JWT token payload
const createMockTokenPayload = (
  overrides: Partial<JWTTokenPayload> = {}
): JWTTokenPayload => {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: TEST_CONSTANTS.USER_ID,
    id: TEST_CONSTANTS.USER_ID,
    email: TEST_CONSTANTS.EMAIL,
    role: TEST_CONSTANTS.ROLE_USER,
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

describe('JwtGuard', () => {
  let guard: JwtGuard;
  let jwtService: jest.Mocked<JWTService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    // Create mocked JWT service
    const mockJwtService = {
      validateAccessToken: jest.fn(),
      extractTokenFromRequest: jest.fn(),
      isTokenBlacklisted: jest.fn(),
      isTokenNearExpiration: jest.fn(),
      decodeToken: jest.fn(),
    };

    // Create mocked Reflector
    const mockReflector = {
      getAllAndOverride: jest.fn(),
      get: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtGuard,
        {
          provide: JWTService,
          useValue: mockJwtService,
        },
        {
          provide: Reflector,
          useValue: mockReflector,
        },
      ],
    }).compile();

    guard = module.get<JwtGuard>(JwtGuard);
    jwtService = module.get<JWTService>(JWTService) as jest.Mocked<JWTService>;
    reflector = module.get<Reflector>(Reflector) as jest.Mocked<Reflector>;

    // Setup default reflector responses
    reflector.getAllAndOverride.mockReturnValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Token Extraction', () => {
    it('should extract token from Authorization header with Bearer prefix', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: 'Bearer valid.jwt.token' },
      });
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.validateAccessToken).toHaveBeenCalledWith('valid.jwt.token');
      expect(request.user).toEqual(mockPayload);
      expect(request.token).toBe('valid.jwt.token');
    });

    it('should handle missing Authorization header', async () => {
      // Arrange
      const request = createMockRequest({ headers: {} });
      const context = createMockExecutionContext(request);

      jwtService.extractTokenFromRequest.mockReturnValue(null);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
    });

    it('should handle Authorization header without Bearer prefix', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: 'Basic dGVzdDp0ZXN0' },
      });
      const context = createMockExecutionContext(request);

      jwtService.extractTokenFromRequest.mockReturnValue(null);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
    });

    it('should handle malformed Authorization header', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: 'Bearer' }, // Missing token
      });
      const context = createMockExecutionContext(request);

      jwtService.extractTokenFromRequest.mockReturnValue(null);

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
    });
  });

  describe('Token Validation', () => {
    it('should validate a valid token successfully', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(jwtService.extractTokenFromRequest).toHaveBeenCalledWith(request);
      expect(jwtService.validateAccessToken).toHaveBeenCalledWith('valid.jwt.token');
      expect(request.user).toEqual(mockPayload);
      expect(request.token).toBe('valid.jwt.token');
      expect(request.tokenPayload).toEqual(mockPayload);
    });

    it('should reject expired token', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: TEST_CONSTANTS.EXPIRED_TOKEN },
      });
      const context = createMockExecutionContext(request);

      jwtService.extractTokenFromRequest.mockReturnValue('expired.jwt.token');
      jwtService.validateAccessToken.mockRejectedValue(new Error('Token has expired'));

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      expect(request.authError).toBe('Token has expired');
    });

    it('should reject blacklisted token', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: TEST_CONSTANTS.BLACKLISTED_TOKEN },
      });
      const context = createMockExecutionContext(request);

      jwtService.extractTokenFromRequest.mockReturnValue('blacklisted.jwt.token');
      jwtService.validateAccessToken.mockRejectedValue(new Error('Token has been revoked'));

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
      expect(request.authError).toBe('Token has been revoked');
    });

    it('should reject token with invalid signature', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: TEST_CONSTANTS.INVALID_TOKEN },
      });
      const context = createMockExecutionContext(request);

      jwtService.validateAccessToken.mockRejectedValue(new Error('Invalid token signature'));

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should reject malformed token', async () => {
      // Arrange
      const request = createMockRequest({
        headers: { authorization: `Bearer ${TEST_CONSTANTS.MALFORMED_TOKEN}` },
      });
      const context = createMockExecutionContext(request);

      jwtService.validateAccessToken.mockRejectedValue(new Error('Token is malformed'));

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow access when no roles are required', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      reflector.getAllAndOverride.mockReturnValue(null); // No roles required

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access when user has required role', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        role: TEST_CONSTANTS.ROLE_ADMIN,
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options to require admin role
      reflector.getAllAndOverride.mockReturnValue({
        requireRoles: [TEST_CONSTANTS.ROLE_ADMIN]
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access when user has one of multiple required roles', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        role: TEST_CONSTANTS.ROLE_MODERATOR,
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options to require admin or moderator role
      reflector.getAllAndOverride.mockReturnValue({
        requireRoles: [TEST_CONSTANTS.ROLE_ADMIN, TEST_CONSTANTS.ROLE_MODERATOR]
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should deny access when user lacks required role', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        role: TEST_CONSTANTS.ROLE_USER,
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options to require admin role
      reflector.getAllAndOverride.mockReturnValue({
        requireRoles: [TEST_CONSTANTS.ROLE_ADMIN]
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('Permission-Based Access Control', () => {
    it('should allow access when user has required permission', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        permissions: ['read:profile', 'write:profile', 'read:users'],
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options to require specific permissions
      reflector.getAllAndOverride.mockReturnValue({
        requirePermissions: ['read:users']
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should allow access when user has all required permissions', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        permissions: [
          'read:profile',
          'write:profile',
          'read:users',
          'write:users',
        ],
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options to require multiple permissions
      reflector.getAllAndOverride.mockReturnValue({
        requirePermissions: ['read:users', 'write:users']
      });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should deny access when user lacks required permission', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        permissions: ['read:profile', 'write:profile'],
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options to require permission user doesn't have
      reflector.getAllAndOverride.mockReturnValue({
        requirePermissions: ['admin:users']
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
    });

    it('should deny access when user lacks one of multiple required permissions', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        permissions: ['read:profile', 'write:profile', 'read:users'],
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);
      jwtService.isTokenNearExpiration.mockReturnValue(false);

      // Mock security options - user has 'read:users' but missing 'admin:users'
      reflector.getAllAndOverride.mockReturnValue({
        requirePermissions: ['read:users', 'admin:users']
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException
      );
    });
  });

  describe('Device and Session Validation', () => {
    it('should validate device ID when required', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Mock JWT security options
      reflector.getAllAndOverride
        .mockReturnValueOnce(null) // No roles
        .mockReturnValueOnce(null) // No permissions
        .mockReturnValueOnce({ validateDevice: true } as JWTSecurityOptions); // Security options

      // Add device header
      request.headers = {
        ...request.headers,
        'x-device-id': TEST_CONSTANTS.DEVICE_ID,
      };

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject when device ID validation fails', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Mock the security options to return validateDevice: true
      reflector.getAllAndOverride.mockReturnValue({ validateDevice: true });

      // Add wrong device header
      request.headers = {
        ...request.headers,
        'x-device-id': 'different-device-id',
      };

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should validate IP address consistency', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload({
        ipAddress: '192.168.1.999', // Different IP
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      // Should pass but log warning (implementation detail)
      expect(result).toBe(true);
    });
  });

  describe('Token Age Validation', () => {
    it('should allow tokens within age limit', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      reflector.getAllAndOverride
        .mockReturnValueOnce(null) // No roles
        .mockReturnValueOnce(null) // No permissions
        .mockReturnValueOnce({ maxTokenAge: 1800 } as JWTSecurityOptions); // 30 minutes

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject tokens exceeding age limit', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const oldTime = Math.floor(Date.now() / 1000) - 7200; // 2 hours ago
      const mockPayload = createMockTokenPayload({
        iat: oldTime,
        exp: oldTime + 900,
      });

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Mock the security options to return maxTokenAge: 1800 (30 minutes)
      reflector.getAllAndOverride.mockReturnValue({ maxTokenAge: 1800 });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('Secure Context Validation', () => {
    it('should allow secure HTTPS requests when required', async () => {
      // Arrange
      const request = createMockRequest({ 
        secure: true,
        protocol: 'https' 
      } as any);
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      reflector.getAllAndOverride
        .mockReturnValueOnce(null) // No roles
        .mockReturnValueOnce(null) // No permissions
        .mockReturnValueOnce({
          requireSecureContext: true,
        } as JWTSecurityOptions);

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
    });

    it('should reject insecure HTTP requests when secure context required', async () => {
      // Arrange
      const request = createMockRequest({
        secure: false,
        protocol: 'http'
      } as any);
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Mock the security options to return requireSecureContext: true
      reflector.getAllAndOverride.mockReturnValue({ requireSecureContext: true });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle JWT service errors gracefully', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);

      jwtService.validateAccessToken.mockRejectedValue(
        new Error('JWT service error')
      );

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });

    it('should handle reflector errors gracefully', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      reflector.getAllAndOverride.mockImplementation(() => {
        throw new Error('Reflector error');
      });

      // Act & Assert
      await expect(guard.canActivate(context)).rejects.toThrow(
        UnauthorizedException
      );
    });
  });

  describe('Optional Authentication', () => {
    it('should allow requests without token when auth is optional', async () => {
      // Arrange
      const request = createMockRequest({ headers: {} });
      const context = createMockExecutionContext(request);

      // Mock the security options to return requireAuth: false
      reflector.getAllAndOverride.mockReturnValue({ requireAuth: false });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should validate token when provided even if auth is optional', async () => {
      // Arrange
      const request = createMockRequest();
      const context = createMockExecutionContext(request);
      const mockPayload = createMockTokenPayload();

      jwtService.extractTokenFromRequest.mockReturnValue('valid.jwt.token');
      jwtService.isTokenNearExpiration.mockReturnValue(false);
      jwtService.validateAccessToken.mockResolvedValue(mockPayload);

      // Mock the security options to return requireAuth: false
      reflector.getAllAndOverride.mockReturnValue({ requireAuth: false });

      // Act
      const result = await guard.canActivate(context);

      // Assert
      expect(result).toBe(true);
      expect(request.user).toEqual(mockPayload);
    });
  });
});
