import { EventEmitter } from 'events';
import {
  CleanupManager,
  CleanupResult,
  CleanupOptions,
  CleanupVerificationResult,
  CleanupPerformanceReport,
  DatabaseCleanupStrategy,
  CleanupEvent,
  CleanupEventHandler,
  CleanupConfiguration,
  CleanupError,
  CleanupTimeoutError,
  TestCleanupContext,
  CleanupPerformanceMetrics,
} from '../../types/cleanup';
import { DatabaseConnections } from '../../types/database';

export class TestCleanupManager extends EventEmitter implements CleanupManager {
  private strategies: Map<string, DatabaseCleanupStrategy> = new Map();
  private connections: DatabaseConnections | null = null;
  private performanceHistory: CleanupResult[] = [];
  private configuration: CleanupConfiguration;
  private eventHandlers: Map<string, CleanupEventHandler[]> = new Map();

  constructor(config?: Partial<CleanupConfiguration>) {
    super();
    this.configuration = this.mergeConfiguration(config);
    this.setupDefaultEventHandlers();
  }

  private mergeConfiguration(config?: Partial<CleanupConfiguration>): CleanupConfiguration {
    const defaultConfig: CleanupConfiguration = {
      enabled: true,
      defaultOptions: {
        verifyCleanup: true,
        performanceMonitoring: true,
        isolateTransactions: true,
        preserveSchema: true,
        resetSequences: true,
        timeoutMs: 30000,
        batchSize: 1000,
        parallelization: false,
        logLevel: 'info',
        retryAttempts: 3,
        retryDelayMs: 1000,
      },
      databaseSettings: {
        postgresql: {
          resetSequences: true,
          useTransactions: true,
          cascadeDelete: true,
          vacuumAfterCleanup: false,
          checkConstraints: true,
        },
        mongodb: {
          preserveIndexes: true,
          compactAfterCleanup: false,
          validateCollections: true,
          dropSystemCollections: false,
        },
        redis: {
          flushAllDatabases: false,
          preserveConnections: true,
          clearExpiredOnly: false,
        },
        qdrant: {
          clearVectorsOnly: true,
          preserveSchema: true,
          optimizeAfterCleanup: false,
        },
      },
      performance: {
        enableMonitoring: true,
        warnThresholdMs: 5000,
        errorThresholdMs: 30000,
        reportingInterval: 1000,
      },
      verification: {
        enabled: true,
        strictMode: false,
      },
    };

    return {
      ...defaultConfig,
      ...config,
      defaultOptions: { ...defaultConfig.defaultOptions, ...config?.defaultOptions },
      databaseSettings: {
        ...defaultConfig.databaseSettings,
        ...config?.databaseSettings,
      },
      performance: { ...defaultConfig.performance, ...config?.performance },
      verification: { ...defaultConfig.verification, ...config?.verification },
    };
  }

  private setupDefaultEventHandlers(): void {
    this.on('cleanup_start', (event: CleanupEvent) => {
      if (this.configuration.defaultOptions.logLevel === 'debug' || this.configuration.defaultOptions.logLevel === 'info') {
        console.log(`[CleanupManager] Starting cleanup for ${event.database}`);
      }
    });

    this.on('cleanup_complete', (event: CleanupEvent) => {
      if (this.configuration.defaultOptions.logLevel !== 'silent') {
        const result = event.data as CleanupResult;
        console.log(`[CleanupManager] Completed cleanup for ${event.database} in ${result.duration}ms`);
      }
    });

    this.on('cleanup_error', (event: CleanupEvent) => {
      if (this.configuration.defaultOptions.logLevel !== 'silent') {
        console.error(`[CleanupManager] Cleanup failed for ${event.database}:`, event.error?.message);
      }
    });
  }

  setConnections(connections: DatabaseConnections): void {
    this.connections = connections;
  }

  registerStrategy(strategy: DatabaseCleanupStrategy): void {
    this.strategies.set(strategy.database, strategy);
    
    if (this.configuration.defaultOptions.logLevel === 'debug') {
      console.log(`[CleanupManager] Registered cleanup strategy for ${strategy.database}`);
    }
  }

