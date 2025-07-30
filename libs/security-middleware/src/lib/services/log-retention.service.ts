import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { promises as fs } from 'fs';
import { join } from 'path';
import Redis from 'ioredis';
import { Client } from '@elastic/elasticsearch';

interface LogRetentionConfig {
  enabled: boolean;
  policies: {
    audit: {
      retentionDays: number;
      archiveAfterDays: number;
      compressionEnabled: boolean;
    };
    alerts: {
      retentionDays: number;
      archiveAfterDays: number;
    };
    elasticsearch: {
      retentionDays: number;
      ilmPolicyEnabled: boolean;
    };
    redis: {
      retentionDays: number;
    };
  };
  storage: {
    archiveLocation: string;
    encryptionEnabled: boolean;
    encryptionKey?: string;
  };
  cleanup: {
    schedule: string;
    batchSize: number;
    maxRunTimeMinutes: number;
  };
}

interface RetentionStats {
  lastRunTime: Date;
  totalFilesProcessed: number;
  totalSizeFreed: number;
  totalArchived: number;
  totalDeleted: number;
  errors: string[];
}

@Injectable()
export class LogRetentionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LogRetentionService.name);
  private config: LogRetentionConfig;
  private redis?: Redis;
  private elasticsearch?: Client;
  private stats: RetentionStats;
  private isRunning = false;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadRetentionConfig();
    this.stats = {
      lastRunTime: new Date(),
      totalFilesProcessed: 0,
      totalSizeFreed: 0,
      totalArchived: 0,
      totalDeleted: 0,
      errors: [],
    };
  }

  async onModuleInit() {
    if (this.config.enabled) {
      await this.initializeConnections();
      this.logger.log('Log retention service initialized');
    } else {
      this.logger.warn('Log retention service is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.disconnect();
    }
    if (this.elasticsearch) {
      await this.elasticsearch.close();
    }
  }

  private loadRetentionConfig(): LogRetentionConfig {
    return {
      enabled: this.configService.get<boolean>(
        'security.retention.enabled',
        true
      ),
      policies: {
        audit: {
          retentionDays: this.configService.get<number>(
            'security.retention.policies.audit.retentionDays',
            90
          ),
          archiveAfterDays: this.configService.get<number>(
            'security.retention.policies.audit.archiveAfterDays',
            30
          ),
          compressionEnabled: this.configService.get<boolean>(
            'security.retention.policies.audit.compressionEnabled',
            true
          ),
        },
        alerts: {
          retentionDays: this.configService.get<number>(
            'security.retention.policies.alerts.retentionDays',
            365
          ),
          archiveAfterDays: this.configService.get<number>(
            'security.retention.policies.alerts.archiveAfterDays',
            90
          ),
        },
        elasticsearch: {
          retentionDays: this.configService.get<number>(
            'security.retention.policies.elasticsearch.retentionDays',
            180
          ),
          ilmPolicyEnabled: this.configService.get<boolean>(
            'security.retention.policies.elasticsearch.ilmPolicyEnabled',
            true
          ),
        },
        redis: {
          retentionDays: this.configService.get<number>(
            'security.retention.policies.redis.retentionDays',
            7
          ),
        },
      },
      storage: {
        archiveLocation: this.configService.get<string>(
          'security.retention.storage.archiveLocation',
          'archives/security'
        ),
        encryptionEnabled: this.configService.get<boolean>(
          'security.retention.storage.encryptionEnabled',
          false
        ),
        encryptionKey: this.configService.get<string>(
          'security.retention.storage.encryptionKey'
        ),
      },
      cleanup: {
        schedule: this.configService.get<string>(
          'security.retention.cleanup.schedule',
          '0 2 * * *' // Daily at 2 AM
        ),
        batchSize: this.configService.get<number>(
          'security.retention.cleanup.batchSize',
          1000
        ),
        maxRunTimeMinutes: this.configService.get<number>(
          'security.retention.cleanup.maxRunTimeMinutes',
          120
        ),
      },
    };
  }

  private async initializeConnections(): Promise<void> {
    try {
      // Initialize Redis connection
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host', 'localhost'),
        port: this.configService.get<number>('redis.port', 6379),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db', 0),
        keyPrefix: 'security_retention:',
        lazyConnect: true,
      });

      // Initialize Elasticsearch connection if enabled
      const elasticsearchEnabled = this.configService.get<boolean>(
        'security.monitoring.elasticsearch.enabled',
        false
      );

      if (elasticsearchEnabled) {
        this.elasticsearch = new Client({
          node: this.configService.get<string>(
            'security.monitoring.elasticsearch.node',
            'http://localhost:9200'
          ),
        });
      }

      // Ensure archive directory exists
      await fs.mkdir(this.config.storage.archiveLocation, { recursive: true });

      this.logger.log('Log retention service connections initialized');
    } catch (error) {
      this.logger.error('Failed to initialize retention service connections', error);
    }
  }

  /**
   * Scheduled cleanup job - runs daily at 2 AM by default
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async runScheduledCleanup(): Promise<void> {
    if (!this.config.enabled || this.isRunning) {
      return;
    }

    try {
      this.isRunning = true;
      this.logger.log('Starting scheduled log retention cleanup');

      const startTime = Date.now();
      const maxRunTime = this.config.cleanup.maxRunTimeMinutes * 60 * 1000;

      // Reset stats for this run
      this.stats = {
        lastRunTime: new Date(),
        totalFilesProcessed: 0,
        totalSizeFreed: 0,
        totalArchived: 0,
        totalDeleted: 0,
        errors: [],
      };

      // Run cleanup tasks in parallel
      const cleanupTasks = [
        this.cleanupAuditLogs(),
        this.cleanupAlertLogs(),
        this.cleanupRedisLogs(),
        this.cleanupElasticsearchIndices(),
      ];

      // Run with timeout
      await Promise.race([
        Promise.allSettled(cleanupTasks),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Cleanup timeout')), maxRunTime)
        ),
      ]);

      const duration = Date.now() - startTime;
      this.logger.log(`Log retention cleanup completed in ${duration}ms`, {
        filesProcessed: this.stats.totalFilesProcessed,
        sizeFreed: this.formatBytes(this.stats.totalSizeFreed),
        archived: this.stats.totalArchived,
        deleted: this.stats.totalDeleted,
        errors: this.stats.errors.length,
      });
    } catch (error) {
      this.logger.error('Error during scheduled cleanup', error);
      this.stats.errors.push(error instanceof Error ? error.message : String(error));
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Clean up audit log files
   */
  private async cleanupAuditLogs(): Promise<void> {
    try {
      const logDirectory = this.configService.get<string>(
        'security.monitoring.logDirectory',
        'logs/security'
      );

      const files = await fs.readdir(logDirectory);
      const logFiles = files.filter(f => f.endsWith('.jsonl') || f.endsWith('.log'));

      const now = Date.now();
      const archiveThreshold = this.config.policies.audit.archiveAfterDays * 24 * 60 * 60 * 1000;
      const deleteThreshold = this.config.policies.audit.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of logFiles) {
        try {
          const filePath = join(logDirectory, file);
          const stats = await fs.stat(filePath);
          const age = now - stats.mtime.getTime();

          this.stats.totalFilesProcessed++;

          if (age > deleteThreshold) {
            // Delete old files
            await fs.unlink(filePath);
            this.stats.totalDeleted++;
            this.stats.totalSizeFreed += stats.size;
            this.logger.debug(`Deleted old audit log: ${file}`);
          } else if (age > archiveThreshold) {
            // Archive files
            const archived = await this.archiveFile(filePath, 'audit');
            if (archived) {
              await fs.unlink(filePath);
              this.stats.totalArchived++;
              this.stats.totalSizeFreed += stats.size;
              this.logger.debug(`Archived audit log: ${file}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Error processing audit log file ${file}`, error);
          this.stats.errors.push(`Audit log ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error('Error cleaning up audit logs', error);
      this.stats.errors.push(`Audit cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up alert log files
   */
  private async cleanupAlertLogs(): Promise<void> {
    try {
      const alertDirectory = join(
        this.configService.get<string>('security.monitoring.logDirectory', 'logs/security'),
        'alerts'
      );

      // Check if alert directory exists
      try {
        await fs.access(alertDirectory);
      } catch {
        return; // Directory doesn't exist, skip
      }

      const files = await fs.readdir(alertDirectory);
      const now = Date.now();
      const archiveThreshold = this.config.policies.alerts.archiveAfterDays * 24 * 60 * 60 * 1000;
      const deleteThreshold = this.config.policies.alerts.retentionDays * 24 * 60 * 60 * 1000;

      for (const file of files) {
        try {
          const filePath = join(alertDirectory, file);
          const stats = await fs.stat(filePath);
          const age = now - stats.mtime.getTime();

          this.stats.totalFilesProcessed++;

          if (age > deleteThreshold) {
            await fs.unlink(filePath);
            this.stats.totalDeleted++;
            this.stats.totalSizeFreed += stats.size;
            this.logger.debug(`Deleted old alert log: ${file}`);
          } else if (age > archiveThreshold) {
            const archived = await this.archiveFile(filePath, 'alerts');
            if (archived) {
              await fs.unlink(filePath);
              this.stats.totalArchived++;
              this.stats.totalSizeFreed += stats.size;
              this.logger.debug(`Archived alert log: ${file}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Error processing alert log file ${file}`, error);
          this.stats.errors.push(`Alert log ${file}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      this.logger.error('Error cleaning up alert logs', error);
      this.stats.errors.push(`Alert cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up Redis-stored logs
   */
  private async cleanupRedisLogs(): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const cutoffTime = Date.now() - (this.config.policies.redis.retentionDays * 24 * 60 * 60 * 1000);
      
      // Clean audit logs from Redis
      const auditKeys = await this.redis.keys('security_audit:logs:*');
      let deletedCount = 0;

      for (let i = 0; i < auditKeys.length; i += this.config.cleanup.batchSize) {
        const batch = auditKeys.slice(i, i + this.config.cleanup.batchSize);
        const pipeline = this.redis.pipeline();

        for (const key of batch) {
          try {
            const logData = await this.redis.get(key);
            if (logData) {
              const log = JSON.parse(logData);
              const logTime = new Date(log.timestamp).getTime();
              
              if (logTime < cutoffTime) {
                pipeline.del(key);
                deletedCount++;
              }
            }
          } catch (error) {
            this.logger.warn(`Error processing Redis key ${key}`, error);
          }
        }

        await pipeline.exec();
      }

      // Clean monitoring data
      const monitoringKeys = await this.redis.keys('security_monitoring:*');
      for (let i = 0; i < monitoringKeys.length; i += this.config.cleanup.batchSize) {
        const batch = monitoringKeys.slice(i, i + this.config.cleanup.batchSize);
        const pipeline = this.redis.pipeline();

        for (const key of batch) {
          try {
            const ttl = await this.redis.ttl(key);
            if (ttl === -1) { // No TTL set
              const age = await this.getKeyAge(key);
              if (age && age > this.config.policies.redis.retentionDays * 24 * 60 * 60 * 1000) {
                pipeline.del(key);
                deletedCount++;
              }
            }
          } catch (error) {
            this.logger.warn(`Error processing Redis monitoring key ${key}`, error);
          }
        }

        await pipeline.exec();
      }

      this.stats.totalDeleted += deletedCount;
      this.logger.debug(`Cleaned up ${deletedCount} Redis keys`);
    } catch (error) {
      this.logger.error('Error cleaning up Redis logs', error);
      this.stats.errors.push(`Redis cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Clean up Elasticsearch indices
   */
  private async cleanupElasticsearchIndices(): Promise<void> {
    if (!this.elasticsearch || !this.config.policies.elasticsearch.ilmPolicyEnabled) {
      return;
    }

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.policies.elasticsearch.retentionDays);

      // Get all security-related indices
      const indices = await this.elasticsearch.cat.indices({
        index: 'kadai-security-*',
        format: 'json',
      });

      let deletedIndices = 0;

      for (const index of indices as any[]) {
        try {
          // Extract date from index name (format: kadai-security-logs-2024.01.15)
          const dateMatch = index.index.match(/(\d{4}\.\d{2}\.\d{2})$/);
          if (dateMatch) {
            const indexDate = new Date(dateMatch[1].replace(/\./g, '-'));
            
            if (indexDate < cutoffDate) {
              await this.elasticsearch!.indices.delete({
                index: index.index,
              });
              deletedIndices++;
              this.logger.debug(`Deleted Elasticsearch index: ${index.index}`);
            }
          }
        } catch (error) {
          this.logger.warn(`Error processing Elasticsearch index ${index.index}`, error);
          this.stats.errors.push(`ES index ${index.index}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }

      this.stats.totalDeleted += deletedIndices;
      this.logger.debug(`Cleaned up ${deletedIndices} Elasticsearch indices`);
    } catch (error) {
      this.logger.error('Error cleaning up Elasticsearch indices', error);
      this.stats.errors.push(`Elasticsearch cleanup: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Archive a file to compressed storage
   */
  private async archiveFile(filePath: string, category: string): Promise<boolean> {
    try {
      const fileName = filePath.split('/').pop();
      const archiveDir = join(this.config.storage.archiveLocation, category);
      
      await fs.mkdir(archiveDir, { recursive: true });

      if (this.config.policies.audit.compressionEnabled) {
        // Use zlib compression
        const zlib = await import('zlib');
        const { promisify } = await import('util');
        const gzip = promisify(zlib.gzip);

        const fileContent = await fs.readFile(filePath);
        const compressed = await gzip(fileContent);
        
        const archivePath = join(archiveDir, `${fileName}.gz`);
        await fs.writeFile(archivePath, compressed);
      } else {
        // Simple copy
        const archivePath = join(archiveDir, fileName!);
        await fs.copyFile(filePath, archivePath);
      }

      return true;
    } catch (error) {
      this.logger.error(`Failed to archive file ${filePath}`, error);
      this.stats.errors.push(`Archive ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Get the age of a Redis key (approximation based on key pattern)
   */
  private async getKeyAge(key: string): Promise<number | null> {
    try {
      // Try to extract timestamp from key or get creation time
      const keyInfo = await this.redis!.memory('USAGE', key);
      if (keyInfo) {
        // This is an approximation - Redis doesn't store creation time
        // In a production system, you might want to encode timestamp in key names
        return Date.now() - (keyInfo as number * 1000); // Very rough approximation
      }
    } catch (error) {
      // Ignore errors for key age calculation
    }
    return null;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  /**
   * Manual cleanup trigger
   */
  async runManualCleanup(): Promise<RetentionStats> {
    if (this.isRunning) {
      throw new Error('Cleanup is already running');
    }

    await this.runScheduledCleanup();
    return this.getRetentionStats();
  }

  /**
   * Get retention statistics
   */
  getRetentionStats(): RetentionStats {
    return { ...this.stats };
  }

  /**
   * Get retention configuration
   */
  getRetentionConfig(): LogRetentionConfig {
    return { ...this.config };
  }

  /**
   * Update retention policies
   */
  async updateRetentionPolicies(policies: Partial<LogRetentionConfig['policies']>): Promise<void> {
    this.config.policies = { ...this.config.policies, ...policies };
    this.logger.log('Retention policies updated', policies);
  }

  /**
   * Get storage usage statistics
   */
  async getStorageStats(): Promise<{
    auditLogs: { count: number; totalSize: number };
    alertLogs: { count: number; totalSize: number };
    archives: { count: number; totalSize: number };
    redis: { keyCount: number; memoryUsage: number };
  }> {
    const stats = {
      auditLogs: { count: 0, totalSize: 0 },
      alertLogs: { count: 0, totalSize: 0 },
      archives: { count: 0, totalSize: 0 },
      redis: { keyCount: 0, memoryUsage: 0 },
    };

    try {
      // Audit logs statistics
      const logDirectory = this.configService.get<string>(
        'security.monitoring.logDirectory',
        'logs/security'
      );

      try {
        const auditFiles = await fs.readdir(logDirectory);
        for (const file of auditFiles) {
          if (file.endsWith('.jsonl') || file.endsWith('.log')) {
            const filePath = join(logDirectory, file);
            const fileStat = await fs.stat(filePath);
            stats.auditLogs.count++;
            stats.auditLogs.totalSize += fileStat.size;
          }
        }
      } catch (error) {
        // Directory might not exist
      }

      // Archive statistics
      try {
        const archiveFiles = await fs.readdir(this.config.storage.archiveLocation);
        for (const file of archiveFiles) {
          const filePath = join(this.config.storage.archiveLocation, file);
          const fileStat = await fs.stat(filePath);
          if (fileStat.isFile()) {
            stats.archives.count++;
            stats.archives.totalSize += fileStat.size;
          }
        }
      } catch (error) {
        // Archive directory might not exist
      }

      // Redis statistics
      if (this.redis) {
        const auditKeys = await this.redis.keys('security_audit:*');
        const monitoringKeys = await this.redis.keys('security_monitoring:*');
        stats.redis.keyCount = auditKeys.length + monitoringKeys.length;

        // Get approximate memory usage
        const info = await this.redis.info('memory');
        const memoryMatch = info.match(/used_memory:(\d+)/);
        if (memoryMatch) {
          stats.redis.memoryUsage = parseInt(memoryMatch[1]);
        }
      }
    } catch (error) {
      this.logger.error('Error getting storage statistics', error);
    }

    return stats;
  }
}