import type { Config } from 'jest';
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({
  dir: './',
});

const config: Config = {
  displayName: 'seller-dashboard',
  preset: '../../jest.preset.js',
  transform: {
    '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)': '@nx/react/plugins/jest',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  coverageDirectory: '../../coverage/apps/seller-dashboard',
  testEnvironment: 'jsdom',
  // Setup files
  setupFilesAfterEnv: ['<rootDir>/src/test-setup.ts'],
  // Force Jest to exit after tests complete
  forceExit: true,
  // Detect open handles to help debug hanging processes
  detectOpenHandles: true,
  // Set a timeout for tests
  testTimeout: 10000,
  // Clear mocks between tests
  clearMocks: true,
  // Reset modules between tests
  resetModules: true,
  // Exit on first test failure to avoid hanging
  bail: false,
  // Maximum number of worker processes
  maxWorkers: 1,
};

export default createJestConfig(config);