  async executeCleanup(databases?: string[], options?: CleanupOptions): Promise<CleanupResult[]> {
    if (!this.configuration.enabled) {
      return [];
    }

    const mergedOptions = { ...this.configuration.defaultOptions, ...options };
    const targetDatabases = databases || Array.from(this.strategies.keys());
    const results: CleanupResult[] = [];

    for (const database of targetDatabases) {
      const strategy = this.strategies.get(database);
      if (!strategy) {
        const error = new CleanupError(`No cleanup strategy found for database: ${database}`, database, 'cleanup');
        results.push({
          success: false,
          database,
          duration: 0,
          recordsRemoved: 0,
          errors: [error],
        });
        continue;
      }

      try {
        const result = await this.executeWithTimeout(
          () => this.executeCleanupWithEvents(strategy, database, mergedOptions),
          mergedOptions.timeoutMs || 30000,
          database
        );

        results.push(result);
        this.performanceHistory.push(result);

        // Check performance thresholds
        if (mergedOptions.performanceMonitoring) {
          this.checkPerformanceThresholds(result);
        }

      } catch (error) {
        const cleanupError = error instanceof CleanupError ? error : 
          new CleanupError(`Cleanup failed: ${error}`, database, 'cleanup', error as Error);
        
        results.push({
          success: false,
          database,
          duration: 0,
          recordsRemoved: 0,
          errors: [cleanupError],
        });

        this.emitEvent({
          type: 'cleanup_error',
          database,
          timestamp: new Date(),
          error: cleanupError,
        });
      }
    }

    return results;
  }

  private async executeCleanupWithEvents(
    strategy: DatabaseCleanupStrategy,
    database: string,
    options: CleanupOptions
  ): Promise<CleanupResult> {
    this.emitEvent({
      type: 'cleanup_start',
      database,
      timestamp: new Date(),
      data: options,
    });

    const result = await strategy.cleanup(options);

    // Verify cleanup if requested
    if (options.verifyCleanup && this.configuration.verification.enabled) {
      const verificationResult = await strategy.verify(options);
      if (!verificationResult.isClean && this.configuration.verification.strictMode) {
        throw new CleanupError(
          `Cleanup verification failed for ${database}`,
          database,
          'verification'
        );
      }
    }

    this.emitEvent({
      type: 'cleanup_complete',
      database,
      timestamp: new Date(),
      data: result,
    });

    return result;
  }

  async executeReset(databases?: string[], options?: CleanupOptions): Promise<CleanupResult[]> {
    const mergedOptions = { ...this.configuration.defaultOptions, ...options };
    const targetDatabases = databases || Array.from(this.strategies.keys());
    const results: CleanupResult[] = [];

    for (const database of targetDatabases) {
      const strategy = this.strategies.get(database);
      if (!strategy) {
        results.push({
          success: false,
          database,
          duration: 0,
          recordsRemoved: 0,
          errors: [new CleanupError(`No strategy found for ${database}`, database, 'reset')],
        });
        continue;
      }

      try {
        const result = await this.executeWithTimeout(
          () => strategy.reset(mergedOptions),
          mergedOptions.timeoutMs || 30000,
          database
        );
        results.push(result);
      } catch (error) {
        const cleanupError = error instanceof CleanupError ? error : 
          new CleanupError(`Reset failed: ${error}`, database, 'reset', error as Error);
        
        results.push({
          success: false,
          database,
          duration: 0,
          recordsRemoved: 0,
          errors: [cleanupError],
        });
      }
    }

    return results;
  }

