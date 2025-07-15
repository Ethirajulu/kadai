import { DatabaseConnections } from './database';

// Core cleanup interfaces
export interface CleanupResult {
  success: boolean;
  database: string;
  duration: number;
  recordsRemoved: number;
  tablesAffected?: string[];
  collectionsAffected?: string[];
  keysAffected?: string[];
  errors?: Error[];
  warnings?: string[];
  performanceMetrics?: CleanupPerformanceMetrics;
}

export interface CleanupPerformanceMetrics {
  connectionTime: number;
  queryExecutionTime: number;
  totalCleanupTime: number;
  memoryUsed: number;
  cpuUsage: number;
  operationsPerSecond: number;
  peakMemoryUsage: number;
}

export interface CleanupOptions {
  verifyCleanup?: boolean;
  performanceMonitoring?: boolean;
  isolateTransactions?: boolean;
  preserveSchema?: boolean;
  resetSequences?: boolean;
  timeoutMs?: number;
  batchSize?: number;
  parallelization?: boolean;
  logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
  retryAttempts?: number;
  retryDelayMs?: number;
}

export interface CleanupVerificationResult {
  isClean: boolean;
  database: string;
  issues: CleanupIssue[];
  verificationTime: number;
  checkedItems: {
    tables?: number;
    collections?: number;
    keys?: number;
    vectors?: number;
  };
}

export interface CleanupIssue {
  type:
    | 'data_remaining'
    | 'schema_modified'
    | 'connection_issue'
    | 'performance_degradation'
    | 'verification_failed';
  severity: 'critical' | 'warning' | 'info';
  location: string;
  description: string;
  suggestion?: string;
}

// Database-specific cleanup interfaces
export interface DatabaseCleanupStrategy {
  readonly database: string;
  cleanup(options?: CleanupOptions): Promise<CleanupResult>;
  verify(options?: CleanupOptions): Promise<CleanupVerificationResult>;
  reset(options?: CleanupOptions): Promise<CleanupResult>;
  getPerformanceMetrics(): CleanupPerformanceMetrics | null;
}

export interface PostgreSQLCleanupStrategy extends DatabaseCleanupStrategy {
  readonly database: 'postgresql';
  truncateTables(
    tables?: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult>;
  rollbackTransactions(): Promise<CleanupResult>;
  resetSequences(): Promise<CleanupResult>;
  dropTestSchemas(): Promise<CleanupResult>;
}

export interface MongoDBCleanupStrategy extends DatabaseCleanupStrategy {
  readonly database: 'mongodb';
  dropCollections(
    collections?: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult>;
  clearIndexes(): Promise<CleanupResult>;
  compactDatabase(): Promise<CleanupResult>;
}

export interface RedisCleanupStrategy extends DatabaseCleanupStrategy {
  readonly database: 'redis';
  flushDatabase(): Promise<CleanupResult>;
  deleteByPattern(
    patterns: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult>;
  clearExpiredKeys(): Promise<CleanupResult>;
}

export interface QdrantCleanupStrategy extends DatabaseCleanupStrategy {
  readonly database: 'qdrant';
  deleteCollections(
    collections?: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult>;
  clearVectors(): Promise<CleanupResult>;
  resetCollectionIndexes(): Promise<CleanupResult>;
}

// Cleanup manager interfaces
export interface CleanupManager {
  registerStrategy(strategy: DatabaseCleanupStrategy): void;
  executeCleanup(
    databases?: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult[]>;
  executeReset(
    databases?: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult[]>;
  verifyCleanup(
    databases?: string[],
    options?: CleanupOptions
  ): Promise<CleanupVerificationResult[]>;
  getPerformanceReport(): CleanupPerformanceReport;
  setConnections(connections: DatabaseConnections): void;
}

export interface CleanupPerformanceReport {
  totalCleanups: number;
  averageCleanupTime: number;
  fastestCleanup: CleanupResult;
  slowestCleanup: CleanupResult;
  performanceTrends: CleanupPerformanceMetrics[];
  recommendations: string[];
}

// Jest integration interfaces
export interface JestCleanupHooks {
  beforeEach: () => Promise<void>;
  afterEach: () => Promise<void>;
  beforeAll: () => Promise<void>;
  afterAll: () => Promise<void>;
}

export interface TestCleanupContext {
  testSuite: string;
  databases: string[];
  options: CleanupOptions;
  startTime: Date;
  endTime?: Date;
  results?: CleanupResult[];
}

// Configuration interfaces
export interface CleanupConfiguration {
  enabled: boolean;
  defaultOptions: CleanupOptions;
  databaseSettings: {
    postgresql?: PostgreSQLCleanupConfig;
    mongodb?: MongoDBCleanupConfig;
    redis?: RedisCleanupConfig;
    qdrant?: QdrantCleanupConfig;
  };
  performance: {
    enableMonitoring: boolean;
    warnThresholdMs: number;
    errorThresholdMs: number;
    reportingInterval: number;
  };
  verification: {
    enabled: boolean;
    strictMode: boolean;
    skipVerificationTables?: string[];
    skipVerificationCollections?: string[];
  };
}

export interface PostgreSQLCleanupConfig {
  preserveTables?: string[];
  resetSequences: boolean;
  useTransactions: boolean;
  cascadeDelete: boolean;
  vacuumAfterCleanup: boolean;
  checkConstraints: boolean;
}

export interface MongoDBCleanupConfig {
  preserveCollections?: string[];
  preserveIndexes: boolean;
  compactAfterCleanup: boolean;
  validateCollections: boolean;
  dropSystemCollections: boolean;
}

export interface RedisCleanupConfig {
  preserveKeyPatterns?: string[];
  flushAllDatabases: boolean;
  preserveConnections: boolean;
  clearExpiredOnly: boolean;
}

export interface QdrantCleanupConfig {
  preserveCollections?: string[];
  clearVectorsOnly: boolean;
  preserveSchema: boolean;
  optimizeAfterCleanup: boolean;
}

// Event interfaces for monitoring
export interface CleanupEvent {
  type:
    | 'cleanup_start'
    | 'cleanup_complete'
    | 'cleanup_error'
    | 'verification_start'
    | 'verification_complete';
  database: string;
  timestamp: Date;
  data?: unknown;
  error?: Error;
  context?: TestCleanupContext;
}

export type CleanupEventHandler = (event: CleanupEvent) => void;

// Utility types
export type CleanupMode = 'full' | 'data_only' | 'schema_only' | 'custom';
export type CleanupPriority = 'low' | 'normal' | 'high' | 'critical';
export type CleanupStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped';

// Error types
export class CleanupError extends Error {
  public cause?: Error;

  constructor(
    message: string,
    public database: string,
    public operation: string,
    cause?: Error
  ) {
    super(message);
    this.name = 'CleanupError';
    this.cause = cause;
  }
}

export class CleanupTimeoutError extends CleanupError {
  constructor(database: string, operation: string, timeoutMs: number) {
    super(
      `Cleanup operation timed out after ${timeoutMs}ms`,
      database,
      operation
    );
    this.name = 'CleanupTimeoutError';
  }
}

export class CleanupVerificationError extends CleanupError {
  constructor(database: string, issues: CleanupIssue[]) {
    super(
      `Cleanup verification failed with ${issues.length} issues`,
      database,
      'verification'
    );
    this.name = 'CleanupVerificationError';
  }
}
