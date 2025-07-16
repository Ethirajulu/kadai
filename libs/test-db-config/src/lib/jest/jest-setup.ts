import { TestDatabaseManager } from '../test-db-config';
import { TestCleanupManager } from '../cleanup/cleanup-manager';
import { CleanupVerifier } from '../verification/cleanup-verifier';
import { DatabaseConnections, TestDatabaseConfig } from '../../types/database';
import { JestCleanupHooks } from '../hooks/jest-hooks';
import { CleanupOptions } from '../../types/cleanup';

export interface JestSetupConfig {
  databases: {
    postgresql?: boolean;
    mongodb?: boolean;
    redis?: boolean;
    qdrant?: boolean;
  };
  cleanup: {
    enabled: boolean;
    beforeEach: boolean;
    afterEach: boolean;
    beforeAll: boolean;
    afterAll: boolean;
    options: CleanupOptions;
  };
  verification: {
    enabled: boolean;
    strictMode: boolean;
    onFailure: 'warn' | 'error' | 'ignore';
  };
  debugging: {
    enabled: boolean;
    logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
    logConnections: boolean;
    logOperations: boolean;
    logPerformance: boolean;
  };
  isolation: {
    enabled: boolean;
    useTransactions: boolean;
    separateProcesses: boolean;
  };
  performance: {
    monitoring: boolean;
    timeouts: {
      connection: number;
      operation: number;
      cleanup: number;
    };
  };
}

export class JestTestSetup {
  private static instance: JestTestSetup;
  private config: JestSetupConfig;
  private databaseManager: TestDatabaseManager;
  private cleanupManager: TestCleanupManager;
  private verifier: CleanupVerifier;
  private connections: DatabaseConnections = {};
  private setupCompleted = false;
  private cleanupHooks: JestCleanupHooks | null = null;

  private constructor(config: Partial<JestSetupConfig> = {}) {
    this.config = this.mergeWithDefaults(config);
    this.databaseManager = new TestDatabaseManager();
    this.cleanupManager = new TestCleanupManager();
    this.verifier = new CleanupVerifier({});
  }

  static getInstance(config?: Partial<JestSetupConfig>): JestTestSetup {
    if (!JestTestSetup.instance) {
      JestTestSetup.instance = new JestTestSetup(config);
    }
    return JestTestSetup.instance;
  }

  static async setup(config?: Partial<JestSetupConfig>): Promise<JestTestSetup> {
    const instance = JestTestSetup.getInstance(config);
    await instance.initialize();
    return instance;
  }

  private mergeWithDefaults(config: Partial<JestSetupConfig>): JestSetupConfig {
    return {
      databases: {
        postgresql: true,
        mongodb: true,
        redis: true,
        qdrant: true,
        ...config.databases,
      },
      cleanup: {
        enabled: true,
        beforeEach: true,
        afterEach: true,
        beforeAll: false,
        afterAll: true,
        options: {
          verifyCleanup: true,
          performanceMonitoring: true,
          isolateTransactions: true,
          timeoutMs: 30000,
        },
        ...config.cleanup,
      },
      verification: {
        enabled: true,
        strictMode: false,
        onFailure: 'warn',
        ...config.verification,
      },
      debugging: {
        enabled: process.env.NODE_ENV === 'development',
        logLevel: 'info',
        logConnections: true,
        logOperations: false,
        logPerformance: true,
        ...config.debugging,
      },
      isolation: {
        enabled: true,
        useTransactions: true,
        separateProcesses: false,
        ...config.isolation,
      },
      performance: {
        monitoring: true,
        timeouts: {
          connection: 5000,
          operation: 10000,
          cleanup: 30000,
        },
        ...config.performance,
      },
    };
  }

  async initialize(): Promise<void> {
    if (this.setupCompleted) {
      return;
    }

    try {
      this.log('info', 'Initializing Jest test setup...');

      // Initialize database connections
      await this.initializeDatabaseConnections();

      // Setup cleanup manager
      await this.setupCleanupManager();

      // Setup verification
      await this.setupVerification();

      // Setup Jest hooks
      await this.setupJestHooks();

      this.setupCompleted = true;
      this.log('info', 'Jest test setup completed successfully');

    } catch (error) {
      this.log('error', `Jest setup failed: ${error}`);
      throw error;
    }
  }

