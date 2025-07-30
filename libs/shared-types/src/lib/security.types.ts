import {
  IsBoolean,
  IsNumber,
  IsString,
  IsOptional,
  IsArray,
  ValidateNested,
  Min,
  Max,
  IsNotEmpty,
  Matches,
  IsDateString,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Audit log retention policy configuration
 */
export class AuditRetentionPolicy {
  @IsNumber()
  @Min(1)
  @Max(3650) // Max 10 years
  retentionDays!: number;

  @IsNumber()
  @Min(1)
  @Max(365) // Max 1 year for archive
  archiveAfterDays!: number;

  @IsBoolean()
  compressionEnabled!: boolean;
}

/**
 * Alert log retention policy configuration
 */
export class AlertRetentionPolicy {
  @IsNumber()
  @Min(1)
  @Max(3650) // Max 10 years
  retentionDays!: number;

  @IsNumber()
  @Min(1)
  @Max(365) // Max 1 year for archive
  archiveAfterDays!: number;
}

/**
 * Elasticsearch retention policy configuration
 */
export class ElasticsearchRetentionPolicy {
  @IsNumber()
  @Min(1)
  @Max(3650) // Max 10 years
  retentionDays!: number;

  @IsBoolean()
  ilmPolicyEnabled!: boolean;
}

/**
 * Redis retention policy configuration
 */
export class RedisRetentionPolicy {
  @IsNumber()
  @Min(1)
  @Max(365) // Max 1 year for Redis
  retentionDays!: number;
}

/**
 * Combined retention policies
 */
export class RetentionPolicies {
  @ValidateNested()
  @Type(() => AuditRetentionPolicy)
  audit!: AuditRetentionPolicy;

  @ValidateNested()
  @Type(() => AlertRetentionPolicy)
  alerts!: AlertRetentionPolicy;

  @ValidateNested()
  @Type(() => ElasticsearchRetentionPolicy)
  elasticsearch!: ElasticsearchRetentionPolicy;

  @ValidateNested()
  @Type(() => RedisRetentionPolicy)
  redis!: RedisRetentionPolicy;
}

/**
 * Storage configuration for log archives
 */
export class StorageConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9._\-/]+$/, {
    message:
      'Archive location must contain only alphanumeric characters, dots, hyphens, underscores, and forward slashes',
  })
  archiveLocation!: string;

  @IsBoolean()
  encryptionEnabled!: boolean;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  encryptionKey?: string;
}

/**
 * Cleanup schedule configuration
 */
export class CleanupConfig {
  @IsString()
  @IsNotEmpty()
  @Matches(
    /^(\*|([0-5]?\d)) (\*|([0-1]?\d|2[0-3])) (\*|([1-2]?\d|3[01])) (\*|([1-9]|1[0-2])) (\*|[0-6])$/,
    {
      message: 'Schedule must be a valid cron expression',
    }
  )
  schedule!: string;

  @IsNumber()
  @Min(1)
  @Max(10000)
  batchSize!: number;

  @IsNumber()
  @Min(1)
  @Max(1440) // Max 24 hours
  maxRunTimeMinutes!: number;
}

/**
 * Complete log retention configuration
 */
export class LogRetentionConfig {
  @IsBoolean()
  enabled!: boolean;

  @ValidateNested()
  @Type(() => RetentionPolicies)
  policies!: RetentionPolicies;

  @ValidateNested()
  @Type(() => StorageConfig)
  storage!: StorageConfig;

  @ValidateNested()
  @Type(() => CleanupConfig)
  cleanup!: CleanupConfig;
}

/**
 * Statistics for retention operations
 */
export class RetentionStats {
  @IsDateString()
  lastRunTime!: Date;

  @IsNumber()
  @Min(0)
  totalFilesProcessed!: number;

  @IsNumber()
  @Min(0)
  totalSizeFreed!: number;

  @IsNumber()
  @Min(0)
  totalArchived!: number;

  @IsNumber()
  @Min(0)
  totalDeleted!: number;

  @IsArray()
  @IsString({ each: true })
  errors!: string[];
}

export class LogStats {
  @IsNumber()
  @Min(0)
  count!: number;

  @IsNumber()
  @Min(0)
  totalSize!: number;
}

export class RedisStats {
  @IsNumber()
  @Min(0)
  keyCount!: number;

  @IsNumber()
  @Min(0)
  memoryUsage!: number;
}

/**
 * Storage usage statistics
 */
export class StorageUsageStats {
  @ValidateNested()
  @Type(() => LogStats)
  auditLogs!: LogStats;

  @ValidateNested()
  @Type(() => LogStats)
  alertLogs!: LogStats;

  @ValidateNested()
  @Type(() => LogStats)
  archives!: LogStats;

  @ValidateNested()
  @Type(() => RedisStats)
  redis!: RedisStats;
}

/**
 * Health check status for connections
 */
export class ConnectionHealth {
  @IsBoolean()
  redis!: boolean;

  @IsBoolean()
  elasticsearch!: boolean;

  @IsOptional()
  @IsString()
  redisError?: string;

  @IsOptional()
  @IsString()
  elasticsearchError?: string;
}

/**
 * Log retention service interface types (for dependency injection compatibility)
 */
export type ILogRetentionConfig = LogRetentionConfig;
export type IRetentionStats = RetentionStats;
export type IStorageUsageStats = StorageUsageStats;
export type IConnectionHealth = ConnectionHealth;
