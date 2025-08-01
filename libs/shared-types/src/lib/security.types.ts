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

/**
 * Vulnerability assessment severity levels
 */
export enum SeverityLevel {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * Vulnerability scan types
 */
export enum ScanType {
  DEPENDENCY = 'dependency',
  INFRASTRUCTURE = 'infrastructure',
  SAST = 'sast',
}

/**
 * Vulnerability status types
 */
export enum VulnerabilityStatus {
  OPEN = 'open',
  FIXED = 'fixed',
  ACCEPTED = 'accepted',
  FALSE_POSITIVE = 'false_positive',
  MITIGATED = 'mitigated'
}

/**
 * Vulnerability assessment configuration
 */
export interface VulnerabilityAssessmentConfig {
  enabled: boolean;
  scanning: {
    dependencies: {
      enabled: boolean;
      schedule: string;
      failOnHigh: boolean;
      failOnCritical: boolean;
    };
    infrastructure: {
      enabled: boolean;
      schedule: string;
      targets: string[];
      portRange: string;
    };
    sast: {
      enabled: boolean;
      schedule: string;
      tools: string[];
    };
  };
  reporting: {
    format: string;
    outputDir: string;
    retentionDays: number;
  };
  thresholds: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  notifications: {
    enabled: boolean;
    webhook?: string;
    email: string[];
  };
}

/**
 * Vulnerability finding interface
 */
export interface VulnerabilityFinding {
  id: string;
  scanId?: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  cvss: number;
  cve?: string | null;
  package?: string | null;
  version?: string | null;
  fixedVersion?: string | null;
  source: string;
  scanType: ScanType;
  status: VulnerabilityStatus;
  firstDetected: Date;
  lastSeen: Date;
  location?: {
    file?: string;
    line?: number;
    host?: string;
    port?: string;
    vulnerability?: string;
  };
  remediation?: string;
  references?: string[];
}

/**
 * Vulnerability scan interface
 */
export interface VulnerabilityScan {
  id: string;
  scanType: ScanType;
  status: string;
  startTime: Date;
  endTime?: Date;
  findingsCount?: number;
  config: VulnerabilityAssessmentConfig;
  error?: string;
}

/**
 * Vulnerability report interface
 */
export interface VulnerabilityReport {
  scanId: string;
  scanType: ScanType;
  startTime: Date;
  endTime: Date;
  status: string;
  summary: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  findings: VulnerabilityFinding[];
  recommendations: string[];
}

/**
 * Input validation classes for vulnerability scanning
 */
export class ScanTargetValidation {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9.-]+$/, {
    message: 'Target must contain only alphanumeric characters, dots, and hyphens',
  })
  target!: string;
}

export class PortRangeValidation {
  @IsString()
  @IsNotEmpty()
  @Matches(/^(\d{1,5})-(\d{1,5})$|^\d{1,5}$/, {
    message: 'Port range must be in format "1-1000" or "80"',
  })
  portRange!: string;
}

export class ScanParametersValidation {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ScanTargetValidation)
  targets!: ScanTargetValidation[];

  @ValidateNested()
  @Type(() => PortRangeValidation)
  portRange!: PortRangeValidation;

  @IsNumber()
  @Min(1)
  @Max(3600) // Max 1 hour timeout
  timeout!: number;
}

/**
 * Scan result processing interfaces
 */
export interface NpmAuditResult {
  vulnerabilities: Record<string, NpmVulnerability>;
  metadata: {
    vulnerabilities: {
      total: number;
      critical: number;
      high: number;
      moderate: number;
      low: number;
    };
  };
}

export interface NpmVulnerability {
  severity: string;
  via: Array<{
    source?: number;
    title?: string;
    overview?: string;
    cvss?: {
      score: number;
    };
    cve?: string;
    range?: string;
  }>;
  fixAvailable: boolean | string;
}

export interface SnykResult {
  vulnerabilities: SnykVulnerability[];
}

export interface SnykVulnerability {
  id: string;
  title: string;
  description: string;
  severity: string;
  cvssScore?: number;
  identifiers?: {
    CVE?: string[];
  };
  packageName: string;
  version: string;
  fixedIn?: string[];
}

export interface SnykCodeResult {
  runs: Array<{
    results: SnykCodeFinding[];
  }>;
}

export interface SnykCodeFinding {
  ruleId: string;
  level: string;
  message: {
    text: string;
  };
  locations?: Array<{
    physicalLocation?: {
      artifactLocation?: {
        uri?: string;
      };
      region?: {
        startLine?: number;
      };
    };
  }>;
}

/**
 * Command execution validation
 */
export class CommandValidation {
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-zA-Z0-9\s\-._]+$/, {
    message: 'Command must contain only safe characters',
  })
  command!: string;

  @IsArray()
  @IsString({ each: true })
  @Matches(/^[a-zA-Z0-9\s\-._=]+$/, { each: true, message: 'Arguments must contain only safe characters' })
  args!: string[];
}
