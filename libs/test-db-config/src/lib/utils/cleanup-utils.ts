import {
  CleanupResult,
  CleanupOptions,
  CleanupVerificationResult,
  CleanupError,
  CleanupConfiguration,
  TestCleanupContext,
} from '../../types/cleanup';
import { DatabaseConnections } from '../../types/database';

/**
 * Utility functions for test cleanup operations
 */
export class CleanupUtils {
  /**
   * Merge cleanup options with defaults
   */
  static mergeCleanupOptions(
    defaultOptions: CleanupOptions,
    userOptions?: CleanupOptions
  ): CleanupOptions {
    return {
      ...defaultOptions,
      ...userOptions,
      // Ensure critical safety options are preserved
      verifyCleanup: userOptions?.verifyCleanup ?? defaultOptions.verifyCleanup ?? true,
      isolateTransactions: userOptions?.isolateTransactions ?? defaultOptions.isolateTransactions ?? true,
      timeoutMs: Math.min(
        userOptions?.timeoutMs ?? defaultOptions.timeoutMs ?? 30000,
        60000 // Maximum 60 seconds
      ),
    };
  }

  /**
   * Validate cleanup configuration
   */
  static validateCleanupConfiguration(config: Partial<CleanupConfiguration>): string[] {
    const errors: string[] = [];

    if (config.defaultOptions?.timeoutMs && config.defaultOptions.timeoutMs > 60000) {
      errors.push('Cleanup timeout cannot exceed 60 seconds');
    }

    if (config.defaultOptions?.batchSize && config.defaultOptions.batchSize > 10000) {
      errors.push('Batch size cannot exceed 10,000 records');
    }

    if (config.defaultOptions?.retryAttempts && config.defaultOptions.retryAttempts > 5) {
      errors.push('Retry attempts cannot exceed 5');
    }

    if (config.performance?.errorThresholdMs && config.performance.errorThresholdMs < 1000) {
      errors.push('Error threshold must be at least 1 second');
    }

    return errors;
  }

  /**
   * Check if cleanup results indicate success
   */
  static isCleanupSuccessful(results: CleanupResult[]): boolean {
    return results.length > 0 && results.every(result => result.success);
  }

  /**
   * Check if verification results indicate clean state
   */
  static isVerificationClean(results: CleanupVerificationResult[]): boolean {
    return results.length > 0 && results.every(result => result.isClean);
  }

  /**
   * Extract errors from cleanup results
   */
  static extractCleanupErrors(results: CleanupResult[]): Error[] {
    return results
      .filter(result => result.errors && result.errors.length > 0)
      .flatMap(result => result.errors || []);
  }

  /**
   * Calculate total cleanup duration
   */
  static calculateTotalDuration(results: CleanupResult[]): number {
    return results.reduce((total, result) => total + result.duration, 0);
  }

  /**
   * Calculate total records removed
   */
  static calculateTotalRecordsRemoved(results: CleanupResult[]): number {
    return results.reduce((total, result) => total + result.recordsRemoved, 0);
  }

  /**
   * Generate cleanup summary report
   */
  static generateCleanupSummary(results: CleanupResult[]): {
    totalDuration: number;
    totalRecordsRemoved: number;
    successfulDatabases: string[];
    failedDatabases: string[];
    totalErrors: number;
    averageDuration: number;
    performanceIssues: string[];
  } {
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    const totalDuration = this.calculateTotalDuration(results);
    const totalRecords = this.calculateTotalRecordsRemoved(results);
    const errors = this.extractCleanupErrors(results);

    // Identify performance issues
    const performanceIssues: string[] = [];
    const slowResults = results.filter(r => r.duration > 5000);
    if (slowResults.length > 0) {
      performanceIssues.push(
        `Slow cleanup detected: ${slowResults.map(r => `${r.database} (${r.duration}ms)`).join(', ')}`
      );
    }

    if (totalRecords === 0 && results.length > 0) {
      performanceIssues.push('No records were removed - databases may already be clean');
    }

    return {
      totalDuration,
      totalRecordsRemoved: totalRecords,
      successfulDatabases: successful.map(r => r.database),
      failedDatabases: failed.map(r => r.database),
      totalErrors: errors.length,
      averageDuration: results.length > 0 ? totalDuration / results.length : 0,
      performanceIssues,
    };
  }

