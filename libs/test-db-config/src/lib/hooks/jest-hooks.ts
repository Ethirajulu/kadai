// Jest globals - these will be available in the test environment
const jestGlobals = globalThis as any;
import {
  CleanupManager,
  CleanupOptions,
  CleanupResult,
} from '../../types/cleanup';
import { DatabaseConnections } from '../../types/database';
import { TestCleanupManager } from '../cleanup/cleanup-manager';
import { PostgreSQLCleanup } from '../cleanup/postgresql-cleanup';
import { MongoDBCleanup } from '../cleanup/mongodb-cleanup';
import { RedisCleanup } from '../cleanup/redis-cleanup';
import { QdrantCleanup } from '../cleanup/qdrant-cleanup';

interface JestHookOptions {
  databases?: string[];
  cleanupOptions?: CleanupOptions;
  skipSetup?: boolean;
  skipTeardown?: boolean;
  isolateTests?: boolean;
  verifyCleanup?: boolean;
  performanceThreshold?: number;
}

export class JestCleanupHooks {
  private cleanupManager: CleanupManager;
  private connections: DatabaseConnections | null = null;
  private options: JestHookOptions;
  private hookResults: Map<string, CleanupResult[]> = new Map();

  constructor(connections: DatabaseConnections, options: JestHookOptions = {}) {
    this.connections = connections;
    this.options = {
      verifyCleanup: true,
      isolateTests: true,
      performanceThreshold: 5000,
      ...options,
    };

    this.cleanupManager = new TestCleanupManager({
      defaultOptions: {
        verifyCleanup: this.options.verifyCleanup,
        performanceMonitoring: true,
        timeoutMs: this.options.performanceThreshold,
        ...this.options.cleanupOptions,
      },
    });

    this.setupCleanupStrategies();
  }

  private setupCleanupStrategies(): void {
    if (this.connections?.postgresql) {
      this.cleanupManager.registerStrategy(
        new PostgreSQLCleanup(this.connections.postgresql)
      );
    }

    if (this.connections?.mongodb) {
      this.cleanupManager.registerStrategy(
        new MongoDBCleanup(this.connections.mongodb)
      );
    }

    if (this.connections?.redis) {
      this.cleanupManager.registerStrategy(
        new RedisCleanup(this.connections.redis)
      );
    }

    if (this.connections?.qdrant) {
      this.cleanupManager.registerStrategy(
        new QdrantCleanup(this.connections.qdrant)
      );
    }
  }

  /**
   * Setup hooks for Jest test suites
   */
  public setupJestHooks(): void {
    if (!this.options.skipSetup) {
      jestGlobals.beforeAll(async () => {
        await this.setupTestEnvironment();
      });
    }

    if (this.options.isolateTests) {
      jestGlobals.beforeEach(async () => {
        await this.cleanupBeforeTest();
      });

      jestGlobals.afterEach(async () => {
        await this.cleanupAfterTest();
      });
    }

    if (!this.options.skipTeardown) {
      jestGlobals.afterAll(async () => {
        await this.teardownTestEnvironment();
      });
    }
  }

  /**
   * Manual cleanup for specific test scenarios
   */
  public async manualCleanup(
    options?: CleanupOptions
  ): Promise<CleanupResult[]> {
    const mergedOptions = { ...this.options.cleanupOptions, ...options };
    return await this.cleanupManager.executeCleanup(
      this.options.databases,
      mergedOptions
    );
  }

  /**
   * Reset all databases to initial state
   */
  public async resetDatabases(
    options?: CleanupOptions
  ): Promise<CleanupResult[]> {
    const mergedOptions = { ...this.options.cleanupOptions, ...options };
    return await this.cleanupManager.executeReset(
      this.options.databases,
      mergedOptions
    );
  }

  /**
   * Verify that databases are clean
   */
  public async verifyCleanDatabases(): Promise<boolean> {
    const results = await this.cleanupManager.verifyCleanup(
      this.options.databases
    );
    return results.every((result) => result.isClean);
  }

  /**
   * Get cleanup performance report
   */
  public getPerformanceReport() {
    return this.cleanupManager.getPerformanceReport();
  }

  /**
   * Get cleanup results history
   */
  public getCleanupHistory(): Map<string, CleanupResult[]> {
    return new Map(this.hookResults);
  }

