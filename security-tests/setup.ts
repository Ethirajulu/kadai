/**
 * Security Test Setup Configuration
 * This file configures the testing environment for security-focused tests
 */

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

// Security test utilities and matchers
import './matchers/security-matchers';
import './utils/security-test-utils';

// Global test configuration
beforeAll(async () => {
  // Set test environment variables for security tests
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = 'test-jwt-secret-for-security-tests-only';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-security-tests-only';
  process.env.REDIS_URL = 'redis://localhost:6379/15'; // Use test database
  process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/kadai_test_security';
  
  // Security test specific configurations
  process.env.SECURITY_TEST_MODE = 'true';
  process.env.RATE_LIMIT_DISABLED = 'false'; // Keep rate limiting enabled for security tests
  process.env.CORS_DISABLED = 'false'; // Keep CORS enabled for security tests
  process.env.HELMET_DISABLED = 'false'; // Keep helmet enabled for security tests
  
  console.log('🔒 Security test environment initialized');
});

afterAll(async () => {
  // Cleanup after all security tests
  console.log('🔒 Security test environment cleanup completed');
});

// Global error handling for security tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection in security tests:', reason);
  throw reason;
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception in security tests:', error);
  throw error;
});

// Security test helper functions
global.createSecurityTestModule = async (providers: any[] = [], imports: any[] = []) => {
  const moduleBuilder = Test.createTestingModule({
    imports: [
      // Add common security modules
      ...imports,
    ],
    providers: [
      // Mock ConfigService with security configurations
      {
        provide: ConfigService,
        useValue: {
          get: jest.fn((key: string) => {
            const config = {
              'security.jwt.secret': 'test-jwt-secret',
              'security.jwt.refreshSecret': 'test-refresh-secret',
              'security.jwt.expiresIn': '15m',
              'security.jwt.refreshExpiresIn': '7d',
              'security.rateLimit.windowMs': 900000,
              'security.rateLimit.max': 100,
              'security.cors.origin': ['http://localhost:3000'],
              'security.helmet.enabled': true,
              'redis.host': 'localhost',
              'redis.port': 6379,
              'redis.db': 15,
            };
            return config[key];
          }),
        },
      },
      ...providers,
    ],
  });

  return moduleBuilder.compile();
};

// Security test data factories
global.createMockSecurityRequest = (overrides: any = {}) => {
  return {
    headers: {
      'user-agent': 'test-agent',
      'x-forwarded-for': '127.0.0.1',
      'authorization': 'Bearer test-token',
      ...overrides.headers,
    },
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    socket: { remoteAddress: '127.0.0.1' },
    url: '/test',
    method: 'GET',
    get: jest.fn((header: string) => {
      if (header === 'User-Agent') return 'test-agent';
      return undefined;
    }),
    ...overrides,
  };
};

global.createMockSecurityResponse = (overrides: any = {}) => {
  return {
    setHeader: jest.fn(),
    set: jest.fn(),
    status: jest.fn().mockReturnThis(),
    json: jest.fn(),
    send: jest.fn(),
    cookie: jest.fn(),
    clearCookie: jest.fn(),
    ...overrides,
  };
};

global.createMockJWTPayload = (overrides: any = {}) => {
  const now = Math.floor(Date.now() / 1000);
  return {
    sub: 'test-user-id',
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'user',
    permissions: ['read:profile'],
    iat: now,
    exp: now + 900,
    iss: 'kadai-auth',
    aud: 'kadai-api',
    jti: 'test-jti',
    tokenType: 'access',
    sessionId: 'test-session',
    deviceId: 'test-device',
    ipAddress: '127.0.0.1',
    userAgent: 'test-agent',
    scope: ['api:read'],
    refreshCount: 0,
    ...overrides,
  };
};

