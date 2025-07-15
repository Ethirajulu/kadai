export * from './lib/test-db-config';
export * from './types';

// Export seeders with specific exports to avoid conflicts
export {
  MongoDBSeeder,
  PostgreSQLSeeder,
  QdrantSeeder,
  RedisSeeder,
} from './lib/seeders/index';

// Export cleanup functionality - specific exports to avoid conflicts
export {
  // Cleanup manager and strategies
  TestCleanupManager,
  PostgreSQLCleanup,
  MongoDBCleanup,
  RedisCleanup,
  QdrantCleanup,
  
  // Jest hooks and automation
  JestCleanupHooks,
  setupGlobalCleanupHooks,
  createScopedCleanupHooks,
  extendJestMatchers,
  TestAutomationManager,
  createTestAutomation,
  
  // Verification and reporting
  CleanupVerifier,
  VerificationReporter,
  generateVerificationReport,
  
  // Utilities
  CleanupUtils,
} from './lib/index';

// Export Jest integration utilities
export {
  // Jest setup and configuration
  JestTestSetup,
  setupJestEnvironment,
  teardownJestEnvironment,
  getJestSetup,
  
  // Custom Jest matchers
  DatabaseMatchers,
  registerCustomMatchers,
  createDatabaseMatchers,
  
  // Debug utilities
  DatabaseDebugger,
  DebugUtils,
  debugTest,
  
  // Configuration management
  TestConfigurationManager,
  ConfigUtils,
  detectEnvironment,
  autoConfigureEnvironment,
} from './lib/jest';

// Export Jest types
export type {
  JestSetupConfig,
  CustomMatcherContext,
  DebugContext,
  ConnectionDiagnostics,
  DatabaseStateSnapshot,
  DebugReport,
  TestEnvironmentConfig,
} from './lib/jest';

// Export verification types
export type {
  VerificationReport,
  VerificationConfig,
  VerificationMetrics,
  CustomValidator,
  ReportFormat,
  ReportOptions,
  ConsoleReportOptions,
} from './lib/index';
