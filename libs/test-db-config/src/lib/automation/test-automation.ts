import {
  CleanupManager,
  CleanupOptions,
  CleanupResult,
  CleanupVerificationResult,
  CleanupConfiguration,
  CleanupError,
} from '../../types/cleanup';
import { DatabaseConnections } from '../../types/database';
import { TestCleanupManager } from '../cleanup/cleanup-manager';
import { JestCleanupHooks } from '../hooks/jest-hooks';

export interface TestAutomationConfig {
  connections: DatabaseConnections;
  cleanupConfig?: Partial<CleanupConfiguration>;
  testConfig?: {
    enableParallelTests?: boolean;
    testIsolation?: boolean;
    performanceMonitoring?: boolean;
    automaticCleanup?: boolean;
    cleanupTimeout?: number;
    retryFailedCleanup?: boolean;
    maxRetries?: number;
  };
  reporting?: {
    enableDetailedReports?: boolean;
    logLevel?: 'silent' | 'error' | 'warn' | 'info' | 'debug';
    metricsCollection?: boolean;
    exportReports?: boolean;
    reportDirectory?: string;
  };
}

export interface TestRunContext {
  runId: string;
  testSuite: string;
  testFile: string;
  startTime: number;
  databases: string[];
  cleanupResults: CleanupResult[];
  verificationResults: CleanupVerificationResult[];
  errors: Error[];
  metrics: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    cleanupDuration: number;
    verificationDuration: number;
  };
}

export class TestAutomationManager {
  private config: TestAutomationConfig;
  private cleanupManager: CleanupManager;
  private jestHooks: JestCleanupHooks;
  private activeContexts: Map<string, TestRunContext> = new Map();
  private globalMetrics: {
    totalRuns: number;
    successfulRuns: number;
    failedRuns: number;
    averageCleanupTime: number;
    averageVerificationTime: number;
  } = {
    totalRuns: 0,
    successfulRuns: 0,
    failedRuns: 0,
    averageCleanupTime: 0,
    averageVerificationTime: 0,
  };

  constructor(config: TestAutomationConfig) {
    this.config = {
      testConfig: {
        enableParallelTests: false,
        testIsolation: true,
        performanceMonitoring: true,
        automaticCleanup: true,
        cleanupTimeout: 30000,
        retryFailedCleanup: true,
        maxRetries: 3,
        ...config.testConfig,
      },
      reporting: {
        enableDetailedReports: true,
        logLevel: 'info',
        metricsCollection: true,
        exportReports: false,
        reportDirectory: './test-reports',
        ...config.reporting,
      },
      ...config,
    };

    this.cleanupManager = new TestCleanupManager(this.config.cleanupConfig);
    this.jestHooks = new JestCleanupHooks(
      this.config.connections,
      {
        isolateTests: this.config.testConfig?.testIsolation,
        verifyCleanup: true,
        performanceThreshold: this.config.testConfig?.cleanupTimeout,
      }
    );
  }

  /**
   * Initialize test automation with database connections and strategies
   */
  async initialize(): Promise<void> {
    try {
      // Setup cleanup manager connections
      this.cleanupManager.setConnections(this.config.connections);

      // Setup Jest hooks if not in manual mode
      if (this.config.testConfig?.automaticCleanup) {
        this.jestHooks.setupJestHooks();
      }

      this.log('info', 'Test automation initialized successfully');
    } catch (error) {
      this.log('error', `Failed to initialize test automation: ${error}`);
      throw new CleanupError(
        'Test automation initialization failed',
        'automation',
        'initialization',
        error as Error
      );
    }
  }