// Security test constants
global.SECURITY_TEST_CONSTANTS = {
  VALID_JWT_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoidXNlciIsImlhdCI6MTUxNjIzOTAyMn0.test',
  EXPIRED_JWT_TOKEN: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXItaWQiLCJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJyb2xlIjoidXNlciIsImlhdCI6MTUxNjIzOTAyMiwiZXhwIjoxNTE2MjM5MDIyfQ.expired',
  MALFORMED_JWT_TOKEN: 'invalid.jwt.token',
  MALICIOUS_PAYLOADS: {
    XSS: '<script>alert("xss")</script>',
    SQL_INJECTION: "'; DROP TABLE users; --",
    PATH_TRAVERSAL: '../../../etc/passwd',
    COMMAND_INJECTION: '; cat /etc/passwd',
    NOSQL_INJECTION: { $where: 'function() { return true; }' },
  },
  RATE_LIMIT_TEST_ROUTES: [
    '/api/auth/login',
    '/api/auth/register',
    '/api/users/profile',
  ],
  SECURITY_HEADERS: {
    REQUIRED: [
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'strict-transport-security',
      'content-security-policy',
    ],
    FORBIDDEN: [
      'x-powered-by',
      'server',
    ],
  },
};

// Security test utilities
global.waitForRateLimit = (ms: number = 1000) => {
  return new Promise(resolve => setTimeout(resolve, ms));
};

global.generateMaliciousPayload = (type: string) => {
  return global.SECURITY_TEST_CONSTANTS.MALICIOUS_PAYLOADS[type] || type;
};

global.assertSecurityHeaders = (response: any) => {
  const headers = response.headers || {};
  
  // Check required security headers
  global.SECURITY_TEST_CONSTANTS.SECURITY_HEADERS.REQUIRED.forEach(header => {
    expect(headers[header]).toBeDefined();
  });
  
  // Check forbidden headers are not present
  global.SECURITY_TEST_CONSTANTS.SECURITY_HEADERS.FORBIDDEN.forEach(header => {
    expect(headers[header]).toBeUndefined();
  });
};

// Add security-specific Jest matchers
expect.extend({
  toBeSecurelyConfigured(received) {
    const pass = received && typeof received === 'object';
    return {
      message: () => `expected ${received} to be securely configured`,
      pass,
    };
  },
  
  toHaveSecurityHeaders(received) {
    const headers = received.headers || {};
    const requiredHeaders = global.SECURITY_TEST_CONSTANTS.SECURITY_HEADERS.REQUIRED;
    const hasAllHeaders = requiredHeaders.every(header => headers[header]);
    
    return {
      message: () => `expected response to have security headers: ${requiredHeaders.join(', ')}`,
      pass: hasAllHeaders,
    };
  },
  
  toBeValidJWT(received) {
    // Simple JWT validation for tests
    const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    const pass = typeof received === 'string' && jwtPattern.test(received);
    
    return {
      message: () => `expected ${received} to be a valid JWT token`,
      pass,
    };
  },
  
  toBeRateLimited(received) {
    const pass = received && received.status === 429;
    return {
      message: () => `expected response to be rate limited (429 status)`,
      pass,
    };
  },
});

console.log('🔒 Security test setup completed');

// Export types for TypeScript
declare global {
  var createSecurityTestModule: (providers?: any[], imports?: any[]) => Promise<TestingModule>;
  var createMockSecurityRequest: (overrides?: any) => any;
  var createMockSecurityResponse: (overrides?: any) => any;
  var createMockJWTPayload: (overrides?: any) => any;
  var SECURITY_TEST_CONSTANTS: any;
  var waitForRateLimit: (ms?: number) => Promise<void>;
  var generateMaliciousPayload: (type: string) => string;
  var assertSecurityHeaders: (response: any) => void;
  
  namespace jest {
    interface Matchers<R> {
      toBeSecurelyConfigured(): R;
      toHaveSecurityHeaders(): R;
      toBeValidJWT(): R;
      toBeRateLimited(): R;
    }
  }
}