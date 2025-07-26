import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { IPWhitelistGuard } from './ip-whitelist.guard';
import { SecurityRequest } from '../types/security.types';

describe('IPWhitelistGuard', () => {
  let guard: IPWhitelistGuard;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IPWhitelistGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config = {
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
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;

    beforeEach(() => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            connection: { remoteAddress: '127.0.0.1' },
          } as SecurityRequest),
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
          getRequest: () => ({
            headers: {},
            connection: { remoteAddress: '10.0.0.1' },
          } as SecurityRequest),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should block non-whitelisted IP', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            connection: { remoteAddress: '192.168.1.100' },
          } as SecurityRequest),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should handle x-forwarded-for header', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-forwarded-for': '127.0.0.1,10.0.0.1' },
            connection: { remoteAddress: '10.0.0.1' },
          } as SecurityRequest),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should handle x-real-ip header', () => {
      mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: { 'x-real-ip': '127.0.0.1' },
            connection: { remoteAddress: '10.0.0.1' },
          } as SecurityRequest),
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
                const config = {
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
          getRequest: () => ({
            headers: {},
            connection: { remoteAddress: '192.168.1.100' },
          } as SecurityRequest),
        }),
      } as ExecutionContext;

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
    });

    it('should still block blacklisted IP', () => {
      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            connection: { remoteAddress: '10.0.0.1' },
          } as SecurityRequest),
        }),
      } as ExecutionContext;

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });
  });
});