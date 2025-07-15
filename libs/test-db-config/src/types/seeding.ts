import {
  UserTestData,
  ProductTestData,
  OrderTestData,
  SellerProfileTestData,
  TaskTestData,
  ChatMessageTestData,
  VectorTestData,
  DatabaseConnections,
  PostgreSQLConnection,
  MongoDBConnection,
  RedisConnection,
  QdrantConnection,
} from './database';

// Base Seed Script Interfaces
export interface BaseSeedScript {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly dependencies: string[];
  execute(options?: SeedOptions): Promise<SeedResult>;
  rollback?(): Promise<SeedResult>;
  validate?(): Promise<boolean>;
}

export interface PostgreSQLSeedScript extends BaseSeedScript {
  readonly database: 'postgresql';
  executeSQL?(sql: string): Promise<unknown>;
  executeBulkInsert?(table: string, data: unknown[]): Promise<SeedResult>;
}

export interface MongoDBSeedScript extends BaseSeedScript {
  readonly database: 'mongodb';
  executeQuery?(collection: string, operation: unknown): Promise<unknown>;
  executeBulkInsert?(collection: string, data: unknown[]): Promise<SeedResult>;
}

export interface RedisSeedScript extends BaseSeedScript {
  readonly database: 'redis';
  executeCommand?(command: string, ...args: unknown[]): Promise<unknown>;
  setBatch?(keyValuePairs: Record<string, unknown>): Promise<SeedResult>;
}

export interface QdrantSeedScript extends BaseSeedScript {
  readonly database: 'qdrant';
  executeVectorOperation?(
    collection: string,
    operation: unknown
  ): Promise<unknown>;
  executeBulkUpsert?(
    collection: string,
    vectors: VectorTestData[]
  ): Promise<SeedResult>;
}

// Event handling types
export interface SeedEvent {
  readonly type:
    | 'seed_start'
    | 'seed_complete'
    | 'seed_error'
    | 'seed_progress';
  readonly seedId: string;
  readonly database: string;
  readonly timestamp: Date;
  readonly data?: unknown;
  readonly error?: Error;
}

export type SeedEventHandler = (event: SeedEvent) => void;

export interface SeedPerformanceMetrics {
  operation: string;
  database: string;
  recordCount: number;
  duration: number;
  recordsPerSecond: number;
  memoryUsage: number;
  errors: number;
  timestamp: Date;
}

// Seeding Configuration Types
export interface SeedOptions {
  userCount?: number;
  productCount?: number;
  orderCount?: number;
  taskCount?: number;
  messageCount?: number;
  vectorCount?: number;
  createRelationships?: boolean;
  scenario?: 'ecommerce' | 'marketplace' | 'conversation' | 'custom';
  cleanup?: boolean;
  validateData?: boolean;
}

export interface SeedResult {
  success: boolean;
  recordsCreated: number;
  duration: number;
  errors?: Error[];
  details?: Record<string, unknown>;
}

export interface BulkSeedResult {
  postgresql: SeedResult;
  mongodb: SeedResult;
  redis: SeedResult;
  qdrant: SeedResult;
  overall: {
    success: boolean;
    totalRecords: number;
    totalDuration: number;
    errors: Error[];
  };
}

// Cross-Database Orchestration Types
export interface CrossDatabaseSeedResult {
  success: boolean;
  totalRecords: number;
  duration: number;
  databases: string[];
  executionReport: SeedExecutionReport;
  errors?: Error[];
}

export interface SeedExecutionReport {
  executionId: string;
  startTime: Date;
  endTime: Date | null;
  totalDuration: number;
  totalRecords: number;
  databases: Record<string, DatabaseExecutionReport>;
  errors: Error[];
  success: boolean;
  rollbackRequired: boolean;
  rollbackCompleted: boolean;
}

export interface DatabaseExecutionReport {
  startTime: Date | null;
  endTime: Date | null;
  duration: number;
  recordsCreated: number;
  errors: Error[];
  success: boolean;
}

