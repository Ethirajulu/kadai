import { TestDatabaseConfig } from '../../types/database';
import { CleanupOptions } from '../../types/cleanup';

export interface TestEnvironmentConfig {
  name: string;
  description: string;
  databases: TestDatabaseConfig;
  cleanup: CleanupOptions;
  performance: {
    timeouts: {
      connection: number;
      query: number;
      cleanup: number;
    };
    pooling: {
      min: number;
      max: number;
      idle: number;
    };
  };
  debugging: {
    enabled: boolean;
    logLevel: 'silent' | 'error' | 'warn' | 'info' | 'debug';
    exportReports: boolean;
    reportDirectory: string;
  };
  isolation: {
    enabled: boolean;
    useTransactions: boolean;
    separateProcesses: boolean;
  };
}

export class TestConfigurationManager {
  private static instance: TestConfigurationManager;
  private environments: Map<string, TestEnvironmentConfig> = new Map();
  private currentEnvironment = 'development';

  private constructor() {
    this.initializeDefaultEnvironments();
  }

  static getInstance(): TestConfigurationManager {
    if (!TestConfigurationManager.instance) {
      TestConfigurationManager.instance = new TestConfigurationManager();
    }
    return TestConfigurationManager.instance;
  }

  private initializeDefaultEnvironments(): void {
    // Development environment
    this.environments.set('development', {
      name: 'development',
      description: 'Local development environment with full debugging',
      databases: {
        postgresql: {
          host: process.env.TEST_POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
          database: process.env.TEST_POSTGRES_DB || 'test_dev',
          username: process.env.TEST_POSTGRES_USER || 'postgres',
          password: process.env.TEST_POSTGRES_PASSWORD || 'password',
          testDatabaseSuffix: '_test_dev',
          poolSize: 5,
          connectionTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
        },
        mongodb: {
          host: process.env.TEST_MONGODB_HOST || 'localhost',
          port: parseInt(process.env.TEST_MONGODB_PORT || '27017'),
          database: process.env.TEST_MONGODB_DB || 'test_dev',
          testDatabaseSuffix: '_test_dev',
          timeout: 5000,
          maxPoolSize: 10,
          minPoolSize: 2,
          serverSelectionTimeoutMS: 5000,
        },
        redis: {
          host: process.env.TEST_REDIS_HOST || 'localhost',
          port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
          db: parseInt(process.env.TEST_REDIS_DB || '1'),
          testKeyPrefix: 'test_dev:',
          keyPrefix: 'app:',
          lazyConnect: true,
          keepAlive: 30000,
          family: 4,
        },
        qdrant: {
          host: process.env.TEST_QDRANT_HOST || 'localhost',
          port: parseInt(process.env.TEST_QDRANT_PORT || '6333'),
          testCollectionPrefix: 'test_dev_',
          timeout: 5000,
        },
        isolation: {
          useTransactions: true,
          cleanupAfterEach: true,
          resetSequences: true,
        },
      },
      cleanup: {
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
      performance: {
        timeouts: {
          connection: 5000,
          query: 10000,
          cleanup: 30000,
        },
        pooling: {
          min: 2,
          max: 10,
          idle: 30000,
        },
      },
      debugging: {
        enabled: true,
        logLevel: 'info',
        exportReports: true,
        reportDirectory: './debug-reports',
      },
      isolation: {
        enabled: true,
        useTransactions: true,
        separateProcesses: false,
      },
    });

    // Test environment
    this.environments.set('test', {
      name: 'test',
      description: 'Automated testing environment optimized for speed',
      databases: {
        postgresql: {
          host: process.env.TEST_POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
          database: process.env.TEST_POSTGRES_DB || 'test_auto',
          username: process.env.TEST_POSTGRES_USER || 'postgres',
          password: process.env.TEST_POSTGRES_PASSWORD || 'password',
          testDatabaseSuffix: '_test_auto',
          poolSize: 3,
          connectionTimeoutMillis: 3000,
          idleTimeoutMillis: 10000,
        },
        mongodb: {
          host: process.env.TEST_MONGODB_HOST || 'localhost',
          port: parseInt(process.env.TEST_MONGODB_PORT || '27017'),
          database: process.env.TEST_MONGODB_DB || 'test_auto',
          testDatabaseSuffix: '_test_auto',
          timeout: 3000,
          maxPoolSize: 5,
          minPoolSize: 1,
          serverSelectionTimeoutMS: 3000,
        },
        redis: {
          host: process.env.TEST_REDIS_HOST || 'localhost',
          port: parseInt(process.env.TEST_REDIS_PORT || '6379'),
          db: parseInt(process.env.TEST_REDIS_DB || '2'),
          testKeyPrefix: 'test_auto:',
          keyPrefix: 'app:',
          lazyConnect: true,
          keepAlive: 10000,
          family: 4,
        },
        qdrant: {
          host: process.env.TEST_QDRANT_HOST || 'localhost',
          port: parseInt(process.env.TEST_QDRANT_PORT || '6333'),
          testCollectionPrefix: 'test_auto_',
          timeout: 3000,
        },
        isolation: {
          useTransactions: true,
          cleanupAfterEach: true,
          resetSequences: true,
        },
      },
      cleanup: {
        verifyCleanup: false,
        performanceMonitoring: false,
        isolateTransactions: true,
        preserveSchema: true,
        resetSequences: true,
        timeoutMs: 15000,
        batchSize: 2000,
        parallelization: true,
        logLevel: 'warn',
        retryAttempts: 2,
        retryDelayMs: 500,
      },
      performance: {
        timeouts: {
          connection: 3000,
          query: 5000,
          cleanup: 15000,
        },
        pooling: {
          min: 1,
          max: 5,
          idle: 10000,
        },
      },
      debugging: {
        enabled: false,
        logLevel: 'warn',
        exportReports: false,
        reportDirectory: './test-reports',
      },
      isolation: {
        enabled: true,
        useTransactions: true,
        separateProcesses: false,
      },
    });

    // CI environment
    this.environments.set('ci', {
      name: 'ci',
      description: 'CI/CD environment with minimal logging and fast execution',
      databases: {
        postgresql: {
          host: process.env.CI_POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.CI_POSTGRES_PORT || '5432'),
          database: process.env.CI_POSTGRES_DB || 'test_ci',
          username: process.env.CI_POSTGRES_USER || 'postgres',
          password: process.env.CI_POSTGRES_PASSWORD || 'password',
          testDatabaseSuffix: '_ci',
          poolSize: 2,
          connectionTimeoutMillis: 2000,
          idleTimeoutMillis: 5000,
        },
        mongodb: {
          host: process.env.CI_MONGODB_HOST || 'localhost',
          port: parseInt(process.env.CI_MONGODB_PORT || '27017'),
          database: process.env.CI_MONGODB_DB || 'test_ci',
          testDatabaseSuffix: '_ci',
          timeout: 2000,
          maxPoolSize: 3,
          minPoolSize: 1,
          serverSelectionTimeoutMS: 2000,
        },
        redis: {
          host: process.env.CI_REDIS_HOST || 'localhost',
          port: parseInt(process.env.CI_REDIS_PORT || '6379'),
          db: parseInt(process.env.CI_REDIS_DB || '3'),
          testKeyPrefix: 'ci:',
          keyPrefix: 'app:',
          lazyConnect: true,
          keepAlive: 5000,
          family: 4,
        },
        qdrant: {
          host: process.env.CI_QDRANT_HOST || 'localhost',
          port: parseInt(process.env.CI_QDRANT_PORT || '6333'),
          testCollectionPrefix: 'ci_',
          timeout: 2000,
        },
        isolation: {
          useTransactions: true,
          cleanupAfterEach: true,
          resetSequences: true,
        },
      },
      cleanup: {
        verifyCleanup: false,
        performanceMonitoring: false,
        isolateTransactions: true,
        preserveSchema: true,
        resetSequences: true,
        timeoutMs: 10000,
        batchSize: 3000,
        parallelization: true,
        logLevel: 'error',
        retryAttempts: 1,
        retryDelayMs: 200,
      },
      performance: {
        timeouts: {
          connection: 2000,
          query: 3000,
          cleanup: 10000,
        },
        pooling: {
          min: 1,
          max: 3,
          idle: 5000,
        },
      },
      debugging: {
        enabled: false,
        logLevel: 'error',
        exportReports: false,
        reportDirectory: './ci-reports',
      },
      isolation: {
        enabled: true,
        useTransactions: true,
        separateProcesses: false,
      },
    });

    // Performance testing environment
    this.environments.set('performance', {
      name: 'performance',
      description: 'Performance testing environment with optimized settings',
      databases: {
        postgresql: {
          host: process.env.PERF_POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.PERF_POSTGRES_PORT || '5432'),
          database: process.env.PERF_POSTGRES_DB || 'test_perf',
          username: process.env.PERF_POSTGRES_USER || 'postgres',
          password: process.env.PERF_POSTGRES_PASSWORD || 'password',
          testDatabaseSuffix: '_perf',
          poolSize: 20,
          connectionTimeoutMillis: 1000,
          idleTimeoutMillis: 60000,
        },
        mongodb: {
          host: process.env.PERF_MONGODB_HOST || 'localhost',
          port: parseInt(process.env.PERF_MONGODB_PORT || '27017'),
          database: process.env.PERF_MONGODB_DB || 'test_perf',
          testDatabaseSuffix: '_perf',
          timeout: 1000,
          maxPoolSize: 50,
          minPoolSize: 10,
          serverSelectionTimeoutMS: 1000,
        },
        redis: {
          host: process.env.PERF_REDIS_HOST || 'localhost',
          port: parseInt(process.env.PERF_REDIS_PORT || '6379'),
          db: parseInt(process.env.PERF_REDIS_DB || '4'),
          testKeyPrefix: 'perf:',
          keyPrefix: 'app:',
          lazyConnect: false,
          keepAlive: 60000,
          family: 4,
        },
        qdrant: {
          host: process.env.PERF_QDRANT_HOST || 'localhost',
          port: parseInt(process.env.PERF_QDRANT_PORT || '6333'),
          testCollectionPrefix: 'perf_',
          timeout: 1000,
        },
        isolation: {
          useTransactions: false,
          cleanupAfterEach: false,
          resetSequences: false,
        },
      },
      cleanup: {
        verifyCleanup: false,
        performanceMonitoring: true,
        isolateTransactions: false,
        preserveSchema: true,
        resetSequences: false,
        timeoutMs: 60000,
        batchSize: 10000,
        parallelization: true,
        logLevel: 'warn',
        retryAttempts: 1,
        retryDelayMs: 100,
      },
      performance: {
        timeouts: {
          connection: 1000,
          query: 2000,
          cleanup: 60000,
        },
        pooling: {
          min: 10,
          max: 50,
          idle: 60000,
        },
      },
      debugging: {
        enabled: true,
        logLevel: 'warn',
        exportReports: true,
        reportDirectory: './perf-reports',
      },
      isolation: {
        enabled: false,
        useTransactions: false,
        separateProcesses: true,
      },
    });

