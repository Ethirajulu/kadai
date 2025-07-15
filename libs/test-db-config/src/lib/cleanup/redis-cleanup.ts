import {
  RedisCleanupStrategy,
  CleanupResult,
  CleanupOptions,
  CleanupVerificationResult,
  CleanupPerformanceMetrics,
  CleanupIssue,
  CleanupError,
} from '../../types/cleanup';
import { RedisConnection } from '../../types/database';

export class RedisCleanup implements RedisCleanupStrategy {
  public readonly database = 'redis' as const;
  private performanceMetrics: CleanupPerformanceMetrics | null = null;

  constructor(private connection: RedisConnection) {}

  async cleanup(options?: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    const connectionStartTime = Date.now();

    const mergedOptions = {
      batchSize: 1000,
      retryAttempts: 3,
      ...options,
    };

    let recordsRemoved = 0;
    const keysAffected: string[] = [];
    const errors: Error[] = [];
    const warnings: string[] = [];

    try {
      const connectionTime = Date.now() - connectionStartTime;
      const queryStartTime = Date.now();

      // Default patterns to clean (test-related keys)
      const defaultPatterns = [
        'test:*',
        'session:*',
        'cache:*',
        'temp:*',
        '*:test',
        'product:*',
        'user:*',
        'order:*',
        'rate_limit:*',
        'api:*',
        'search:*'
      ];

      // Clean keys by pattern
      for (const pattern of defaultPatterns) {
        try {
          const keys = await this.connection.client.keys(pattern);
          
          if (keys.length > 0) {
            if (keys.length > mergedOptions.batchSize!) {
              // Use batched deletion for large key sets
              const deleted = await this.batchedDelete(keys, mergedOptions.batchSize!);
              recordsRemoved += deleted;
            } else {
              // Delete all keys at once for smaller sets
              await this.connection.client.del(...keys);
              recordsRemoved += keys.length;
            }
            
            keysAffected.push(...keys);
          }
        } catch (error) {
          const cleanupError = new CleanupError(
            `Failed to clean keys with pattern ${pattern}: ${error}`,
            this.database,
            `cleanup_pattern_${pattern}`,
            error as Error
          );
          errors.push(cleanupError);
        }
      }

      // Clean expired keys
      try {
        const expiredCount = await this.clearExpiredKeysInternal();
        if (expiredCount > 0) {
          warnings.push(`Cleared ${expiredCount} expired keys`);
        }
      } catch (error) {
        warnings.push(`Failed to clear expired keys: ${error}`);
      }

      const queryExecutionTime = Date.now() - queryStartTime;
      const totalDuration = Date.now() - startTime;

      // Calculate performance metrics
      this.performanceMetrics = {
        connectionTime,
        queryExecutionTime,
        totalCleanupTime: totalDuration,
        memoryUsed: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user,
        operationsPerSecond: recordsRemoved / (totalDuration / 1000) || 0,
        peakMemoryUsage: process.memoryUsage().heapUsed,
      };

      return {
        success: errors.length === 0,
        database: this.database,
        duration: totalDuration,
        recordsRemoved,
        keysAffected: keysAffected.slice(0, 100), // Limit to first 100 for brevity
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        performanceMetrics: this.performanceMetrics,
      };

    } catch (error) {
      const cleanupError = new CleanupError(
        `Redis cleanup failed: ${error}`,
        this.database,
        'cleanup',
        error as Error
      );
      
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        keysAffected,
        errors: [cleanupError],
      };
    }
  }

  async verify(options?: CleanupOptions): Promise<CleanupVerificationResult> {
    const startTime = Date.now();
    const issues: CleanupIssue[] = [];
    let checkedKeys = 0;

    try {
      // Check for remaining test-related keys
      const testPatterns = [
        'test:*',
        'session:*',
        'cache:*',
        'temp:*',
        '*:test'
      ];

      for (const pattern of testPatterns) {
        const keys = await this.connection.client.keys(pattern);
        checkedKeys += keys.length;

        if (keys.length > 0) {
          issues.push({
            type: 'data_remaining',
            severity: 'warning',
            location: `keys matching pattern: ${pattern}`,
            description: `Found ${keys.length} keys matching pattern ${pattern}`,
            suggestion: 'Run cleanup again or check key expiration settings',
          });
        }
      }

      // Check Redis memory usage
      const info = await this.connection.client.info('memory');
      const memoryLines = info.split('\r\n');
      const usedMemoryLine = memoryLines.find(line => line.startsWith('used_memory:'));
      
      if (usedMemoryLine) {
        const usedMemory = parseInt(usedMemoryLine.split(':')[1]);
        const usedMemoryMB = usedMemory / 1024 / 1024;
        
        if (usedMemoryMB > 100) { // More than 100MB
          issues.push({
            type: 'performance_degradation',
            severity: 'info',
            location: 'redis memory',
            description: `Redis memory usage is ${usedMemoryMB.toFixed(2)}MB`,
            suggestion: 'Consider running FLUSHDB or checking for large keys',
          });
        }
      }

      // Check for large keys that might affect performance
      const allKeys = await this.connection.client.keys('*');
      if (allKeys.length > 10000) {
        issues.push({
          type: 'performance_degradation',
          severity: 'warning',
          location: 'redis keyspace',
          description: `Redis contains ${allKeys.length} keys`,
          suggestion: 'Large number of keys may affect performance',
        });
      }

      return {
        isClean: issues.filter(i => i.severity === 'critical' || i.severity === 'warning').length === 0,
        database: this.database,
        issues,
        verificationTime: Date.now() - startTime,
        checkedItems: {
          keys: checkedKeys,
        },
      };

    } catch (error) {
      issues.push({
        type: 'connection_issue',
        severity: 'critical',
        location: 'redis connection',
        description: `Verification failed: ${error}`,
      });

      return {
        isClean: false,
        database: this.database,
        issues,
        verificationTime: Date.now() - startTime,
        checkedItems: {
          keys: checkedKeys,
        },
      };
    }
  }

  async reset(options?: CleanupOptions): Promise<CleanupResult> {
    // Reset is the same as cleanup for Redis
    return this.cleanup(options);
  }

  async flushDatabase(): Promise<CleanupResult> {
    const startTime = Date.now();

    try {
      // Get count of keys before flushing
      const dbSize = await this.connection.client.dbsize();
      
      // Flush the current database
      await this.connection.client.flushdb();

      return {
        success: true,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: dbSize,
      };

    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        errors: [new CleanupError(
          `Flush database failed: ${error}`,
          this.database,
          'flush_database',
          error as Error
        )],
      };
    }
  }

  async deleteByPattern(patterns: string[], options?: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    let recordsRemoved = 0;
    const keysAffected: string[] = [];
    const errors: Error[] = [];

    const mergedOptions = {
      batchSize: 1000,
      ...options,
    };

    try {
      for (const pattern of patterns) {
        try {
          const keys = await this.connection.client.keys(pattern);
          
          if (keys.length > 0) {
            if (keys.length > mergedOptions.batchSize!) {
              const deleted = await this.batchedDelete(keys, mergedOptions.batchSize!);
              recordsRemoved += deleted;
            } else {
              await this.connection.client.del(...keys);
              recordsRemoved += keys.length;
            }
            
            keysAffected.push(...keys);
          }
        } catch (error) {
          errors.push(new CleanupError(
            `Failed to delete keys with pattern ${pattern}: ${error}`,
            this.database,
            `delete_pattern_${pattern}`,
            error as Error
          ));
        }
      }

      return {
        success: errors.length === 0,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        keysAffected: keysAffected.slice(0, 100), // Limit for brevity
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        keysAffected,
        errors: [new CleanupError(
          `Delete by pattern failed: ${error}`,
          this.database,
          'delete_by_pattern',
          error as Error
        )],
      };
    }
  }

  async clearExpiredKeys(): Promise<CleanupResult> {
    const startTime = Date.now();

    try {
      const expiredCount = await this.clearExpiredKeysInternal();

      return {
        success: true,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: expiredCount,
      };

    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        errors: [new CleanupError(
          `Clear expired keys failed: ${error}`,
          this.database,
          'clear_expired_keys',
          error as Error
        )],
      };
    }
  }

  getPerformanceMetrics(): CleanupPerformanceMetrics | null {
    return this.performanceMetrics;
  }

  private async batchedDelete(keys: string[], batchSize: number): Promise<number> {
    let totalDeleted = 0;
    
    for (let i = 0; i < keys.length; i += batchSize) {
      const batch = keys.slice(i, i + batchSize);
      await this.connection.client.del(...batch);
      totalDeleted += batch.length;
    }

    return totalDeleted;
  }

  private async clearExpiredKeysInternal(): Promise<number> {
    // Redis automatically removes expired keys, but we can force cleanup
    // by scanning and checking TTL
    let expiredCount = 0;
    let cursor = '0';
    
    do {
      const result = await this.connection.client.scan(cursor, 'COUNT', 100);
      cursor = result[0];
      const keys = result[1];
      
      for (const key of keys) {
        const ttl = await this.connection.client.ttl(key);
        if (ttl === -2) { // Key doesn't exist (expired)
          expiredCount++;
        }
      }
    } while (cursor !== '0');

    return expiredCount;
  }
}