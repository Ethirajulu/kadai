import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IPWhitelistGuard } from './ip-whitelist.guard';
import { SecurityRequest } from '../types/security.types';

// Helper function to create properly typed mock requests
const createMockRequest = (
  overrides: Partial<SecurityRequest> = {}
): SecurityRequest => {
  return {
    headers: {},
    connection: { remoteAddress: '127.0.0.1' } as any,
    socket: { remoteAddress: '127.0.0.1' } as any,
    ip: '127.0.0.1',
    ...overrides,
  } as unknown as SecurityRequest;
};

describe('IPWhitelistGuard', () => {
  let guard: IPWhitelistGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IPWhitelistGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                IP_WHITELIST: '127.0.0.1,192.168.1.1',
                IP_BLACKLIST: '10.0.0.1,10.0.0.2',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    guard = module.get<IPWhitelistGuard>(IPWhitelistGuard);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;

    beforeEach(() => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () => createMockRequest(),
        }),
      } as ExecutionContext;
    });

    it('should allow whitelisted IP', () => {
      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should block blacklisted IP', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should block non-whitelisted IP', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              connection: { remoteAddress: '192.168.1.100' } as any,
              socket: { remoteAddress: '192.168.1.100' } as any,
              ip: '192.168.1.100',
            }),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should handle x-forwarded-for header', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-forwarded-for': '127.0.0.1,10.0.0.1' },
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle x-real-ip header', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-real-ip': '127.0.0.1' },
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });
  });

  describe('with empty whitelist', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IPWhitelistGuard,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                const config: Record<string, string> = {
                  IP_WHITELIST: '', // Empty whitelist
                  IP_BLACKLIST: '10.0.0.1',
                };
                return config[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      guard = module.get<IPWhitelistGuard>(IPWhitelistGuard);
    });

    it('should allow any IP when whitelist is empty (except blacklisted)', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              connection: { remoteAddress: '192.168.1.100' } as any,
              socket: { remoteAddress: '192.168.1.100' } as any,
              ip: '192.168.1.100',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should still block blacklisted IP', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });

  // NEW TESTS FOR MISSING BRANCHES
  describe('getClientIP fallback scenarios', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IPWhitelistGuard,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                const config: Record<string, string> = {
                  IP_WHITELIST: '127.0.0.1,192.168.1.1',
                  IP_BLACKLIST: '10.0.0.1,10.0.0.2',
                };
                return config[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      guard = module.get<IPWhitelistGuard>(IPWhitelistGuard);
    });

    it('should use x-forwarded-for header when available', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-forwarded-for': '192.168.1.1,10.0.0.1' },
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should use x-real-ip header when x-forwarded-for is not available', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-real-ip': '192.168.1.1' },
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should use connection.remoteAddress when headers are not available', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: {},
              connection: { remoteAddress: '192.168.1.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should use socket.remoteAddress when connection.remoteAddress is not available', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: {},
              connection: { remoteAddress: undefined } as any,
              socket: { remoteAddress: '192.168.1.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should use req.ip when socket.remoteAddress is not available', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: {},
              connection: { remoteAddress: undefined } as any,
              socket: { remoteAddress: undefined } as any,
              ip: '192.168.1.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should fallback to 127.0.0.1 when no IP is available', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: {},
              connection: { remoteAddress: undefined } as any,
              socket: { remoteAddress: undefined } as any,
              ip: undefined,
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle x-forwarded-for with multiple IPs and use first one', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-forwarded-for': '192.168.1.1,10.0.0.1,172.16.0.1' },
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle x-forwarded-for with spaces', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-forwarded-for': ' 192.168.1.1 , 10.0.0.1 ' },
              connection: { remoteAddress: '10.0.0.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle null/undefined headers gracefully', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: null as any,
              connection: { remoteAddress: '192.168.1.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle undefined connection gracefully', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: {},
              connection: undefined,
              socket: { remoteAddress: '192.168.1.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle undefined socket gracefully', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: {},
              connection: { remoteAddress: undefined } as any,
              socket: undefined,
              ip: '192.168.1.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });
  });

  describe('edge cases', () => {
    beforeEach(async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          IPWhitelistGuard,
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string, defaultValue?: string) => {
                const config: Record<string, string> = {
                  IP_WHITELIST: '127.0.0.1,192.168.1.1',
                  IP_BLACKLIST: '10.0.0.1,10.0.0.2',
                };
                return config[key] || defaultValue;
              }),
            },
          },
        ],
      }).compile();

      guard = module.get<IPWhitelistGuard>(IPWhitelistGuard);
    });

    it('should handle empty x-forwarded-for header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-forwarded-for': '' },
              connection: { remoteAddress: '192.168.1.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle empty x-real-ip header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-real-ip': '' },
              connection: { remoteAddress: '192.168.1.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle malformed x-forwarded-for header', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () =>
            createMockRequest({
              headers: { 'x-forwarded-for': 'invalid-ip,192.168.1.1' },
              connection: { remoteAddress: '192.168.1.1' } as any,
              socket: { remoteAddress: '10.0.0.1' } as any,
              ip: '10.0.0.1',
            }),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });
  });
});