export interface SeedExecutionPlan {
  stages: SeedStage[];
  dependencies: SeedDependency[];
  parallelizable: boolean;
}

export interface SeedStage {
  databases: string[];
  description: string;
}

export interface SeedDependency {
  from: string;
  to: string;
  reason: string;
}

// Seed Versioning Types
export interface SeedVersion {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly dependencies?: SeedVersionDependency[];
  readonly createdAt: Date;
  readonly schema: Record<string, any>;
  readonly seedOptions: SeedOptions;
  readonly migrations?: SeedMigration[];
  readonly metadata?: Record<string, unknown>;
  readonly persistenceAdapter?: SeedVersionPersistenceAdapter;
}

export interface SeedVersionDependency {
  versionId: string;
  reason?: string;
}

export interface SeedVersionHistory {
  version: SeedVersion;
  createdAt: Date;
  appliedAt: Date | null;
  rollbackAt: Date | null;
  status: SeedVersionState;
  metadata?: Record<string, unknown>;
}

export type SeedVersionState = 'created' | 'applied' | 'rolled_back' | 'failed';

export interface SeedVersionOptions {
  defaultSeedOptions?: SeedOptions;
  persistenceAdapter?: SeedVersionPersistenceAdapter;
  forceDependentRollback?: boolean;
}

export interface SeedVersionResult {
  success: boolean;
  version?: string;
  error?: Error;
  message: string;
}

export interface SeedVersionValidation {
  isValid: boolean;
  errors: string[];
}

export interface SeedMigration {
  id: string;
  name: string;
  description: string;
  up?: () => Promise<void>;
  down?: () => Promise<void>;
}

export interface SeedVersionManager {
  initializeVersioning(options: SeedVersionOptions): Promise<SeedVersionResult>;
  createVersion(version: SeedVersion): Promise<SeedVersionResult>;
  applyVersion(
    versionId: string,
    options?: SeedVersionOptions
  ): Promise<SeedVersionResult>;
  rollbackVersion(
    versionId: string,
    options?: SeedVersionOptions
  ): Promise<SeedVersionResult>;
  getCurrentVersion(): string | null;
  getVersionHistory(): SeedVersionHistory[];
  getVersionState(versionId: string): SeedVersionState | undefined;
  validateVersion(version: SeedVersion): SeedVersionValidation;
  validateDependencies(
    dependencies: SeedVersionDependency[]
  ): SeedVersionValidation;
}

export interface SeedVersionPersistenceAdapter {
  saveVersionHistory(history: SeedVersionHistory[]): Promise<void>;
  loadVersionHistory(): Promise<SeedVersionHistory[]>;
}

// Test Scenario Types
export interface TestScenario {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly category:
    | 'business'
    | 'ai'
    | 'performance'
    | 'development'
    | 'testing';
  readonly config: SeedOptions;
  readonly expectedOutcome: {
    totalRecords: number;
    databases: string[];
    relationships: string[];
  };
  readonly metadata: {
    complexity: 'very low' | 'low' | 'medium' | 'high' | 'very high';
    duration: string;
    memoryUsage: 'very low' | 'low' | 'moderate' | 'high' | 'very high';
    useCase: string;
  };
  readonly validationRules: ValidationRule[];
}

export interface ValidationRule {
  readonly id: string;
  readonly description: string;
  readonly type: 'count' | 'relationship' | 'data_integrity' | 'performance';
  check: (data: SeedData) => Promise<boolean>;
  readonly errorMessage: string;
}

// Test Migration Types
export interface TestMigration {
  id: string;
  name: string;
  description: string;
  version: string;
  order: number;
  targetDatabases: string[];
  dependencies?: string[];
  rollbackOnFailure?: boolean;
  operations: TestMigrationOperations;
  rollback?: TestMigrationOperations;
  metadata?: Record<string, unknown>;
}

export interface TestMigrationOperations {
  postgresql?: PostgreSQLOperation[];
  mongodb?: MongoDBOperation[];
  redis?: RedisOperation[];
  qdrant?: QdrantOperation[];
}

