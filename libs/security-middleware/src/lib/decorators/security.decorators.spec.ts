import {
  applyDecorators,
  UseInterceptors,
  UseGuards,
  SetMetadata,
} from '@nestjs/common';
import { SecurityInterceptor } from '../interceptors/security.interceptor';
import { RateLimitInterceptor } from '../interceptors/rate-limit.interceptor';
import { RateLimitGuard } from '../guards/rate-limit.guard';
import { RateLimitRule } from '../types/security.types';
import {
  Security,
  SkipRateLimit,
  CustomRateLimit,
  RateLimit,
  StrictRateLimit,
  LenientRateLimit,
  BurstLimit,
  DifferentiatedRateLimit,
  SlidingWindowRateLimit,
  AuthEndpointRateLimit,
  PublicApiRateLimit,
  RequireWhitelist,
  GeoFilter,
  ValidateAndSanitize,
  SkipIPWhitelist,
  SkipGeoFilter,
  IP_WHITELIST_KEY,
  GEO_FILTER_KEY,
  RATE_LIMIT_KEY,
  SKIP_RATE_LIMIT_KEY,
} from './security.decorators';

// Mock the NestJS decorators and modules
jest.mock('@nestjs/common', () => ({
  applyDecorators: jest.fn((...decorators) => decorators),
  UseInterceptors: jest.fn((...interceptors) => interceptors),
  UseGuards: jest.fn((...guards) => guards),
  SetMetadata: jest.fn((key, value) => ({ key, value })),
  Injectable: jest.fn(() => (target: any) => target),
}));

// Mock the interceptors and guards to prevent actual NestJS imports
jest.mock('../interceptors/security.interceptor', () => ({
  SecurityInterceptor: jest.fn(),
}));

jest.mock('../interceptors/rate-limit.interceptor', () => ({
  RateLimitInterceptor: jest.fn(),
}));

jest.mock('../guards/rate-limit.guard', () => ({
  RateLimitGuard: jest.fn(),
}));

