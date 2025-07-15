// Jest setup and configuration
export {
  JestTestSetup,
  setupJestEnvironment,
  teardownJestEnvironment,
  getJestSetup,
} from './jest-setup';

export type {
  JestSetupConfig,
} from './jest-setup';

// Custom Jest matchers
export {
  DatabaseMatchers,
  registerCustomMatchers,
  createDatabaseMatchers,
} from './custom-matchers';

export type {
  CustomMatcherContext,
} from './custom-matchers';

// Debug utilities
export {
  DatabaseDebugger,
  DebugUtils,
  debugTest,
} from './debug-utilities';

export type {
  DebugContext,
  ConnectionDiagnostics,
  DatabaseStateSnapshot,
  DebugReport,
} from './debug-utilities';

// Configuration management
export {
  TestConfigurationManager,
  ConfigUtils,
  detectEnvironment,
  autoConfigureEnvironment,
} from './test-config';

export type {
  TestEnvironmentConfig,
} from './test-config';