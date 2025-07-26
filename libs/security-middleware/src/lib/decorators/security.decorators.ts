import { applyDecorators, UseInterceptors } from '@nestjs/common';
import { SecurityInterceptor } from '../interceptors/security.interceptor';

/**
 * Apply comprehensive security measures to a route
 */
export function Security() {
  return applyDecorators(UseInterceptors(SecurityInterceptor));
}

/**
 * Apply rate limiting to a specific route
 */
export function RateLimit(windowMs = 15 * 60 * 1000, max = 100) {
  return applyDecorators();
  // Custom rate limit decorator implementation would go here
  // For now, using the global rate limiting middleware
}

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