  private async initializeDatabaseConnections(): Promise<void> {
    const testConfig: TestDatabaseConfig = {
      isolation: {
        useTransactions: this.config.isolation.useTransactions,
        cleanupAfterEach: this.config.cleanup.afterEach,
        resetSequences: true,
      },
    };

    // Initialize enabled databases
    if (this.config.databases.postgresql) {
      this.connections.postgresql = await this.databaseManager.getPostgreSQLConnection({
        host: process.env.TEST_POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
        database: process.env.TEST_POSTGRES_DB || 'test_db',
        username: process.env.TEST_POSTGRES_USER || 'postgres',
        password: process.env.TEST_POSTGRES_PASSWORD || 'password',
        testDatabaseSuffix: `_jest_${Date.now()}`,
        poolSize: 5,
        connectionTimeoutMillis: this.config.performance.timeouts.connection,
      });
      this.log('info', 'PostgreSQL connection initialized');
    }

    if (this.config.databases.mongodb) {
      this.connections.mongodb = await this.databaseManager.getMongoDBConnection({
        host: process.env.TEST_MONGODB_HOST || 'localhost',
        port: parseInt(process.env.TEST_MONGODB_PORT || '27017'),
        database: process.env.TEST_MONGODB_DB || 'test_db',
        testDatabaseSuffix: `_jest_${Date.now()}`,
        timeout: this.config.performance.timeouts.connection,
        maxPoolSize: 5,
        minPoolSize: 1,
      });
      this.log('info', 'MongoDB connection initialized');
    }

    if (this.config.databases.redis) {
      this.connections.redis = await this.databaseManager.getRedisConnection({
        host: process.env.TEST_REDIS_HOST || 'localhost',
        port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
        db: parseInt(process.env.TEST_REDIS_DB || '0'),
        testKeyPrefix: `jest_${Date.now()}:`,
        keyPrefix: `test:`,
        lazyConnect: true,
      });
      this.log('info', 'Redis connection initialized');
    }

    if (this.config.databases.qdrant) {
      this.connections.qdrant = await this.databaseManager.getQdrantConnection({
        host: process.env.TEST_QDRANT_HOST || 'localhost',
        port: parseInt(process.env.TEST_QDRANT_PORT || '6333'),
        testCollectionPrefix: `jest_${Date.now()}_`,
        timeout: this.config.performance.timeouts.connection,
      });
      this.log('info', 'Qdrant connection initialized');
    }
  }

  private async setupCleanupManager(): Promise<void> {
    if (!this.config.cleanup.enabled) {
      return;
    }

    this.cleanupManager.setConnections(this.connections);
    this.log('info', 'Cleanup manager configured');
  }

  private async setupVerification(): Promise<void> {
    if (!this.config.verification.enabled) {
      return;
    }

    this.verifier = new CleanupVerifier(this.connections, {
      strictMode: this.config.verification.strictMode,
      parallelVerification: true,
      timeoutMs: this.config.performance.timeouts.operation,
    });
    this.log('info', 'Verification system configured');
  }

  private async setupJestHooks(): Promise<void> {
    if (!this.config.cleanup.enabled) {
      return;
    }

    this.cleanupHooks = new JestCleanupHooks(this.connections, {
      isolateTests: this.config.isolation.enabled,
      verifyCleanup: this.config.verification.enabled,
      performanceThreshold: this.config.performance.timeouts.cleanup,
      cleanupOptions: this.config.cleanup.options,
    });

    // Setup hooks based on configuration
    if (this.config.cleanup.beforeAll || this.config.cleanup.afterAll || 
        this.config.cleanup.beforeEach || this.config.cleanup.afterEach) {
      this.cleanupHooks.setupJestHooks();
    }

    this.log('info', 'Jest hooks configured');
  }

  /**
   * Get database connections for use in tests
   */
  getConnections(): DatabaseConnections {
    return this.connections;
  }

  /**
   * Get cleanup manager for manual cleanup operations
   */
  getCleanupManager(): TestCleanupManager {
    return this.cleanupManager;
  }

  /**
   * Get verifier for manual verification operations
   */
  getVerifier(): CleanupVerifier {
    return this.verifier;
  }

  /**
   * Get cleanup hooks for manual hook management
   */
  getCleanupHooks(): JestCleanupHooks | null {
    return this.cleanupHooks;
  }

  /**
   * Perform manual cleanup
   */
  async cleanup(databases?: string[]): Promise<void> {
    if (this.cleanupHooks) {
      await this.cleanupHooks.manualCleanup();
    } else {
      await this.cleanupManager.executeCleanup(databases);
    }
  }