  /**
   * Generate verification summary report
   */
  static generateVerificationSummary(results: CleanupVerificationResult[]): {
    cleanDatabases: string[];
    dirtyDatabases: string[];
    totalIssues: number;
    criticalIssues: number;
    warningIssues: number;
    totalVerificationTime: number;
    recommendations: string[];
  } {
    const clean = results.filter(r => r.isClean);
    const dirty = results.filter(r => !r.isClean);
    const allIssues = results.flatMap(r => r.issues);
    const critical = allIssues.filter(i => i.severity === 'critical');
    const warnings = allIssues.filter(i => i.severity === 'warning');
    const totalTime = results.reduce((sum, r) => sum + r.verificationTime, 0);

    const recommendations: string[] = [];
    if (critical.length > 0) {
      recommendations.push('Critical issues detected - immediate attention required');
    }
    if (warnings.length > 5) {
      recommendations.push('Multiple warnings detected - review cleanup strategies');
    }
    if (dirty.length > 0) {
      recommendations.push(`Run cleanup again for: ${dirty.map(d => d.database).join(', ')}`);
    }

    return {
      cleanDatabases: clean.map(r => r.database),
      dirtyDatabases: dirty.map(r => r.database),
      totalIssues: allIssues.length,
      criticalIssues: critical.length,
      warningIssues: warnings.length,
      totalVerificationTime: totalTime,
      recommendations,
    };
  }

  /**
   * Create test cleanup context
   */
  static createTestContext(
    testName: string,
    databases: string[],
    options?: CleanupOptions
  ): TestCleanupContext {
    return {
      testSuite: testName,
      startTime: new Date(),
      databases,
      options: options || {},
    };
  }

  /**
   * Wait for database connections to be ready
   */
  static async waitForConnections(
    connections: DatabaseConnections,
    timeoutMs = 10000
  ): Promise<void> {
    const startTime = Date.now();
    const checkConnection = async (name: string, connection: any): Promise<void> => {
      if (!connection) return;

      switch (name) {
        case 'postgresql':
          // Test PostgreSQL connection
          const client = await connection.pool.connect();
          await client.query('SELECT 1');
          client.release();
          break;

        case 'mongodb':
          // Test MongoDB connection
          await connection.database.admin().ping();
          break;

        case 'redis':
          // Test Redis connection
          await connection.client.ping();
          break;

        case 'qdrant':
          // Test Qdrant connection
          await connection.client.getCollections();
          break;

        default:
          console.warn(`Unknown database type: ${name}`);
      }
    };

    const connectionChecks = Object.entries(connections).map(async ([name, connection]) => {
      let attempts = 0;
      const maxAttempts = 10;
      
      while (attempts < maxAttempts) {
        try {
          await checkConnection(name, connection);
          return;
        } catch (error) {
          attempts++;
          if (Date.now() - startTime > timeoutMs) {
            throw new CleanupError(
              `Connection timeout for ${name} after ${timeoutMs}ms`,
              name,
              'connection_check'
            );
          }
          
          if (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 500));
          } else {
            throw new CleanupError(
              `Failed to connect to ${name} after ${maxAttempts} attempts`,
              name,
              'connection_check',
              error as Error
            );
          }
        }
      }
    });

    await Promise.all(connectionChecks);
  }

  /**
   * Create retry wrapper for cleanup operations
   */
  static createRetryWrapper<T>(
    maxAttempts = 3,
    delayMs = 1000
  ): (operation: () => Promise<T>) => Promise<T> {
    return async (operation: () => Promise<T>): Promise<T> => {
      let lastError: Error | null = null;
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          return await operation();
        } catch (error) {
          lastError = error as Error;
          
          if (attempt < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delayMs * attempt));
          }
        }
      }

      throw new CleanupError(
        `Operation failed after ${maxAttempts} attempts`,
        'retry',
        'max_attempts_exceeded',
        lastError!
      );
    };
  }

  /**
   * Format duration for human-readable output
   */
  static formatDuration(milliseconds: number): string {
    if (milliseconds < 1000) {
      return `${milliseconds}ms`;
    } else if (milliseconds < 60000) {
      return `${(milliseconds / 1000).toFixed(2)}s`;
    } else {
      const minutes = Math.floor(milliseconds / 60000);
      const seconds = ((milliseconds % 60000) / 1000).toFixed(0);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Format memory usage for human-readable output
   */
  static formatMemory(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    
    return `${size.toFixed(2)} ${units[unitIndex]}`;
  }

  /**
   * Validate database connection configuration
   */
  static validateConnections(connections: DatabaseConnections): string[] {
    const errors: string[] = [];

    if (!connections || Object.keys(connections).length === 0) {
      errors.push('No database connections provided');
      return errors;
    }

    // Check PostgreSQL connection
    if (connections.postgresql && !connections.postgresql.pool) {
      errors.push('PostgreSQL connection missing pool');
    }

    // Check MongoDB connection
    if (connections.mongodb && !connections.mongodb.database) {
      errors.push('MongoDB connection missing database');
    }

    // Check Redis connection
    if (connections.redis && !connections.redis.client) {
      errors.push('Redis connection missing client');
    }

    // Check Qdrant connection
    if (connections.qdrant && !connections.qdrant.client) {
      errors.push('Qdrant connection missing client');
    }

    return errors;
  }
}