    // Set default environment based on NODE_ENV
    const nodeEnv = process.env.NODE_ENV || 'development';
    if (this.environments.has(nodeEnv)) {
      this.currentEnvironment = nodeEnv;
    }
  }

  /**
   * Get configuration for specific environment
   */
  getEnvironmentConfig(environment?: string): TestEnvironmentConfig {
    const env = environment || this.currentEnvironment;
    const config = this.environments.get(env);
    
    if (!config) {
      throw new Error(`Environment configuration not found: ${env}`);
    }
    
    return config;
  }

  /**
   * Set current environment
   */
  setCurrentEnvironment(environment: string): void {
    if (!this.environments.has(environment)) {
      throw new Error(`Environment not found: ${environment}`);
    }
    this.currentEnvironment = environment;
  }

  /**
   * Get current environment name
   */
  getCurrentEnvironment(): string {
    return this.currentEnvironment;
  }

  /**
   * Get all available environments
   */
  getAvailableEnvironments(): string[] {
    return Array.from(this.environments.keys());
  }

  /**
   * Add custom environment configuration
   */
  addEnvironmentConfig(name: string, config: TestEnvironmentConfig): void {
    this.environments.set(name, config);
  }

  /**
   * Update existing environment configuration
   */
  updateEnvironmentConfig(name: string, updates: Partial<TestEnvironmentConfig>): void {
    const existing = this.environments.get(name);
    if (!existing) {
      throw new Error(`Environment not found: ${name}`);
    }
    
    this.environments.set(name, { ...existing, ...updates });
  }

  /**
   * Remove environment configuration
   */
  removeEnvironmentConfig(name: string): void {
    if (name === this.currentEnvironment) {
      throw new Error('Cannot remove current environment');
    }
    this.environments.delete(name);
  }

  /**
   * Get database configuration for current environment
   */
  getDatabaseConfig(): TestDatabaseConfig {
    return this.getEnvironmentConfig().databases;
  }

  /**
   * Get cleanup configuration for current environment
   */
  getCleanupConfig(): CleanupOptions {
    return this.getEnvironmentConfig().cleanup;
  }

  /**
   * Validate environment configuration
   */
  validateEnvironmentConfig(config: TestEnvironmentConfig): string[] {
    const errors: string[] = [];

    // Validate database configurations
    if (config.databases.postgresql) {
      if (!config.databases.postgresql.host) errors.push('PostgreSQL host is required');
      if (!config.databases.postgresql.database) errors.push('PostgreSQL database is required');
      if (!config.databases.postgresql.username) errors.push('PostgreSQL username is required');
    }

    if (config.databases.mongodb) {
      if (!config.databases.mongodb.host) errors.push('MongoDB host is required');
      if (!config.databases.mongodb.database) errors.push('MongoDB database is required');
    }

    if (config.databases.redis) {
      if (!config.databases.redis.host) errors.push('Redis host is required');
    }

    if (config.databases.qdrant) {
      if (!config.databases.qdrant.host) errors.push('Qdrant host is required');
    }

    // Validate performance settings
    if (config.performance.timeouts.connection <= 0) {
      errors.push('Connection timeout must be positive');
    }

    if (config.performance.pooling.min > config.performance.pooling.max) {
      errors.push('Minimum pool size cannot be greater than maximum');
    }

    return errors;
  }

  /**
   * Export environment configuration
   */
  exportEnvironmentConfig(environment?: string): string {
    const config = this.getEnvironmentConfig(environment);
    return JSON.stringify(config, null, 2);
  }

  /**
   * Import environment configuration
   */
  importEnvironmentConfig(name: string, configJson: string): void {
    try {
      const config = JSON.parse(configJson) as TestEnvironmentConfig;
      const errors = this.validateEnvironmentConfig(config);
      
      if (errors.length > 0) {
        throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
      }
      
      this.addEnvironmentConfig(name, config);
    } catch (error) {
      throw new Error(`Failed to import configuration: ${error}`);
    }
  }

  /**
   * Create environment-specific Jest configuration
   */
  createJestConfig(environment?: string): any {
    const config = this.getEnvironmentConfig(environment);
    
    return {
      testEnvironment: 'node',
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      testTimeout: Math.max(
        config.performance.timeouts.connection,
        config.performance.timeouts.query,
        config.performance.timeouts.cleanup
      ) + 10000, // Add 10s buffer
      maxWorkers: config.isolation.separateProcesses ? 1 : '50%',
      testSequencer: '@jest/test-sequencer',
      collectCoverage: environment === 'development',
      collectCoverageFrom: [
        'src/**/*.ts',
        '!src/**/*.spec.ts',
        '!src/**/*.test.ts',
      ],
      coverageDirectory: `coverage/${environment}`,
      coverageReporters: ['text', 'lcov', 'html'],
      verbose: config.debugging.enabled,
      silent: config.debugging.logLevel === 'silent',
      errorOnDeprecated: true,
      detectOpenHandles: true,
      forceExit: environment === 'ci',
      globals: {
        TEST_ENVIRONMENT: environment || this.currentEnvironment,
        TEST_CONFIG: config,
      },
    };
  }

  /**
   * Reset to default configurations
   */
  resetToDefaults(): void {
    this.environments.clear();
    this.currentEnvironment = 'development';
    this.initializeDefaultEnvironments();
  }
}

