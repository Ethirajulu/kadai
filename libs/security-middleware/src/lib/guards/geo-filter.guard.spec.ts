import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GeoFilterGuard } from './geo-filter.guard';
import { SecurityRequest } from '../types/security.types';
import * as geoip from 'geoip-lite';

jest.mock('geoip-lite');

describe('GeoFilterGuard', () => {
  let guard: GeoFilterGuard;
  let reflector: Reflector;
  let mockGeoipLookup: jest.MockedFunction<typeof geoip.lookup>;

  beforeEach(async () => {
    mockGeoipLookup = geoip.lookup as jest.MockedFunction<typeof geoip.lookup>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GeoFilterGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: string) => {
              const config: Record<string, string> = {
                ALLOWED_COUNTRIES: 'IN,US,GB',
                BLOCKED_COUNTRIES: 'CN,RU',
              };
              return config[key] || defaultValue;
            }),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<GeoFilterGuard>(GeoFilterGuard);
    reflector = module.get<Reflector>(Reflector);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    let mockContext: ExecutionContext;
    let mockRequest: SecurityRequest;

    beforeEach(() => {
      mockRequest = {
        headers: {},
        connection: { remoteAddress: '8.8.8.8' },
      } as SecurityRequest;

      mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
        }),
        getHandler: () => ({}),
      } as ExecutionContext;

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    });

    it('should allow requests from allowed countries', () => {
      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4192, -122.0574],
        metro: 807,
        area: 1000,
        eu: '0',
        timezone: 'America/Los_Angeles',
      });

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.ipInfo).toEqual({
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4192, -122.0574],
        metro: 807,
        area: 1000,
      });
    });

    it('should block requests from blocked countries', () => {
      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'CN',
        region: 'Beijing',
        city: 'Beijing',
        ll: [39.9042, 116.4074],
        metro: 0,
        area: 1000,
        eu: '0',
        timezone: 'Asia/Shanghai',
      });

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should block requests from non-allowed countries', () => {
      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'FR',
        region: 'Île-de-France',
        city: 'Paris',
        ll: [48.8566, 2.3522],
        metro: 0,
        area: 1000,
        eu: '1',
        timezone: 'Europe/Paris',
      });

      expect(() => guard.canActivate(mockContext)).toThrow(ForbiddenException);
    });

    it('should handle unknown IPs gracefully', () => {
      mockGeoipLookup.mockReturnValue(null);

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.ipInfo).toEqual({
        country: 'Unknown',
        region: 'Unknown',
        city: 'Unknown',
        ll: [0, 0],
        metro: 0,
        area: 0,
      });
    });

    it('should handle empty blocked countries list', () => {
      // Create guard with empty blocked countries
      const emptyBlockedGuard = new GeoFilterGuard(
        {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'ALLOWED_COUNTRIES') return 'IN,US,GB';
            if (key === 'BLOCKED_COUNTRIES') return ''; // Empty blocked countries
            return undefined;
          }),
        } as unknown as ConfigService,
        reflector
      );

      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'CN',
        region: 'Beijing',
        city: 'Beijing',
        ll: [39.9042, 116.4074],
        metro: 0,
        area: 1000,
        eu: '0',
        timezone: 'Asia/Shanghai',
      });

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      expect(() => emptyBlockedGuard.canActivate(mockContext)).toThrow(
        ForbiddenException
      ); // Should still be blocked by allowed countries
    });

    it('should handle empty allowed countries list', () => {
      // Create guard with empty allowed countries
      const emptyAllowedGuard = new GeoFilterGuard(
        {
          get: jest.fn().mockImplementation((key: string) => {
            if (key === 'ALLOWED_COUNTRIES') return ''; // Empty allowed countries
            if (key === 'BLOCKED_COUNTRIES') return 'CN';
            return undefined;
          }),
        } as unknown as ConfigService,
        reflector
      );

      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'FR',
        region: 'Île-de-France',
        city: 'Paris',
        ll: [48.8566, 2.3522],
        metro: 0,
        area: 1000,
        eu: '1',
        timezone: 'Europe/Paris',
      });

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const result = emptyAllowedGuard.canActivate(mockContext);
      expect(result).toBe(true); // Should allow when no allowed countries restriction and country not in blocked list
    });

    it('should handle IP extraction edge cases', () => {
      // Test with request missing all IP sources
      const edgeCaseRequest = {
        headers: {},
        method: 'GET',
        path: '/test',
      } as any;

      const edgeCaseContext = {
        switchToHttp: () => ({
          getRequest: () => edgeCaseRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
        getType: jest.fn(),
      } as ExecutionContext;

      mockGeoipLookup.mockReturnValue(null);
      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const result = guard.canActivate(edgeCaseContext);
      expect(result).toBe(true);
      expect(edgeCaseRequest.ipInfo?.country).toBe('Unknown');
    });

    it('should handle malformed x-forwarded-for header', () => {
      const malformedRequest = {
        headers: {
          'x-forwarded-for': '', // Empty x-forwarded-for
        },
        connection: { remoteAddress: '192.168.1.1' },
        socket: { remoteAddress: '192.168.1.1' },
        ip: '192.168.1.1',
        method: 'GET',
        path: '/test',
      } as any;

      const malformedContext = {
        switchToHttp: () => ({
          getRequest: () => malformedRequest,
          getResponse: jest.fn(),
          getNext: jest.fn(),
        }),
        getHandler: jest.fn(),
        getClass: jest.fn(),
        getArgs: jest.fn(),
        getArgByIndex: jest.fn(),
        switchToRpc: jest.fn(),
        switchToWs: jest.fn(),
        getType: jest.fn(),
      } as ExecutionContext;

      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'US',
        region: 'California',
        city: 'San Francisco',
        ll: [37.7749, -122.4194],
        metro: 807,
        area: 1000,
        eu: '0',
        timezone: 'America/Los_Angeles',
      });

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const result = guard.canActivate(malformedContext);
      expect(result).toBe(true);
    });

    it('should handle geoip lookup returning partial data', () => {
      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'US',
        region: null, // Missing region
        city: undefined, // Missing city
        ll: [37.7749, -122.4194],
        // Missing metro and area
        eu: '0',
        timezone: 'America/Los_Angeles',
      } as any);

      jest.spyOn(reflector, 'get').mockReturnValue(undefined);

      const result = guard.canActivate(mockContext);
      expect(result).toBe(true);
      expect(mockRequest.ipInfo).toEqual({
        country: 'US',
        region: null,
        city: undefined,
        ll: [37.7749, -122.4194],
        metro: 0,
        area: 0,
      });
    });

    it('should use route-specific configuration when available', () => {
      jest.spyOn(reflector, 'get').mockImplementation((key: unknown) => {
        if (key === 'allowedCountries') return ['US', 'CA'];
        if (key === 'blockedCountries') return ['RU'];
        return undefined;
      });

      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'CA',
        region: 'ON',
        city: 'Toronto',
        ll: [43.6532, -79.3832],
        metro: 0,
        area: 1000,
        eu: '0',
        timezone: 'America/Toronto',
      });

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(reflector.get).toHaveBeenCalledWith('allowedCountries', {});
      expect(reflector.get).toHaveBeenCalledWith('blockedCountries', {});
    });

    it('should handle x-forwarded-for header', () => {
      mockRequest.headers = { 'x-forwarded-for': '8.8.8.8,10.0.0.1' };

      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4192, -122.0574],
        metro: 807,
        area: 1000,
        eu: '0',
        timezone: 'America/Los_Angeles',
      });

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockGeoipLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    it('should handle x-real-ip header', () => {
      mockRequest.headers = { 'x-real-ip': '8.8.8.8' };

      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4192, -122.0574],
        metro: 807,
        area: 1000,
        eu: '0',
        timezone: 'America/Los_Angeles',
      });

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockGeoipLookup).toHaveBeenCalledWith('8.8.8.8');
    });

    it('should handle missing geo data gracefully', () => {
      mockGeoipLookup.mockReturnValue({
        range: [0, 0],
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4192, -122.0574],
        metro: 0,
        area: 0,
        eu: '0',
        timezone: 'America/Los_Angeles',
      });

      const result = guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockRequest.ipInfo).toEqual({
        country: 'US',
        region: 'CA',
        city: 'Mountain View',
        ll: [37.4192, -122.0574],
        metro: 0,
        area: 0,
      });
    });
  });
});