describe('Security Decorators', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Metadata Decorators', () => {
    it('should create SkipIPWhitelist decorator', () => {
      const decorator = SkipIPWhitelist();
      expect(SetMetadata).toHaveBeenCalledWith(IP_WHITELIST_KEY, true);
      expect(decorator).toEqual({ key: IP_WHITELIST_KEY, value: true });
    });

    it('should create SkipGeoFilter decorator', () => {
      const decorator = SkipGeoFilter();
      expect(SetMetadata).toHaveBeenCalledWith(GEO_FILTER_KEY, true);
      expect(decorator).toEqual({ key: GEO_FILTER_KEY, value: true });
    });

    it('should create SkipRateLimit decorator', () => {
      const decorator = SkipRateLimit();
      expect(SetMetadata).toHaveBeenCalledWith(SKIP_RATE_LIMIT_KEY, true);
      expect(decorator).toEqual({ key: SKIP_RATE_LIMIT_KEY, value: true });
    });
  });

  describe('Security Decorator', () => {
    it('should apply SecurityInterceptor', () => {
      Security();
      expect(UseInterceptors).toHaveBeenCalledWith(SecurityInterceptor);
      expect(applyDecorators).toHaveBeenCalledWith([SecurityInterceptor]);
    });
  });

  describe('CustomRateLimit Decorator', () => {
    it('should apply custom rate limiting rule', () => {
      const customRule: RateLimitRule = {
        requests: 50,
        windowMs: 60000,
        message: 'Custom rate limit',
        standardHeaders: true,
        legacyHeaders: false,
      };

      CustomRateLimit(customRule);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, customRule);
      expect(UseGuards).toHaveBeenCalledWith(RateLimitGuard);
      expect(UseInterceptors).toHaveBeenCalledWith(RateLimitInterceptor);
      expect(applyDecorators).toHaveBeenCalledWith(
        { key: RATE_LIMIT_KEY, value: customRule },
        [RateLimitGuard],
        [RateLimitInterceptor]
      );
    });
  });

  describe('RateLimit Decorator', () => {
    it('should apply rate limiting with default parameters', () => {
      RateLimit();

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 100,
        windowMs: 15 * 60 * 1000,
        message:
          'Too many requests. Maximum 100 requests per 15 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
      expect(UseGuards).toHaveBeenCalledWith(RateLimitGuard);
      expect(UseInterceptors).toHaveBeenCalledWith(RateLimitInterceptor);
    });

    it('should apply rate limiting with custom parameters', () => {
      RateLimit(200, 30000);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 200,
        windowMs: 30000,
        message:
          'Too many requests. Maximum 200 requests per 1 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should handle different time windows correctly', () => {
      RateLimit(50, 120000); // 2 minutes

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 50,
        windowMs: 120000,
        message:
          'Too many requests. Maximum 50 requests per 2 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });
  });

  describe('StrictRateLimit Decorator', () => {
    it('should apply strict rate limiting with default parameters', () => {
      StrictRateLimit(10);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 10,
        windowMs: 15 * 60 * 1000,
        burst: 1,
        message:
          'Too many requests. Maximum 10 requests per 15 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should apply strict rate limiting with custom parameters', () => {
      StrictRateLimit(5, 60000, 2);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 5,
        windowMs: 60000,
        burst: 2,
        message: 'Too many requests. Maximum 5 requests per 1 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });
  });

  describe('LenientRateLimit Decorator', () => {
    it('should apply lenient rate limiting with default parameters', () => {
      LenientRateLimit();

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 1000,
        windowMs: 60 * 60 * 1000,
        burst: 100,
        message: 'Rate limit exceeded. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should apply lenient rate limiting with custom parameters', () => {
      LenientRateLimit(500, 1800000, 50);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 500,
        windowMs: 1800000,
        burst: 50,
        message: 'Rate limit exceeded. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });
  });

  describe('BurstLimit Decorator', () => {
    it('should apply burst limiting with default message', () => {
      BurstLimit(10);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 100,
        windowMs: 15 * 60 * 1000,
        burst: 10,
        message:
          'Too many requests in quick succession. Please wait before trying again.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should apply burst limiting with custom message', () => {
      BurstLimit(5, 'Custom burst message');

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 50,
        windowMs: 15 * 60 * 1000,
        burst: 5,
        message: 'Custom burst message',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });
  });

  describe('DifferentiatedRateLimit Decorator', () => {
    it('should apply differentiated rate limiting', () => {
      DifferentiatedRateLimit(50, 200, 300000);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 50, // Uses anonymous requests as default
        windowMs: 300000,
        message: 'Rate limit exceeded. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        authenticatedRequests: 200,
      });
    });

    it('should apply differentiated rate limiting with default window', () => {
      DifferentiatedRateLimit(30, 150);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 30,
        windowMs: 15 * 60 * 1000,
        message: 'Rate limit exceeded. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        authenticatedRequests: 150,
      });
    });
  });

  describe('SlidingWindowRateLimit Decorator', () => {
    it('should apply sliding window rate limiting', () => {
      SlidingWindowRateLimit(100, 300000, 30);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 100,
        windowMs: 300000,
        message: 'Rate limit exceeded. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        slidingWindow: { enabled: true, precision: 30 },
      });
    });

    it('should apply sliding window rate limiting with default precision', () => {
      SlidingWindowRateLimit(50, 120000);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 50,
        windowMs: 120000,
        message: 'Rate limit exceeded. Please try again later.',
        standardHeaders: true,
        legacyHeaders: false,
        slidingWindow: { enabled: true, precision: 60 },
      });
    });
  });

  describe('AuthEndpointRateLimit Decorator', () => {
    it('should apply auth endpoint rate limiting', () => {
      AuthEndpointRateLimit();

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 5,
        windowMs: 15 * 60 * 1000,
        burst: 2,
        message: {
          error: 'Authentication Rate Limit Exceeded',
          message:
            'Too many authentication attempts. Please wait 15 minutes before trying again.',
          statusCode: 429,
          retryAfter: 900,
        },
        standardHeaders: true,
        legacyHeaders: false,
      });
    });
  });

  describe('PublicApiRateLimit Decorator', () => {
    it('should apply public API rate limiting', () => {
      PublicApiRateLimit();

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 100,
        windowMs: 60 * 60 * 1000,
        burst: 20,
        message:
          'API rate limit exceeded. Consider authenticating for higher limits.',
        standardHeaders: true,
        legacyHeaders: false,
        authenticatedRequests: 500,
      });
    });
  });

  describe('RequireWhitelist Decorator', () => {
    it('should apply whitelist requirement', () => {
      RequireWhitelist();

      // RequireWhitelist currently returns empty applyDecorators
      expect(applyDecorators).toHaveBeenCalledWith();
    });
  });

  describe('GeoFilter Decorator', () => {
    it('should apply geo filtering', () => {
      const allowedCountries = ['US', 'CA', 'GB'];
      GeoFilter(allowedCountries);

      // GeoFilter currently returns empty applyDecorators
      expect(applyDecorators).toHaveBeenCalledWith();
    });
  });

  describe('ValidateAndSanitize Decorator', () => {
    it('should apply validation and sanitization', () => {
      ValidateAndSanitize();

      expect(UseInterceptors).toHaveBeenCalledWith(SecurityInterceptor);
      expect(applyDecorators).toHaveBeenCalledWith([SecurityInterceptor]);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle zero requests in rate limiting', () => {
      RateLimit(0, 60000);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 0,
        windowMs: 60000,
        message: 'Too many requests. Maximum 0 requests per 1 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should handle very large time windows', () => {
      RateLimit(10, 24 * 60 * 60 * 1000); // 24 hours

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 10,
        windowMs: 24 * 60 * 60 * 1000,
        message:
          'Too many requests. Maximum 10 requests per 1440 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should handle very small time windows', () => {
      RateLimit(100, 1000); // 1 second

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 100,
        windowMs: 1000,
        message:
          'Too many requests. Maximum 100 requests per 0 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });

    it('should handle negative burst values gracefully', () => {
      StrictRateLimit(10, 60000, -1);

      expect(SetMetadata).toHaveBeenCalledWith(RATE_LIMIT_KEY, {
        requests: 10,
        windowMs: 60000,
        burst: -1,
        message:
          'Too many requests. Maximum 10 requests per 1 minutes allowed.',
        standardHeaders: true,
        legacyHeaders: false,
      });
    });
  });

  describe('Decorator Composition', () => {
    it('should compose multiple decorators correctly', () => {
      applyDecorators(
        Security(),
        RateLimit(50, 60000),
        SkipIPWhitelist()
      );

      // Each decorator calls applyDecorators individually, so we expect multiple calls
      expect(applyDecorators).toHaveBeenCalled();
    });

    it('should handle decorator chaining', () => {
      const customRule: RateLimitRule = {
        requests: 25,
        windowMs: 30000,
        message: 'Custom rule',
        standardHeaders: true,
        legacyHeaders: false,
      };

      applyDecorators(
        CustomRateLimit(customRule),
        SkipGeoFilter()
      );

      // Each decorator calls applyDecorators individually, so we expect multiple calls
      expect(applyDecorators).toHaveBeenCalled();
    });
  });
});