  async verifyCleanup(databases?: string[], options?: CleanupOptions): Promise<CleanupVerificationResult[]> {
    const mergedOptions = { ...this.configuration.defaultOptions, ...options };
    const targetDatabases = databases || Array.from(this.strategies.keys());
    const results: CleanupVerificationResult[] = [];

    for (const database of targetDatabases) {
      const strategy = this.strategies.get(database);
      if (!strategy) {
        results.push({
          isClean: false,
          database,
          issues: [{
            type: 'connection_issue',
            severity: 'critical',
            location: database,
            description: `No cleanup strategy found for database: ${database}`,
          }],
          verificationTime: 0,
          checkedItems: {},
        });
        continue;
      }

      try {
        this.emitEvent({
          type: 'verification_start',
          database,
          timestamp: new Date(),
        });

        const result = await this.executeWithTimeout(
          () => strategy.verify(mergedOptions),
          mergedOptions.timeoutMs || 30000,
          database
        );

        this.emitEvent({
          type: 'verification_complete',
          database,
          timestamp: new Date(),
          data: result,
        });

        results.push(result);
      } catch (error) {
        results.push({
          isClean: false,
          database,
          issues: [{
            type: 'connection_issue',
            severity: 'critical',
            location: database,
            description: `Verification failed: ${error}`,
          }],
          verificationTime: 0,
          checkedItems: {},
        });
      }
    }

    return results;
  }

  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    database: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new CleanupTimeoutError(database, 'cleanup', timeoutMs));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private checkPerformanceThresholds(result: CleanupResult): void {
    if (result.duration > this.configuration.performance.errorThresholdMs) {
      console.error(`[CleanupManager] CRITICAL: Cleanup for ${result.database} took ${result.duration}ms (threshold: ${this.configuration.performance.errorThresholdMs}ms)`);
    } else if (result.duration > this.configuration.performance.warnThresholdMs) {
      console.warn(`[CleanupManager] WARNING: Cleanup for ${result.database} took ${result.duration}ms (threshold: ${this.configuration.performance.warnThresholdMs}ms)`);
    }
  }

  getPerformanceReport(): CleanupPerformanceReport {
    if (this.performanceHistory.length === 0) {
      return {
        totalCleanups: 0,
        averageCleanupTime: 0,
        fastestCleanup: {} as CleanupResult,
        slowestCleanup: {} as CleanupResult,
        performanceTrends: [],
        recommendations: ['No cleanup history available'],
      };
    }

    const successful = this.performanceHistory.filter(r => r.success);
    const averageTime = successful.reduce((sum, r) => sum + r.duration, 0) / successful.length;
    const fastest = successful.reduce((min, r) => r.duration < min.duration ? r : min);
    const slowest = successful.reduce((max, r) => r.duration > max.duration ? r : max);

    const recommendations: string[] = [];
    if (averageTime > this.configuration.performance.warnThresholdMs) {
      recommendations.push('Consider optimizing cleanup operations - average time exceeds warning threshold');
    }
    if (successful.length < this.performanceHistory.length * 0.9) {
      recommendations.push('High failure rate detected - review cleanup strategies and error handling');
    }

    return {
      totalCleanups: this.performanceHistory.length,
      averageCleanupTime: averageTime,
      fastestCleanup: fastest,
      slowestCleanup: slowest,
      performanceTrends: successful.map(r => r.performanceMetrics).filter(Boolean) as CleanupPerformanceMetrics[],
      recommendations,
    };
  }

  private emitEvent(event: CleanupEvent): void {
    this.emit(event.type, event);
    
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(event);
        } catch (error) {
          console.error(`[CleanupManager] Event handler error:`, error);
        }
      });
    }
  }

  addEventListener(eventType: string, handler: CleanupEventHandler): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, []);
    }
    this.eventHandlers.get(eventType)!.push(handler);
  }

  removeEventListener(eventType: string, handler: CleanupEventHandler): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      const index = handlers.indexOf(handler);
      if (index > -1) {
        handlers.splice(index, 1);
      }
    }
  }

  // Utility methods for testing
  clearPerformanceHistory(): void {
    this.performanceHistory = [];
  }

  getConfiguration(): CleanupConfiguration {
    return { ...this.configuration };
  }

  updateConfiguration(config: Partial<CleanupConfiguration>): void {
    this.configuration = this.mergeConfiguration(config);
  }
}