export interface PostgreSQLOperation {
  sql?: string;
  script?: (client: unknown) => Promise<void>;
}

export interface MongoDBOperation {
  collection?: string;
  operation?: string;
  args?: unknown[];
  script?: (database: unknown) => Promise<void>;
}

export interface RedisOperation {
  command?: string;
  args?: unknown[];
  script?: (client: unknown) => Promise<void>;
}

export interface QdrantOperation {
  method?: string;
  args?: unknown[];
  script?: (client: unknown) => Promise<void>;
}

export interface TestMigrationResult {
  success: boolean;
  migrationId: string;
  error?: Error;
  message: string;
  duration: number;
  details?: Record<string, unknown>;
}

export interface TestMigrationHistory {
  migrationId: string;
  name: string;
  appliedAt: Date;
  rolledBackAt: Date | null;
  status: TestMigrationState;
  duration: number;
  results: Record<string, unknown>;
  metadata: Record<string, unknown>;
}

export type TestMigrationState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export interface TestMigrationOptions {
  environment?: string;
  continueOnFailure?: boolean;
  dryRun?: boolean;
}

export interface TestMigrationRunner {
  registerMigration(migration: TestMigration): void;
  runMigration(
    migrationId: string,
    options?: TestMigrationOptions
  ): Promise<TestMigrationResult>;
  rollbackMigration(
    migrationId: string,
    options?: TestMigrationOptions
  ): Promise<TestMigrationResult>;
  runAllPendingMigrations(
    options?: TestMigrationOptions
  ): Promise<TestMigrationResult[]>;
  getMigrationHistory(): TestMigrationHistory[];
  getMigrationState(migrationId: string): TestMigrationState | undefined;
  getAllMigrations(): TestMigration[];
  getPendingMigrations(): TestMigration[];
  getCompletedMigrations(): TestMigration[];
  getFailedMigrations(): TestMigration[];
}

export interface SeedData {
  users: UserTestData[];
  sellerProfiles: SellerProfileTestData[];
  products: ProductTestData[];
  orders: OrderTestData[];
  tasks: TaskTestData[];
  messages: ChatMessageTestData[];
  vectors: VectorTestData[];
}

// Seed Version Management
// (REMOVE this duplicate interface)
// export interface SeedVersion {
//   id: string;
//   name: string;
//   version: string;
//   description: string;
//   dependencies: string[];
//   createdAt: Date;
//   schema: Record<string, any>;
// }

// Scenario Definitions
// (REMOVE this duplicate interface)
// export interface TestScenario {
//   id: string;
//   name: string;
//   description: string;
//   config: SeedOptions;
//   expectedOutcome: {
//     users: number;
//     products: number;
//     orders: number;
//     tasks: number;
//     messages: number;
//     vectors: number;
//   };
//   validationRules: ValidationRule[];
// }

// (REMOVE this duplicate interface)
// export interface ValidationRule {
//   id: string;
//   description: string;
//   type: 'count' | 'relationship' | 'data_integrity' | 'performance';
//   check: (data: SeedData) => Promise<boolean>;
//   errorMessage: string;
// }

// Migration Types
export interface Migration {
  id: string;
  name: string;
  version: string;
  description: string;
  up(): Promise<void>;
  down(): Promise<void>;
  validate?(): Promise<boolean>;
}

export interface MigrationResult {
  success: boolean;
  migration: string;
  version: string;
  duration: number;
  error?: Error;
}

export interface SchemaVersion {
  version: string;
  appliedAt: Date;
  migrations: string[];
}

// Performance Metrics
export interface SeedPerformanceMetrics {
  operation: string;
  database: string;
  recordCount: number;
  duration: number;
  recordsPerSecond: number;
  memoryUsage: number;
  errors: number;
  timestamp: Date;
}

// Cleanup Configuration
export interface CleanupConfig {
  preserveSchema: boolean;
  resetSequences: boolean;
  truncateOnly: boolean;
  excludeTables?: string[];
  excludeCollections?: string[];
  excludeKeys?: string[];
}