/**
 * Helper functions for common configuration tasks
 */
export class ConfigUtils {
  /**
   * Get configuration manager instance
   */
  static getConfigManager(): TestConfigurationManager {
    return TestConfigurationManager.getInstance();
  }

  /**
   * Get current environment configuration
   */
  static getCurrentConfig(): TestEnvironmentConfig {
    return TestConfigurationManager.getInstance().getEnvironmentConfig();
  }

  /**
   * Switch to specific environment
   */
  static switchEnvironment(environment: string): void {
    TestConfigurationManager.getInstance().setCurrentEnvironment(environment);
  }

  /**
   * Create Jest configuration for current environment
   */
  static createJestConfig(): any {
    return TestConfigurationManager.getInstance().createJestConfig();
  }

  /**
   * Get database configuration for current environment
   */
  static getDatabaseConfig(): TestDatabaseConfig {
    return TestConfigurationManager.getInstance().getDatabaseConfig();
  }

  /**
   * Get cleanup configuration for current environment
   */
  static getCleanupConfig(): CleanupOptions {
    return TestConfigurationManager.getInstance().getCleanupConfig();
  }

  /**
   * Validate current environment configuration
   */
  static validateCurrentConfig(): string[] {
    const manager = TestConfigurationManager.getInstance();
    const config = manager.getEnvironmentConfig();
    return manager.validateEnvironmentConfig(config);
  }
}

/**
 * Environment detection utility
 */
export function detectEnvironment(): string {
  if (process.env.CI) return 'ci';
  if (process.env.NODE_ENV === 'test') return 'test';
  if (process.env.NODE_ENV === 'production') return 'production';
  return 'development';
}

/**
 * Auto-configure based on environment
 */
export function autoConfigureEnvironment(): void {
  const environment = detectEnvironment();
  ConfigUtils.switchEnvironment(environment);
}