  private async setupTestEnvironment(): Promise<void> {
    // Setup test environment - implementation depends on test context creation

    // Initial cleanup to ensure clean state
    const results = await this.cleanupManager.executeCleanup(
      this.options.databases,
      this.options.cleanupOptions
    );

    this.recordCleanupResults('setup', results);

    // Verify clean state
    if (this.options.verifyCleanup) {
      const isClean = await this.verifyCleanDatabases();
      if (!isClean) {
        throw new Error('Failed to establish clean test environment');
      }
    }
  }

  private async cleanupBeforeTest(): Promise<void> {
    const testName =
      jestGlobals.expect?.getState?.()?.currentTestName || 'unknown-test';

    try {
      const results = await this.cleanupManager.executeCleanup(
        this.options.databases,
        {
          ...this.options.cleanupOptions,
          isolateTransactions: true,
        }
      );

      this.recordCleanupResults(`before-${testName}`, results);

      // Check for cleanup failures
      const failures = results.filter((r) => !r.success);
      if (failures.length > 0) {
        console.warn(
          `[JestCleanupHooks] Cleanup warnings for test ${testName}:`,
          failures.map((f) => f.errors).flat()
        );
      }
    } catch (error) {
      console.error(
        `[JestCleanupHooks] Cleanup failed before test ${testName}:`,
        error
      );
      throw error;
    }
  }

  private async cleanupAfterTest(): Promise<void> {
    const testName =
      jestGlobals.expect?.getState?.()?.currentTestName || 'unknown-test';

    try {
      const results = await this.cleanupManager.executeCleanup(
        this.options.databases,
        {
          ...this.options.cleanupOptions,
          verifyCleanup: this.options.verifyCleanup,
        }
      );

      this.recordCleanupResults(`after-${testName}`, results);

      // Performance monitoring
      const slowCleanups = results.filter(
        (r) => r.duration > (this.options.performanceThreshold || 5000)
      );

      if (slowCleanups.length > 0) {
        console.warn(
          `[JestCleanupHooks] Slow cleanup detected for test ${testName}:`,
          slowCleanups.map((r) => `${r.database}: ${r.duration}ms`)
        );
      }
    } catch (error) {
      console.error(
        `[JestCleanupHooks] Cleanup failed after test ${testName}:`,
        error
      );
      // Don't throw here to avoid masking test failures
    }
  }

  private async teardownTestEnvironment(): Promise<void> {
    try {
      // Final cleanup
      const results = await this.cleanupManager.executeCleanup(
        this.options.databases,
        this.options.cleanupOptions
      );

      this.recordCleanupResults('teardown', results);

      // Generate performance report
      const report = this.cleanupManager.getPerformanceReport();
      if (report.recommendations.length > 0) {
        console.log(
          '[JestCleanupHooks] Performance recommendations:',
          report.recommendations
        );
      }
    } catch (error) {
      console.error('[JestCleanupHooks] Teardown failed:', error);
    }
  }

  private recordCleanupResults(phase: string, results: CleanupResult[]): void {
    this.hookResults.set(phase, results);
  }
}

/**
 * Global setup function for Jest projects
 */
export function setupGlobalCleanupHooks(
  connections: DatabaseConnections,
  options?: JestHookOptions
): JestCleanupHooks {
  const hooks = new JestCleanupHooks(connections, options);
  hooks.setupJestHooks();
  return hooks;
}

/**
 * Utility function to create scoped cleanup hooks for specific test files
 */
export function createScopedCleanupHooks(
  connections: DatabaseConnections,
  scope: string[],
  options?: JestHookOptions
): JestCleanupHooks {
  return new JestCleanupHooks(connections, {
    ...options,
    databases: scope,
  });
}

/**
 * Custom Jest matcher for verifying database cleanup
 */
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeCleanDatabase(): R;
    }
  }
}

export function extendJestMatchers(): void {
  jestGlobals.expect?.extend?.({
    async toBeCleanDatabase(cleanupHooks: JestCleanupHooks) {
      const isClean = await cleanupHooks.verifyCleanDatabases();

      if (isClean) {
        return {
          message: () => 'Expected databases to not be clean',
          pass: true,
        };
      } else {
        return {
          message: () => 'Expected databases to be clean',
          pass: false,
        };
      }
    },
  });
}
