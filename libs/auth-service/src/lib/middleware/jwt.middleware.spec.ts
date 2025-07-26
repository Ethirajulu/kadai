import { Test, TestingModule } from '@nestjs/testing';
import { Request, Response, NextFunction } from 'express';
import {
  JwtMiddleware,
  StrictJwtMiddleware,
  AutoRefreshJwtMiddleware,
  JwtMiddlewareFactory,
} from './jwt.middleware';
import { JwtService } from '../services/jwt.service';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '../models/user.model';
import { UnauthorizedException } from '@nestjs/common';

describe('JWT Middleware', () => {
  let jwtService: JwtService;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    role: UserRole.CUSTOMER,
    permissions: ['user:read'],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        {
          provide: JwtService,
          useValue: {
            extractTokenFromHeader: jest.fn(),
            validateToken: jest.fn(),
            validateRefreshToken: jest.fn(),
            refreshTokenPair: jest.fn(),
            refreshTokenPairByToken: jest.fn(),
            getTokenTimeToLive: jest.fn(),
            generateTokenPair: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: 'REDIS_CLIENT',
          useValue: {
            setex: jest.fn(),
            get: jest.fn(),
            exists: jest.fn(),
          },
        },
      ],
    }).compile();

    jwtService = module.get<JwtService>(JwtService);

    // Clean, simple mocks
    mockRequest = {
      headers: {},
      body: {},
      cookies: {},
      path: '',
    };

    mockResponse = {
      setHeader: jest.fn(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('JwtMiddleware', () => {
    let middleware: JwtMiddleware;

    beforeEach(() => {
      middleware = new JwtMiddleware(jwtService);
    });

    it('should call next() when no authorization header', async () => {
      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).jwtUser).toBeUndefined();
    });

    it('should call next() when invalid token format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat token' };
      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(null);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).jwtUser).toBeUndefined();
    });

    it('should set user and token on successful validation', async () => {
      const token = 'valid.jwt.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.validateToken as jest.Mock).mockResolvedValue(mockUser);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).jwtUser).toEqual(mockUser);
      expect((mockRequest as any).jwtToken).toBe(token);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should call next() on validation error without throwing', async () => {
      const token = 'invalid.jwt.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.validateToken as jest.Mock).mockRejectedValue(
        new Error('Invalid token')
      );

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect((mockRequest as any).jwtUser).toBeUndefined();
    });
  });

  describe('StrictJwtMiddleware', () => {
    let middleware: StrictJwtMiddleware;

    beforeEach(() => {
      middleware = new StrictJwtMiddleware(jwtService);
    });

    it('should throw UnauthorizedException when no authorization header', async () => {
      await expect(
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        )
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException for invalid token format', async () => {
      mockRequest.headers = { authorization: 'InvalidFormat token' };
      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(null);

      await expect(
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        )
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should set user and token on successful validation', async () => {
      const token = 'valid.jwt.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.validateToken as jest.Mock).mockResolvedValue(mockUser);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).jwtUser).toEqual(mockUser);
      expect((mockRequest as any).jwtToken).toBe(token);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should throw UnauthorizedException on validation failure', async () => {
      const token = 'invalid.jwt.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.validateToken as jest.Mock).mockResolvedValue(null);

      await expect(
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        )
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('AutoRefreshJwtMiddleware', () => {
    let middleware: AutoRefreshJwtMiddleware;

    beforeEach(() => {
      middleware = new AutoRefreshJwtMiddleware(jwtService);
    });

    it('should call next() when no authorization header', async () => {
      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle token near expiration and signal refresh needed', async () => {
      const token = 'near.expiry.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.getTokenTimeToLive as jest.Mock).mockReturnValue(200); // 200 seconds = under 5 minutes
      (jwtService.validateToken as jest.Mock).mockResolvedValue(mockUser);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Token-Refresh-Needed',
        'true'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Token-TTL', '200');
      expect((mockRequest as any).jwtUser).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should attempt automatic refresh when token is expired but refresh token available', async () => {
      const expiredToken = 'expired.jwt.token';
      const refreshToken = 'valid.refresh.token';
      const refreshResult = {
        accessToken: 'new.access.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
        user: {
          id: mockUser.id,
          email: mockUser.email,
          role: mockUser.role,
        },
      };

      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };
      mockRequest.body = { refreshToken };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(
        expiredToken
      );
      (jwtService.getTokenTimeToLive as jest.Mock).mockReturnValue(100);
      (jwtService.validateToken as jest.Mock)
        .mockRejectedValueOnce(new Error('Token expired'))
        .mockResolvedValueOnce(mockUser);
      (jwtService.refreshTokenPairByToken as jest.Mock).mockResolvedValue(
        refreshResult
      );

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-New-Access-Token',
        refreshResult.accessToken
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-New-Refresh-Token',
        refreshResult.refreshToken
      );
      expect((mockRequest as any).jwtToken).toBe(refreshResult.accessToken);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should try multiple sources for refresh token', async () => {
      const expiredToken = 'expired.jwt.token';
      const refreshToken = 'cookie.refresh.token';
      const refreshResult = {
        accessToken: 'new.access.token',
        refreshToken: 'new.refresh.token',
        expiresIn: 900,
        refreshExpiresIn: 604800,
        user: { id: mockUser.id, email: mockUser.email, role: mockUser.role },
      };

      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };
      mockRequest.cookies = { refreshToken };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(
        expiredToken
      );
      (jwtService.getTokenTimeToLive as jest.Mock).mockReturnValue(100);
      (jwtService.validateToken as jest.Mock)
        .mockRejectedValueOnce(new Error('Token expired'))
        .mockResolvedValueOnce(mockUser);
      (jwtService.refreshTokenPairByToken as jest.Mock).mockResolvedValue(
        refreshResult
      );

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(jwtService.refreshTokenPairByToken).toHaveBeenCalledWith(
        refreshToken
      );
    });

    it('should continue without user when refresh fails', async () => {
      const expiredToken = 'expired.jwt.token';
      const invalidRefreshToken = 'invalid.refresh.token';

      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };
      mockRequest.body = { refreshToken: invalidRefreshToken };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(
        expiredToken
      );
      (jwtService.getTokenTimeToLive as jest.Mock).mockReturnValue(100);
      (jwtService.validateToken as jest.Mock).mockRejectedValue(
        new Error('Token expired')
      );
      (jwtService.refreshTokenPairByToken as jest.Mock).mockRejectedValue(
        new Error('Invalid refresh token')
      );

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).jwtUser).toBeUndefined();
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('JwtMiddlewareFactory', () => {
    it('should create middleware with default options', async () => {
      const MiddlewareClass = JwtMiddlewareFactory.create(jwtService);
      const middleware = new MiddlewareClass();

      const token = 'valid.jwt.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.validateToken as jest.Mock).mockResolvedValue(mockUser);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect((mockRequest as any).jwtUser).toEqual(mockUser);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip middleware for specified paths', async () => {
      const MiddlewareClass = JwtMiddlewareFactory.create(jwtService, {
        skipPaths: ['/public', '/health'],
      });
      const middleware = new MiddlewareClass();

      mockRequest.url = '/public/api';

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalled();
      expect(jwtService.extractTokenFromHeader).not.toHaveBeenCalled();
    });

    it('should work in strict mode', async () => {
      const MiddlewareClass = JwtMiddlewareFactory.create(jwtService, {
        strict: true,
      });
      const middleware = new MiddlewareClass();

      await expect(
        middleware.use(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        )
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should handle auto-refresh when enabled', async () => {
      const MiddlewareClass = JwtMiddlewareFactory.create(jwtService, {
        autoRefresh: true,
        refreshThreshold: 600, // 10 minutes
      });
      const middleware = new MiddlewareClass();

      const token = 'near.expiry.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.getTokenTimeToLive as jest.Mock).mockReturnValue(300); // 5 minutes
      (jwtService.validateToken as jest.Mock).mockResolvedValue(mockUser);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'X-Token-Refresh-Needed',
        'true'
      );
      expect(mockResponse.setHeader).toHaveBeenCalledWith('X-Token-TTL', '300');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should not signal refresh when token has plenty of time left', async () => {
      const MiddlewareClass = JwtMiddlewareFactory.create(jwtService, {
        autoRefresh: true,
        refreshThreshold: 300, // 5 minutes
      });
      const middleware = new MiddlewareClass();

      const token = 'fresh.token';
      mockRequest.headers = { authorization: `Bearer ${token}` };

      (jwtService.extractTokenFromHeader as jest.Mock).mockReturnValue(token);
      (jwtService.getTokenTimeToLive as jest.Mock).mockReturnValue(600); // 10 minutes
      (jwtService.validateToken as jest.Mock).mockResolvedValue(mockUser);

      await middleware.use(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.setHeader).not.toHaveBeenCalledWith(
        'X-Token-Refresh-Needed',
        'true'
      );
      expect(mockNext).toHaveBeenCalled();
    });
  });
});
