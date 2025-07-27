const { pathsToModuleNameMapper } = require('ts-jest');

module.exports = {
  displayName: 'Security Tests',
  
  // Test match patterns for security tests
  testMatch: [
    '<rootDir>/libs/security-middleware/**/*.security.spec.ts',
    '<rootDir>/libs/auth-service/**/*.security.spec.ts',
    '<rootDir>/apps/**/security/**/*.spec.ts',
    '<rootDir>/**/*.security.test.ts',
    '<rootDir>/security-tests/**/*.spec.ts',
  ],
  
  // Test environment
  testEnvironment: 'node',
  
  // Setup files
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.ts',
    '<rootDir>/security-tests/setup.ts'
  ],
  
  // Coverage configuration for security-related code
  collectCoverageFrom: [
    'libs/security-middleware/src/**/*.ts',
    'libs/auth-service/src/**/*.ts',
    'apps/**/security/**/*.ts',
    'apps/**/guards/**/*.ts',
    'apps/**/middleware/**/*.ts',
    '!**/*.spec.ts',
    '!**/*.test.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/generated/**',
  ],
  
  // Coverage thresholds for security code
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 90,
      lines: 90,
      statements: 90,
    },
    'libs/security-middleware/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
    'libs/auth-service/': {
      branches: 90,
      functions: 95,
      lines: 95,
      statements: 95,
    },
  },
  
  // Coverage reporters
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json-summary',
  ],
  
  // Coverage directory
  coverageDirectory: '<rootDir>/coverage/security',
  
  // Module name mapping
  moduleNameMapper: {
    '^@kadai/(.*)$': '<rootDir>/libs/$1/src',
    '^apps/(.*)$': '<rootDir>/apps/$1/src',
  },
  
  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json',
      },
    ],
  },
  
  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  
  // Jest preset for Node.js testing
  preset: 'ts-jest/presets/default',
  
  // Test timeout for security tests (they might take longer)
  testTimeout: 30000,
  
  // Verbose output for security tests
  verbose: true,
  
  // Fail tests on console errors/warnings
  silent: false,
  
  // Security-specific test configuration
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '/tmp/',
    '/coverage/',
  ],
  
  // Custom reporters for security test results
  reporters: ['default'],
  
  // Error handling
  errorOnDeprecated: true,
  
  // Cache
  cache: false, // Disable cache for security tests to ensure fresh runs
  
  // Max workers (limit for security tests)
  maxWorkers: 2,
};