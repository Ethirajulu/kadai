import {
  CleanupVerificationResult,
  CleanupIssue,
  CleanupOptions,
  CleanupError,
  CleanupConfiguration,
} from '../../types/cleanup';
import { DatabaseConnections } from '../../types/database';
import { PostgreSQLCleanup } from '../cleanup/postgresql-cleanup';
import { MongoDBCleanup } from '../cleanup/mongodb-cleanup';
import { RedisCleanup } from '../cleanup/redis-cleanup';
import { QdrantCleanup } from '../cleanup/qdrant-cleanup';

export interface VerificationReport {
  overallStatus: 'clean' | 'issues_found' | 'verification_failed';
  totalDatabases: number;
  cleanDatabases: number;
  databasesWithIssues: number;
  totalIssues: number;
  criticalIssues: number;
  warningIssues: number;
  infoIssues: number;
  verificationTime: number;
  detailedResults: CleanupVerificationResult[];
  recommendations: string[];
  summary: string;
}

export interface VerificationConfig {
  strictMode: boolean;
  checkConstraints: boolean;
  validateIndexes: boolean;
  checkSequences: boolean;
  verifyConnections: boolean;
  timeoutMs: number;
  includeSystemTables: boolean;
  deepScan: boolean;
  parallelVerification: boolean;
  customValidators: CustomValidator[];
}

export interface CustomValidator {
  name: string;
  database: string;
  validator: (connection: any) => Promise<CleanupIssue[]>;
}

export interface VerificationMetrics {
  verificationCount: number;
  averageVerificationTime: number;
  successRate: number;
  commonIssues: { [key: string]: number };
  databasePerformance: { [database: string]: number };
}

export class CleanupVerifier {
  private config: VerificationConfig;
  private connections: DatabaseConnections;
  private metrics: VerificationMetrics;
  private cleanupStrategies: Map<string, any> = new Map();

  constructor(
    connections: DatabaseConnections,
    config?: Partial<VerificationConfig>
  ) {
    this.connections = connections;
    this.config = {
      strictMode: false,
      checkConstraints: true,
      validateIndexes: true,
      checkSequences: true,
      verifyConnections: true,
      timeoutMs: 30000,
      includeSystemTables: false,
      deepScan: false,
      parallelVerification: true,
      customValidators: [],
      ...config,
    };

    this.metrics = {
      verificationCount: 0,
      averageVerificationTime: 0,
      successRate: 0,
      commonIssues: {},
      databasePerformance: {},
    };

    this.initializeStrategies();
  }

  private initializeStrategies(): void {
    if (this.connections.postgresql) {
      this.cleanupStrategies.set('postgresql', new PostgreSQLCleanup(this.connections.postgresql));
    }
    if (this.connections.mongodb) {
      this.cleanupStrategies.set('mongodb', new MongoDBCleanup(this.connections.mongodb));
    }
    if (this.connections.redis) {
      this.cleanupStrategies.set('redis', new RedisCleanup(this.connections.redis));
    }
    if (this.connections.qdrant) {
      this.cleanupStrategies.set('qdrant', new QdrantCleanup(this.connections.qdrant));
    }
  }

  /**
   * Perform comprehensive cleanup verification across all databases
   */
  async verifyCleanup(
    databases?: string[],
    options?: CleanupOptions
  ): Promise<VerificationReport> {
    const startTime = Date.now();
    const targetDatabases = databases || Array.from(this.cleanupStrategies.keys());
    const verificationOptions = { ...options };

    try {
      const results = await this.performVerification(targetDatabases, verificationOptions);
      const report = this.generateVerificationReport(results, startTime);
      
      this.updateMetrics(report);
      return report;
    } catch (error) {
      throw new CleanupError(
        `Verification failed: ${error}`,
        'verifier',
        'verify_cleanup',
        error as Error
      );
    }
  }