  /**
   * Perform manual verification
   */
  async verify(databases?: string[]): Promise<boolean> {
    if (this.config.verification.enabled) {
      const report = await this.verifier.verifyCleanup(databases);
      
      if (report.criticalIssues > 0) {
        const message = `Verification failed with ${report.criticalIssues} critical issues`;
        
        switch (this.config.verification.onFailure) {
          case 'error':
            throw new Error(message);
          case 'warn':
            this.log('warn', message);
            break;
          case 'ignore':
            break;
        }
        
        return false;
      }
      
      return true;
    }
    
    return true;
  }

  /**
   * Reset database states
   */
  async reset(databases?: string[]): Promise<void> {
    await this.cleanupManager.executeReset(databases);
  }

  /**
   * Get configuration
   */
  getConfig(): JestSetupConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<JestSetupConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Teardown resources
   */
  async teardown(): Promise<void> {
    try {
      this.log('info', 'Tearing down Jest test setup...');

      // Final cleanup
      if (this.config.cleanup.enabled) {
        await this.cleanup();
      }

      // Close connections
      await this.closeConnections();

      this.setupCompleted = false;
      this.log('info', 'Jest test setup teardown completed');

    } catch (error) {
      this.log('error', `Jest teardown failed: ${error}`);
      throw error;
    }
  }

  private async closeConnections(): Promise<void> {
    const closePromises: Promise<void>[] = [];

    if (this.connections.postgresql?.pool) {
      closePromises.push(this.connections.postgresql.pool.end());
    }

    if (this.connections.mongodb?.client) {
      closePromises.push(this.connections.mongodb.client.close());
    }

    if (this.connections.redis?.client) {
      closePromises.push(this.connections.redis.client.quit());
    }

    if (this.connections.qdrant?.client) {
      // Qdrant client doesn't have an explicit close method
      // Connection will be closed automatically
    }

    await Promise.all(closePromises);
    this.log('info', 'All database connections closed');
  }

  private log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
    const levels = ['silent', 'error', 'warn', 'info', 'debug'];
    const configLevel = this.config.debugging.logLevel;
    
    if (levels.indexOf(level) <= levels.indexOf(configLevel)) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [JestSetup]`;
      
      switch (level) {
        case 'error':
          console.error(`${prefix} ERROR: ${message}`);
          break;
        case 'warn':
          console.warn(`${prefix} WARN: ${message}`);
          break;
        case 'info':
          console.info(`${prefix} INFO: ${message}`);
          break;
        case 'debug':
          console.debug(`${prefix} DEBUG: ${message}`);
          break;
      }
    }
  }

  /**
   * Get setup status
   */
  isSetupCompleted(): boolean {
    return this.setupCompleted;
  }

  /**
   * Get connection status
   */
  async getConnectionStatus(): Promise<{ [database: string]: boolean }> {
    const status: { [database: string]: boolean } = {};

    try {
      if (this.connections.postgresql?.pool) {
        const client = await this.connections.postgresql.pool.connect();
        await client.query('SELECT 1');
        client.release();
        status.postgresql = true;
      }
    } catch {
      status.postgresql = false;
    }

    try {
      if (this.connections.mongodb?.database) {
        await this.connections.mongodb.database.admin().ping();
        status.mongodb = true;
      }
    } catch {
      status.mongodb = false;
    }

    try {
      if (this.connections.redis?.client) {
        await this.connections.redis.client.ping();
        status.redis = true;
      }
    } catch {
      status.redis = false;
    }

    try {
      if (this.connections.qdrant?.client) {
        await this.connections.qdrant.client.getCollections();
        status.qdrant = true;
      }
    } catch {
      status.qdrant = false;
    }

    return status;
  }

  /**
   * Static method to reset singleton instance (for testing)
   */
  static resetInstance(): void {
    JestTestSetup.instance = null as any;
  }
}

/**
 * Global Jest setup function
 */
export async function setupJestEnvironment(config?: Partial<JestSetupConfig>): Promise<JestTestSetup> {
  return await JestTestSetup.setup(config);
}

/**
 * Global Jest teardown function
 */
export async function teardownJestEnvironment(): Promise<void> {
  const instance = JestTestSetup.getInstance();
  await instance.teardown();
  JestTestSetup.resetInstance();
}

/**
 * Get current Jest setup instance
 */
export function getJestSetup(): JestTestSetup {
  return JestTestSetup.getInstance();
}