/**
 * Global type definitions for security tests
 */

import { TestingModule } from '@nestjs/testing';
import { SecurityTestUtils } from '../utils/security-test-utils';

declare global {
  // Global test utilities
  function createSecurityTestModule(
    providers?: any[],
    imports?: any[]
  ): Promise<TestingModule>;
  
  function createMockSecurityRequest(overrides?: any): any;
  function createMockSecurityResponse(overrides?: any): any;
  function createMockJWTPayload(overrides?: any): any;
  
  // Security test constants
  const SECURITY_TEST_CONSTANTS: {
    VALID_JWT_TOKEN: string;
    EXPIRED_JWT_TOKEN: string;
    MALFORMED_JWT_TOKEN: string;
    MALICIOUS_PAYLOADS: Record<string, any>;
    RATE_LIMIT_TEST_ROUTES: string[];
    SECURITY_HEADERS: {
      REQUIRED: string[];
      FORBIDDEN: string[];
    };
  };
  
  // Utility functions
  function waitForRateLimit(ms?: number): Promise<void>;
  function generateMaliciousPayload(type: string): string;
  function assertSecurityHeaders(response: any): void;
  
  // Security test utils
  const SecurityTestUtils: typeof import('../utils/security-test-utils').SecurityTestUtils;
}

// Jest custom matchers for security tests
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeSecurelyConfigured(): R;
      toHaveSecurityHeaders(): R;
      toBeValidJWT(): R;
      toBeRateLimited(): R;
      toPreventRegression(issueId: string): R;
    }
  }
}

export {};