  private async performVerification(
    databases: string[],
    options: CleanupOptions
  ): Promise<CleanupVerificationResult[]> {
    const results: CleanupVerificationResult[] = [];

    if (this.config.parallelVerification) {
      // Parallel verification for better performance
      const verificationPromises = databases.map(async (database) => {
        return this.verifyDatabase(database, options);
      });

      const parallelResults = await Promise.allSettled(verificationPromises);
      
      parallelResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            isClean: false,
            database: databases[index],
            issues: [{
              type: 'verification_failed',
              severity: 'critical',
              location: `${databases[index]} verification`,
              description: `Verification failed: ${result.reason}`,
            }],
            verificationTime: 0,
            checkedItems: {},
          });
        }
      });
    } else {
      // Sequential verification
      for (const database of databases) {
        try {
          const result = await this.verifyDatabase(database, options);
          results.push(result);
        } catch (error) {
          results.push({
            isClean: false,
            database,
            issues: [{
              type: 'verification_failed',
              severity: 'critical',
              location: `${database} verification`,
              description: `Verification failed: ${error}`,
            }],
            verificationTime: 0,
            checkedItems: {},
          });
        }
      }
    }

    return results;
  }

  private async verifyDatabase(
    database: string,
    options: CleanupOptions
  ): Promise<CleanupVerificationResult> {
    const strategy = this.cleanupStrategies.get(database);
    if (!strategy) {
      throw new CleanupError(
        `No cleanup strategy found for database: ${database}`,
        database,
        'verification'
      );
    }

    const startTime = Date.now();
    
    try {
      // Get base verification from strategy
      const baseResult = await strategy.verify(options);
      
      // Enhance with additional verification checks
      const enhancedIssues = await this.performEnhancedVerification(database, baseResult);
      
      // Run custom validators if any
      const customIssues = await this.runCustomValidators(database);
      
      const allIssues = [...baseResult.issues, ...enhancedIssues, ...customIssues];
      
      return {
        ...baseResult,
        issues: allIssues,
        verificationTime: Date.now() - startTime,
        isClean: allIssues.filter(i => i.severity === 'critical' || i.severity === 'warning').length === 0,
      };
    } catch (error) {
      throw new CleanupError(
        `Database verification failed for ${database}: ${error}`,
        database,
        'verification',
        error as Error
      );
    }
  }

  private async performEnhancedVerification(
    database: string,
    baseResult: CleanupVerificationResult
  ): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = [];

    switch (database) {
      case 'postgresql':
        issues.push(...await this.verifyPostgreSQLEnhanced());
        break;
      case 'mongodb':
        issues.push(...await this.verifyMongoDBEnhanced());
        break;
      case 'redis':
        issues.push(...await this.verifyRedisEnhanced());
        break;
      case 'qdrant':
        issues.push(...await this.verifyQdrantEnhanced());
        break;
    }

    return issues;
  }

  private async verifyPostgreSQLEnhanced(): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = [];
    const connection = this.connections.postgresql;
    
    if (!connection?.pool) {
      return issues;
    }

    try {
      // Check for active connections
      const activeConnections = await connection.pool.query(
        'SELECT count(*) as count FROM pg_stat_activity WHERE state = $1',
        ['active']
      );
      
      if (activeConnections.rows[0].count > 1) {
        issues.push({
          type: 'connection_issue',
          severity: 'warning',
          location: 'postgresql connection pool',
          description: `${activeConnections.rows[0].count} active connections detected`,
          suggestion: 'Consider connection pooling optimization',
        });
      }

      // Check for locks
      const locks = await connection.pool.query(
        'SELECT count(*) as count FROM pg_locks WHERE NOT granted'
      );
      
      if (locks.rows[0].count > 0) {
        issues.push({
          type: 'performance_degradation',
          severity: 'warning',
          location: 'postgresql locks',
          description: `${locks.rows[0].count} ungranted locks detected`,
          suggestion: 'Check for long-running transactions',
        });
      }

      // Check sequence values if enabled
      if (this.config.checkSequences) {
        const sequences = await connection.pool.query(`
          SELECT schemaname, sequencename, last_value 
          FROM pg_sequences 
          WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
        `);
        
        sequences.rows.forEach(row => {
          if (row.last_value > 1) {
            issues.push({
              type: 'data_remaining',
              severity: 'info',
              location: `sequence: ${row.schemaname}.${row.sequencename}`,
              description: `Sequence ${row.sequencename} has value ${row.last_value}`,
              suggestion: 'Consider resetting sequence values after cleanup',
            });
          }
        });
      }

      // Check for foreign key constraints if enabled
      if (this.config.checkConstraints) {
        const constraints = await connection.pool.query(`
          SELECT conname, contype, conrelid::regclass as table_name
          FROM pg_constraint 
          WHERE contype = 'f' 
          AND connamespace NOT IN (
            SELECT oid FROM pg_namespace 
            WHERE nspname IN ('information_schema', 'pg_catalog')
          )
        `);
        
        if (constraints.rows.length > 0) {
          issues.push({
            type: 'schema_modified',
            severity: 'info',
            location: 'postgresql constraints',
            description: `${constraints.rows.length} foreign key constraints detected`,
            suggestion: 'Verify constraint integrity after cleanup',
          });
        }
      }

    } catch (error) {
      issues.push({
        type: 'verification_failed',
        severity: 'warning',
        location: 'postgresql enhanced verification',
        description: `Enhanced verification failed: ${error}`,
      });
    }

    return issues;
  }

  private async verifyMongoDBEnhanced(): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = [];
    const connection = this.connections.mongodb;
    
    if (!connection?.database) {
      return issues;
    }

    try {
      // Check database stats
      const stats = await connection.database.stats();
      
      if (stats.dataSize > 1024 * 1024) { // 1MB threshold
        issues.push({
          type: 'data_remaining',
          severity: 'warning',
          location: 'mongodb database size',
          description: `Database size is ${Math.round(stats.dataSize / 1024 / 1024)}MB`,
          suggestion: 'Consider running compact or cleanup operations',
        });
      }

      // Check for active operations
      const currentOps = await connection.database.admin().command({ currentOp: true });
      const activeOps = currentOps.inprog?.filter((op: any) => op.active) || [];
      
      if (activeOps.length > 0) {
        issues.push({
          type: 'performance_degradation',
          severity: 'warning',
          location: 'mongodb operations',
          description: `${activeOps.length} active operations detected`,
          suggestion: 'Monitor for long-running operations',
        });
      }

      // Check indexes if enabled
      if (this.config.validateIndexes) {
        const collections = await connection.database.listCollections().toArray();
        
        for (const collection of collections) {
          const indexes = await connection.database.collection(collection.name).listIndexes().toArray();
          
          if (indexes.length > 10) {
            issues.push({
              type: 'performance_degradation',
              severity: 'info',
              location: `collection: ${collection.name}`,
              description: `Collection has ${indexes.length} indexes`,
              suggestion: 'Consider index optimization',
            });
          }
        }
      }

    } catch (error) {
      issues.push({
        type: 'verification_failed',
        severity: 'warning',
        location: 'mongodb enhanced verification',
        description: `Enhanced verification failed: ${error}`,
      });
    }

    return issues;
  }

  private async verifyRedisEnhanced(): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = [];
    const connection = this.connections.redis;
    
    if (!connection?.client) {
      return issues;
    }

    try {
      // Check memory usage
      const info = await connection.client.info('memory');
      const memoryInfo = this.parseRedisInfo(info);
      
      const usedMemory = parseInt(memoryInfo.used_memory || '0');
      const maxMemory = parseInt(memoryInfo.maxmemory || '0');
      
      if (maxMemory > 0 && usedMemory > maxMemory * 0.8) {
        issues.push({
          type: 'performance_degradation',
          severity: 'warning',
          location: 'redis memory usage',
          description: `Memory usage is ${Math.round((usedMemory / maxMemory) * 100)}%`,
          suggestion: 'Consider memory optimization or cleanup',
        });
      }

      // Check for expired keys
      const expiredKeys = await connection.client.info('stats');
      const statsInfo = this.parseRedisInfo(expiredKeys);
      
      if (statsInfo.expired_keys && parseInt(statsInfo.expired_keys) > 1000) {
        issues.push({
          type: 'data_remaining',
          severity: 'info',
          location: 'redis expired keys',
          description: `${statsInfo.expired_keys} expired keys detected`,
          suggestion: 'Consider running key cleanup',
        });
      }

      // Check keyspace
      const keyspaceInfo = await connection.client.info('keyspace');
      const keyspaceData = this.parseRedisInfo(keyspaceInfo);
      
      Object.keys(keyspaceData).forEach(db => {
        if (db.startsWith('db') && keyspaceData[db]) {
          const dbInfo = keyspaceData[db];
          const keys = dbInfo.match(/keys=(\d+)/)?.[1];
          
          if (keys && parseInt(keys) > 100) {
            issues.push({
              type: 'data_remaining',
              severity: 'info',
              location: `redis ${db}`,
              description: `Database ${db} contains ${keys} keys`,
              suggestion: 'Verify keys are properly cleaned up',
            });
          }
        }
      });

    } catch (error) {
      issues.push({
        type: 'verification_failed',
        severity: 'warning',
        location: 'redis enhanced verification',
        description: `Enhanced verification failed: ${error}`,
      });
    }

    return issues;
  }

  private async verifyQdrantEnhanced(): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = [];
    const connection = this.connections.qdrant;
    
    if (!connection?.client) {
      return issues;
    }

    try {
      // Check cluster health if available
      try {
        // Note: cluster health check might not be available in all Qdrant versions
        // This is optional and mainly for enterprise/clustered deployments
      } catch (error) {
        // Cluster info might not be available in single-node setups
      }

      // Check collection metrics
      const collections = await connection.client.getCollections();
      
      for (const collection of collections.collections || []) {
        const collectionInfo = await connection.client.getCollection(collection.name);
        
        // Check for large collections
        if (collectionInfo.points_count && collectionInfo.points_count > 10000) {
          issues.push({
            type: 'performance_degradation',
            severity: 'info',
            location: `qdrant collection: ${collection.name}`,
            description: `Large collection with ${collectionInfo.points_count} points`,
            suggestion: 'Consider collection optimization',
          });
        }

        // Check vector dimensions consistency
        if (collectionInfo.config?.params?.vectors) {
          const vectorConfigs = collectionInfo.config.params.vectors;
          if (typeof vectorConfigs === 'object' && vectorConfigs !== null) {
            Object.keys(vectorConfigs).forEach(vectorName => {
              const vectorConfig = (vectorConfigs as any)[vectorName];
              if (vectorConfig?.size && vectorConfig.size > 2048) {
                issues.push({
                  type: 'performance_degradation',
                  severity: 'info',
                  location: `qdrant vector: ${collection.name}.${vectorName}`,
                  description: `High-dimensional vectors (${vectorConfig.size} dimensions)`,
                  suggestion: 'Consider dimension reduction if possible',
                });
              }
            });
          }
        }
      }

    } catch (error) {
      issues.push({
        type: 'verification_failed',
        severity: 'warning',
        location: 'qdrant enhanced verification',
        description: `Enhanced verification failed: ${error}`,
      });
    }

    return issues;
  }

  private async runCustomValidators(database: string): Promise<CleanupIssue[]> {
    const issues: CleanupIssue[] = [];
    const connection = this.connections[database as keyof DatabaseConnections];
    
    if (!connection) {
      return issues;
    }

    const validators = this.config.customValidators.filter(v => v.database === database);
    
    for (const validator of validators) {
      try {
        const validatorIssues = await validator.validator(connection);
        issues.push(...validatorIssues);
      } catch (error) {
        issues.push({
          type: 'verification_failed',
          severity: 'warning',
          location: `custom validator: ${validator.name}`,
          description: `Custom validator failed: ${error}`,
        });
      }
    }

    return issues;
  }

  private parseRedisInfo(info: string): { [key: string]: string } {
    const result: { [key: string]: string } = {};
    
    info.split('\n').forEach(line => {
      const [key, value] = line.split(':');
      if (key && value) {
        result[key] = value.trim();
      }
    });

    return result;
  }

  private generateVerificationReport(
    results: CleanupVerificationResult[],
    startTime: number
  ): VerificationReport {
    const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
    const criticalIssues = results.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'critical').length, 0
    );
    const warningIssues = results.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'warning').length, 0
    );
    const infoIssues = results.reduce((sum, r) => 
      sum + r.issues.filter(i => i.severity === 'info').length, 0
    );

    const cleanDatabases = results.filter(r => r.isClean).length;
    const databasesWithIssues = results.length - cleanDatabases;

    const overallStatus = criticalIssues > 0 ? 'issues_found' : 
                         warningIssues > 0 ? 'issues_found' : 'clean';

    const recommendations = this.generateRecommendations(results);
    const summary = this.generateSummary(results, totalIssues, criticalIssues, warningIssues);

    return {
      overallStatus,
      totalDatabases: results.length,
      cleanDatabases,
      databasesWithIssues,
      totalIssues,
      criticalIssues,
      warningIssues,
      infoIssues,
      verificationTime: Date.now() - startTime,
      detailedResults: results,
      recommendations,
      summary,
    };
  }

  private generateRecommendations(results: CleanupVerificationResult[]): string[] {
    const recommendations: string[] = [];
    const issueTypes = new Set<string>();

    results.forEach(result => {
      result.issues.forEach(issue => issueTypes.add(issue.type));
    });

    if (issueTypes.has('data_remaining')) {
      recommendations.push('Run additional cleanup operations to remove remaining data');
    }

    if (issueTypes.has('performance_degradation')) {
      recommendations.push('Optimize database performance by addressing identified bottlenecks');
    }

    if (issueTypes.has('connection_issue')) {
      recommendations.push('Review database connection configurations and pooling settings');
    }

    if (issueTypes.has('schema_modified')) {
      recommendations.push('Verify database schema integrity and constraints');
    }

    if (recommendations.length === 0) {
      recommendations.push('All databases appear to be clean and properly configured');
    }

    return recommendations;
  }

  private generateSummary(
    results: CleanupVerificationResult[],
    totalIssues: number,
    criticalIssues: number,
    warningIssues: number
  ): string {
    const cleanDatabases = results.filter(r => r.isClean).length;
    const totalDatabases = results.length;

    if (totalIssues === 0) {
      return `All ${totalDatabases} databases are clean and verified successfully.`;
    }

    let summary = `Verified ${totalDatabases} databases. `;
    
    if (cleanDatabases > 0) {
      summary += `${cleanDatabases} databases are clean. `;
    }

    if (criticalIssues > 0) {
      summary += `Found ${criticalIssues} critical issues requiring immediate attention. `;
    }

    if (warningIssues > 0) {
      summary += `Found ${warningIssues} warnings that should be addressed. `;
    }

    return summary.trim();
  }

  private updateMetrics(report: VerificationReport): void {
    this.metrics.verificationCount++;
    
    // Update average verification time
    this.metrics.averageVerificationTime = 
      (this.metrics.averageVerificationTime * (this.metrics.verificationCount - 1) + report.verificationTime) / 
      this.metrics.verificationCount;

    // Update success rate
    const isSuccess = report.overallStatus === 'clean';
    this.metrics.successRate = 
      (this.metrics.successRate * (this.metrics.verificationCount - 1) + (isSuccess ? 1 : 0)) / 
      this.metrics.verificationCount;

    // Update common issues
    report.detailedResults.forEach(result => {
      result.issues.forEach(issue => {
        this.metrics.commonIssues[issue.type] = (this.metrics.commonIssues[issue.type] || 0) + 1;
      });

      // Update database performance
      this.metrics.databasePerformance[result.database] = 
        (this.metrics.databasePerformance[result.database] || 0) + result.verificationTime;
    });
  }

  /**
   * Get verification metrics
   */
  getMetrics(): VerificationMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset verification metrics
   */
  resetMetrics(): void {
    this.metrics = {
      verificationCount: 0,
      averageVerificationTime: 0,
      successRate: 0,
      commonIssues: {},
      databasePerformance: {},
    };
  }

  /**
   * Add custom validator
   */
  addCustomValidator(validator: CustomValidator): void {
    this.config.customValidators.push(validator);
  }

  /**
   * Remove custom validator
   */
  removeCustomValidator(name: string): void {
    this.config.customValidators = this.config.customValidators.filter(v => v.name !== name);
  }
}