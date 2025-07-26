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

// Metadata keys
export const IP_WHITELIST_KEY = 'ip_whitelist';
export const GEO_FILTER_KEY = 'geo_filter';
export const RATE_LIMIT_KEY = 'rate_limit';
export const SKIP_RATE_LIMIT_KEY = 'skip_rate_limit';

// Basic metadata decorators
export const SkipIPWhitelist = () => SetMetadata(IP_WHITELIST_KEY, true);
export const SkipGeoFilter = () => SetMetadata(GEO_FILTER_KEY, true);

/**
 * Apply comprehensive security measures to a route
 */
export function Security() {
  return applyDecorators(UseInterceptors(SecurityInterceptor));
}

// Rate Limiting Decorators

/**
 * Skip rate limiting for this endpoint
 */
export const SkipRateLimit = () => SetMetadata(SKIP_RATE_LIMIT_KEY, true);

/**
 * Apply custom rate limiting rules to this endpoint
 * @param rule - Custom rate limiting rule
 */
export const CustomRateLimit = (rule: RateLimitRule) =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );

/**
 * Apply rate limiting to a specific route with basic parameters
 */
export function RateLimit(requests = 100, windowMs = 15 * 60 * 1000) {
  const rule: RateLimitRule = {
    requests,
    windowMs,
    message: `Too many requests. Maximum ${requests} requests per ${Math.round(
      windowMs / 60000
    )} minutes allowed.`,
    standardHeaders: true,
    legacyHeaders: false,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
}

/**
 * Apply strict rate limiting (useful for auth endpoints)
 * @param requests - Number of requests allowed
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 * @param burst - Burst limit (default: 1)
 */
export const StrictRateLimit = (
  requests: number,
  windowMs: number = 15 * 60 * 1000,
  burst = 1
) => {
  const rule: RateLimitRule = {
    requests,
    windowMs,
    burst,
    message: `Too many requests. Maximum ${requests} requests per ${Math.round(
      windowMs / 60000
    )} minutes allowed.`,
    standardHeaders: true,
    legacyHeaders: false,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Apply lenient rate limiting (useful for public APIs)
 * @param requests - Number of requests allowed (default: 1000)
 * @param windowMs - Time window in milliseconds (default: 1 hour)
 * @param burst - Burst limit (default: 100)
 */
export const LenientRateLimit = (
  requests = 1000,
  windowMs = 60 * 60 * 1000,
  burst = 100
) => {
  const rule: RateLimitRule = {
    requests,
    windowMs,
    burst,
    message: `Rate limit exceeded. Please try again later.`,
    standardHeaders: true,
    legacyHeaders: false,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Apply burst-only rate limiting (useful for preventing spam)
 * @param burst - Maximum requests in burst window
 * @param message - Custom error message
 */
export const BurstLimit = (burst: number, message?: string) => {
  const rule: RateLimitRule = {
    requests: burst * 10, // Set high main limit
    windowMs: 15 * 60 * 1000, // 15 minutes
    burst,
    message:
      message ||
      `Too many requests in quick succession. Please wait before trying again.`,
    standardHeaders: true,
    legacyHeaders: false,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Apply different rate limits for authenticated vs anonymous users
 * @param anonymousRequests - Requests allowed for anonymous users
 * @param authenticatedRequests - Requests allowed for authenticated users
 * @param windowMs - Time window in milliseconds (default: 15 minutes)
 */
export const DifferentiatedRateLimit = (
  anonymousRequests: number,
  authenticatedRequests: number,
  windowMs: number = 15 * 60 * 1000
) => {
  // This decorator sets the anonymous limit, the guard will determine which to use
  const rule: RateLimitRule = {
    requests: anonymousRequests,
    windowMs,
    message: `Rate limit exceeded. Please try again later.`,
    standardHeaders: true,
    legacyHeaders: false,
    // Store authenticated limit in custom property for guard to use
    ['authenticatedRequests' as any]: authenticatedRequests,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Apply sliding window rate limiting
 * @param requests - Number of requests allowed
 * @param windowMs - Time window in milliseconds
 * @param precision - Precision in seconds (default: 60)
 */
export const SlidingWindowRateLimit = (
  requests: number,
  windowMs: number,
  precision = 60
) => {
  const rule: RateLimitRule = {
    requests,
    windowMs,
    message: `Rate limit exceeded. Please try again later.`,
    standardHeaders: true,
    legacyHeaders: false,
    // Custom property to indicate sliding window preference
    ['slidingWindow' as any]: { enabled: true, precision },
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Composite decorator for common auth endpoint protection
 * - Very strict limits
 * - Burst protection
 * - Custom error messages
 */
export const AuthEndpointRateLimit = () => {
  const rule: RateLimitRule = {
    requests: 5,
    windowMs: 15 * 60 * 1000, // 15 minutes
    burst: 2,
    message: {
      error: 'Authentication Rate Limit Exceeded',
      message:
        'Too many authentication attempts. Please wait 15 minutes before trying again.',
      statusCode: 429,
      retryAfter: 900, // 15 minutes in seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Composite decorator for public API endpoint protection
 * - Moderate limits
 * - Higher burst allowance
 * - Different limits for auth vs anonymous
 */
export const PublicApiRateLimit = () => {
  const rule: RateLimitRule = {
    requests: 100, // Anonymous limit
    windowMs: 60 * 60 * 1000, // 1 hour
    burst: 20,
    message:
      'API rate limit exceeded. Consider authenticating for higher limits.',
    standardHeaders: true,
    legacyHeaders: false,
    // Store authenticated limit
    ['authenticatedRequests' as any]: 500,
  };

  return applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, rule),
    UseGuards(RateLimitGuard),
    UseInterceptors(RateLimitInterceptor)
  );
};

/**
 * Require IP whitelisting for a specific route
 */
export function RequireWhitelist() {
  return applyDecorators();
  // Custom whitelist guard implementation would go here
}

/**
 * Apply geo-filtering to a specific route
 */
export function GeoFilter(allowedCountries: string[]) {
  return applyDecorators();
  // Custom geo filter guard implementation would go here
}

/**
 * Apply input validation and sanitization
 */
export function ValidateAndSanitize() {
  return applyDecorators(UseInterceptors(SecurityInterceptor));
}