  /**
   * Create a new test run context
   */
  createTestRunContext(
    testSuite: string,
    testFile: string,
    databases?: string[]
  ): TestRunContext {
    const runId = `${testSuite}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const context: TestRunContext = {
      runId,
      testSuite,
      testFile,
      startTime: Date.now(),
      databases: databases || ['postgresql', 'mongodb', 'redis', 'qdrant'],
      cleanupResults: [],
      verificationResults: [],
      errors: [],
      metrics: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        cleanupDuration: 0,
        verificationDuration: 0,
      },
    };

    this.activeContexts.set(runId, context);
    this.log('debug', `Created test run context: ${runId}`);
    
    return context;
  }

  /**
   * Execute cleanup for a specific test run
   */
  async executeTestCleanup(
    runId: string,
    options?: CleanupOptions
  ): Promise<CleanupResult[]> {
    const context = this.activeContexts.get(runId);
    if (!context) {
      throw new CleanupError(`Test run context not found: ${runId}`, 'automation', 'cleanup');
    }

    const startTime = Date.now();
    let attempts = 0;
    let results: CleanupResult[] = [];

    while (attempts < (this.config.testConfig?.maxRetries || 3)) {
      try {
        results = await this.cleanupManager.executeCleanup(context.databases, options);
        
        const hasFailures = results.some(r => !r.success);
        if (!hasFailures || !this.config.testConfig?.retryFailedCleanup) {
          break;
        }

        attempts++;
        this.log('warn', `Cleanup attempt ${attempts} failed for run ${runId}, retrying...`);
        
        // Brief delay before retry
        await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
        
      } catch (error) {
        attempts++;
        if (attempts >= (this.config.testConfig?.maxRetries || 3)) {
          throw error;
        }
        this.log('warn', `Cleanup error on attempt ${attempts} for run ${runId}: ${error}`);
      }
    }

    const cleanupDuration = Date.now() - startTime;
    context.cleanupResults = results;
    context.metrics.cleanupDuration += cleanupDuration;

    this.log('info', `Cleanup completed for run ${runId} in ${cleanupDuration}ms`);
    return results;
  }

  /**
   * Execute verification for a specific test run
   */
  async executeTestVerification(
    runId: string,
    options?: CleanupOptions
  ): Promise<CleanupVerificationResult[]> {
    const context = this.activeContexts.get(runId);
    if (!context) {
      throw new CleanupError(`Test run context not found: ${runId}`, 'automation', 'verification');
    }

    const startTime = Date.now();
    const results = await this.cleanupManager.verifyCleanup(context.databases, options);
    const verificationDuration = Date.now() - startTime;

    context.verificationResults = results;
    context.metrics.verificationDuration += verificationDuration;

    this.log('info', `Verification completed for run ${runId} in ${verificationDuration}ms`);
    return results;
  }

  /**
   * Complete a test run and update metrics
   */
  completeTestRun(
    runId: string,
    testResults: { passed: number; failed: number; total: number }
  ): TestRunContext {
    const context = this.activeContexts.get(runId);
    if (!context) {
      throw new CleanupError(`Test run context not found: ${runId}`, 'automation', 'completion');
    }

    // Update context metrics
    context.metrics.totalTests = testResults.total;
    context.metrics.passedTests = testResults.passed;
    context.metrics.failedTests = testResults.failed;

    // Update global metrics
    this.globalMetrics.totalRuns++;
    if (testResults.failed === 0 && context.errors.length === 0) {
      this.globalMetrics.successfulRuns++;
    } else {
      this.globalMetrics.failedRuns++;
    }

    // Update average times
    this.globalMetrics.averageCleanupTime = 
      (this.globalMetrics.averageCleanupTime * (this.globalMetrics.totalRuns - 1) + 
       context.metrics.cleanupDuration) / this.globalMetrics.totalRuns;

    this.globalMetrics.averageVerificationTime = 
      (this.globalMetrics.averageVerificationTime * (this.globalMetrics.totalRuns - 1) + 
       context.metrics.verificationDuration) / this.globalMetrics.totalRuns;

    // Generate report if enabled
    if (this.config.reporting?.enableDetailedReports) {
      this.generateTestRunReport(context);
    }

    this.log('info', `Test run completed: ${runId}`);
    return context;
  }

  /**
   * Get automation metrics and performance data
   */
  getAutomationMetrics() {
    return {
      global: { ...this.globalMetrics },
      active: this.activeContexts.size,
      performance: this.cleanupManager.getPerformanceReport(),
      contexts: Array.from(this.activeContexts.values()).map(ctx => ({
        runId: ctx.runId,
        testSuite: ctx.testSuite,
        duration: Date.now() - ctx.startTime,
        metrics: ctx.metrics,
        hasErrors: ctx.errors.length > 0,
      })),
    };
  }

  /**
   * Cleanup automation resources
   */
  async cleanup(): Promise<void> {
    try {
      // Complete any active contexts
      for (const [runId, context] of Array.from(this.activeContexts.entries())) {
        this.log('warn', `Force completing active test run: ${runId}`);
        this.completeTestRun(runId, {
          total: context.metrics.totalTests,
          passed: context.metrics.passedTests,
          failed: context.metrics.failedTests,
        });
      }

      // Clear active contexts
      this.activeContexts.clear();

      // Final cleanup
      const databases = Object.keys(this.config.connections);
      await this.cleanupManager.executeCleanup(databases);

      this.log('info', 'Test automation cleanup completed');
    } catch (error) {
      this.log('error', `Test automation cleanup failed: ${error}`);
      throw error;
    }
  }

  /**
   * Export automation metrics and reports
   */
  async exportReports(directory?: string): Promise<void> {
    if (!this.config.reporting?.exportReports) {
      return;
    }

    const reportDir = directory || this.config.reporting?.reportDirectory || './test-reports';
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    try {
      const fs = await import('fs');
      const path = await import('path');

      // Ensure directory exists
      await fs.promises.mkdir(reportDir, { recursive: true });

      // Export metrics
      const metricsReport = {
        timestamp,
        globalMetrics: this.globalMetrics,
        performance: this.cleanupManager.getPerformanceReport(),
        activeContexts: Array.from(this.activeContexts.values()),
      };

      const metricsPath = path.join(reportDir, `automation-metrics-${timestamp}.json`);
      await fs.promises.writeFile(
        metricsPath,
        JSON.stringify(metricsReport, null, 2),
        'utf8'
      );

      this.log('info', `Exported automation report to: ${metricsPath}`);
    } catch (error) {
      this.log('error', `Failed to export reports: ${error}`);
    }
  }

  private generateTestRunReport(context: TestRunContext): void {
    if (this.config.reporting?.logLevel === 'silent') {
      return;
    }

    const duration = Date.now() - context.startTime;
    const successRate = context.metrics.totalTests > 0 
      ? (context.metrics.passedTests / context.metrics.totalTests * 100).toFixed(1)
      : '0';

    this.log('info', `Test Run Report for ${context.runId}:`);
    this.log('info', `  Duration: ${duration}ms`);
    this.log('info', `  Tests: ${context.metrics.passedTests}/${context.metrics.totalTests} passed (${successRate}%)`);
    this.log('info', `  Cleanup: ${context.metrics.cleanupDuration}ms`);
    this.log('info', `  Verification: ${context.metrics.verificationDuration}ms`);
    this.log('info', `  Errors: ${context.errors.length}`);

    if (context.errors.length > 0) {
      this.log('error', `  Error details: ${context.errors.map(e => e.message).join(', ')}`);
    }
  }

  private log(level: string, message: string): void {
    const logLevel = this.config.reporting?.logLevel || 'info';
    const levels = ['silent', 'error', 'warn', 'info', 'debug'];
    
    if (levels.indexOf(level) <= levels.indexOf(logLevel)) {
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] [TestAutomation] ${message}`;
      
      switch (level) {
        case 'error':
          console.error(logMessage);
          break;
        case 'warn':
          console.warn(logMessage);
          break;
        case 'info':
          console.info(logMessage);
          break;
        case 'debug':
          console.debug(logMessage);
          break;
        default:
          console.log(logMessage);
      }
    }
  }
}

/**
 * Factory function to create and initialize test automation
 */
export async function createTestAutomation(
  config: TestAutomationConfig
): Promise<TestAutomationManager> {
  const manager = new TestAutomationManager(config);
  await manager.initialize();
  return manager;
}