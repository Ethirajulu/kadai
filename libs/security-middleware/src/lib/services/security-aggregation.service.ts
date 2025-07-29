import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { promises as fs } from 'fs';
import { join } from 'path';
import {
  SecurityAuditLog,
  SecurityMonitoringConfig,
  SecurityMetrics,
  SecurityEventType,
  SecurityEventSeverity,
} from '../types/security.types';

@Injectable()
export class SecurityAggregationService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(SecurityAggregationService.name);
  private config: SecurityMonitoringConfig;
  private aggregationBuffer: SecurityAuditLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private logDirectory: string;
  private currentLogFile: string;
  private inMemoryLogs: SecurityAuditLog[] = [];
  private maxInMemoryLogs = 10000; // Keep last 10k logs in memory for dashboard

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.config = this.loadMonitoringConfig();
    this.logDirectory = this.configService.get<string>(
      'security.monitoring.logDirectory',
      'logs/security'
    );
    this.currentLogFile = this.generateLogFileName();
  }

  async onModuleInit() {
    if (this.config.aggregation.enabled) {
      await this.initializeFileSystem();
      this.startAggregation();
      this.logger.log('Security aggregation service initialized with file-based storage');
    } else {
      this.logger.warn('Security aggregation service is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush remaining logs
    if (this.aggregationBuffer.length > 0) {
      await this.flushAggregationBuffer();
    }

    this.logger.log('Security aggregation service shut down');
  }

  private loadMonitoringConfig(): SecurityMonitoringConfig {
    return {
      audit: {
        enabled: this.configService.get<boolean>(
          'security.monitoring.audit.enabled',
          true
        ),
        logLevel: this.configService.get<'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>(
          'security.monitoring.audit.logLevel',
          'INFO'
        ),
        maxLogSize: this.configService.get<number>(
          'security.monitoring.audit.maxLogSize',
          100
        ),
        retentionDays: this.configService.get<number>(
          'security.monitoring.audit.retentionDays',
          30
        ),
        storageBackend: this.configService.get<
          'FILE' | 'DATABASE' | 'CLOUD'
        >('security.monitoring.audit.storageBackend', 'FILE'),
        batchSize: this.configService.get<number>(
          'security.monitoring.audit.batchSize',
          100
        ),
        flushInterval: this.configService.get<number>(
          'security.monitoring.audit.flushInterval',
          10
        ),
      },
      alerting: {
        enabled: this.configService.get<boolean>(
          'security.monitoring.alerting.enabled',
          true
        ),
        channels: [],
        rateLimiting: {
          maxAlertsPerMinute: 10,
          cooldownPeriod: 5,
        },
      },
      threatDetection: {
        enabled: this.configService.get<boolean>(
          'security.monitoring.threatDetection.enabled',
          true
        ),
        rules: [],
        correlationRules: [],
      },
      aggregation: {
        enabled: this.configService.get<boolean>(
          'security.monitoring.aggregation.enabled',
          true
        ),
        backends: this.configService.get<
          Array<'FILE' | 'WEBHOOK' | 'CUSTOM'>
        >('security.monitoring.aggregation.backends', ['FILE']),
        custom: {
          endpoint: this.configService.get<string>(
            'security.monitoring.aggregation.custom.endpoint',
            ''
          ),
          headers: {},
          batchSize: this.configService.get<number>(
            'security.monitoring.aggregation.custom.batchSize',
            100
          ),
          retryConfig: {
            maxRetries: this.configService.get<number>(
              'security.monitoring.aggregation.custom.retryConfig.maxRetries',
              3
            ),
            backoffFactor: this.configService.get<number>(
              'security.monitoring.aggregation.custom.retryConfig.backoffFactor',
              2
            ),
          },
        },
      },
      dashboard: {
        enabled: this.configService.get<boolean>(
          'security.monitoring.dashboard.enabled',
          true
        ),
        refreshInterval: this.configService.get<number>(
          'security.monitoring.dashboard.refreshInterval',
          30
        ),
        historicalDataDays: this.configService.get<number>(
          'security.monitoring.dashboard.historicalDataDays',
          7
        ),
        maxEventsPerQuery: this.configService.get<number>(
          'security.monitoring.dashboard.maxEventsPerQuery',
          1000
        ),
      },
    };
  }

  /**
   * Get current aggregation status and configuration
   */
  getAggregationStatus(): {
    enabled: boolean;
    backends: string[];
    logDirectory: string;
    currentLogFile: string;
    inMemoryLogCount: number;
    bufferSize: number;
  } {
    return {
      enabled: this.config.aggregation.enabled,
      backends: this.config.aggregation.backends,
      logDirectory: this.logDirectory,
      currentLogFile: this.currentLogFile,
      inMemoryLogCount: this.inMemoryLogs.length,
      bufferSize: this.aggregationBuffer.length,
    };
  }
  private async initializeFileSystem(): Promise<void> {
    try {
      await fs.mkdir(this.logDirectory, { recursive: true });
      this.logger.log(`Log directory initialized: ${this.logDirectory}`);
      
      // Load existing logs into memory for dashboard queries
      await this.loadRecentLogsIntoMemory();
      
      // Initialize custom backends if configured
      for (const backend of this.config.aggregation.backends) {
        if (backend === 'CUSTOM') {
          await this.initializeCustomBackend();
        }
      }
    } catch (error) {
      this.logger.error('Failed to initialize file system for security logs', error);
    }
  }

  private generateLogFileName(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `security-logs-${year}-${month}-${day}.jsonl`;
  }

  private async loadRecentLogsIntoMemory(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDirectory);
      const logFiles = files
        .filter(f => f.endsWith('.jsonl'))
        .sort()
        .slice(-7); // Load last 7 days of logs

      const allLogs: SecurityAuditLog[] = [];
      
      for (const file of logFiles) {
        try {
          const filePath = join(this.logDirectory, file);
          const content = await fs.readFile(filePath, 'utf-8');
          const lines = content.trim().split('\n').filter(line => line.trim());
          
          for (const line of lines) {
            try {
              const log = JSON.parse(line);
              log.timestamp = new Date(log.timestamp);
              allLogs.push(log);
            } catch (parseError) {
              this.logger.warn(`Failed to parse log line in ${file}`, parseError);
            }
          }
        } catch (fileError) {
          this.logger.warn(`Failed to read log file ${file}`, fileError);
        }
      }

      // Keep only the most recent logs in memory
      this.inMemoryLogs = allLogs
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, this.maxInMemoryLogs);
        
      this.logger.log(`Loaded ${this.inMemoryLogs.length} recent logs into memory`);
    } catch (error) {
      this.logger.warn('Failed to load recent logs into memory', error);
      this.inMemoryLogs = [];
    }
  }

  private async initializeCustomBackend(): Promise<void> {
    if (!this.config.aggregation.custom?.endpoint) {
      this.logger.warn('Custom aggregation backend endpoint not configured');
      return;
    }

    try {
      // Test custom endpoint with a ping request
      const response = await fetch(
        `${this.config.aggregation.custom.endpoint}/health`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...this.config.aggregation.custom.headers,
          },
          signal: AbortSignal.timeout(5000),
        }
      );

      if (response.ok) {
        this.logger.log('Custom aggregation backend initialized successfully');
      } else {
        this.logger.warn(
          `Custom aggregation backend returned status ${response.status}`
        );
      }
    } catch (error) {
      this.logger.error(
        'Failed to initialize custom aggregation backend',
        error
      );
    }
  }

  private startAggregation(): void {
    // Listen for audit events
    this.eventEmitter.on(
      'security.audit.logged',
      async (auditLog: SecurityAuditLog) => {
        await this.aggregateLog(auditLog);
      }
    );

    // Start periodic flush
    this.flushInterval = setInterval(
      () => this.flushAggregationBuffer(),
      this.config.audit.flushInterval * 1000
    );

    this.logger.log('Security log aggregation started');
  }

  /**
   * Add a security audit log to the aggregation pipeline
   */
  private async aggregateLog(auditLog: SecurityAuditLog): Promise<void> {
    if (!this.config.aggregation.enabled) {
      return;
    }

    // Add to buffer
    this.aggregationBuffer.push(auditLog);

    // Flush if buffer is full
    if (this.aggregationBuffer.length >= this.config.audit.batchSize) {
      await this.flushAggregationBuffer();
    }
  }

  /**
   * Flush aggregated logs to configured backends
   */
  private async flushAggregationBuffer(): Promise<void> {
    if (this.aggregationBuffer.length === 0) {
      return;
    }

    const logsToFlush = [...this.aggregationBuffer];
    this.aggregationBuffer = [];

    const flushPromises: Promise<void>[] = [];

    // Always flush to file
    flushPromises.push(this.flushToFile(logsToFlush));
    
    // Flush to additional backends if configured
    for (const backend of this.config.aggregation.backends) {
      switch (backend) {
        case 'CUSTOM':
          flushPromises.push(this.flushToCustomBackend(logsToFlush));
          break;
        case 'WEBHOOK':
          flushPromises.push(this.flushToWebhook(logsToFlush));
          break;
        default:
          break;
      }
    }

    try {
      await Promise.allSettled(flushPromises);
      
      // Add to in-memory logs for dashboard queries
      this.inMemoryLogs.unshift(...logsToFlush);
      if (this.inMemoryLogs.length > this.maxInMemoryLogs) {
        this.inMemoryLogs = this.inMemoryLogs.slice(0, this.maxInMemoryLogs);
      }
      
      this.logger.debug(
        `Flushed ${logsToFlush.length} logs to aggregation backends`
      );
    } catch (error) {
      this.logger.error('Error flushing logs to aggregation backends', error);
      // Re-add logs to buffer for retry
      this.aggregationBuffer.unshift(...logsToFlush);
    }
  }

  private async flushToFile(logs: SecurityAuditLog[]): Promise<void> {
    try {
      // Check if we need to rotate log file (daily rotation)
      const currentFileName = this.generateLogFileName();
      if (currentFileName !== this.currentLogFile) {
        this.currentLogFile = currentFileName;
        this.logger.debug(`Rotating to new log file: ${this.currentLogFile}`);
      }
      
      const logFilePath = join(this.logDirectory, this.currentLogFile);
      
      // Convert logs to JSONL format (one JSON object per line)
      const logLines = logs.map(log => {
        const logWithTimestamp = {
          ...log,
          timestamp: log.timestamp.toISOString(),
        };
        return JSON.stringify(logWithTimestamp);
      });
      
      const content = logLines.join('\n') + '\n';
      
      // Append to log file
      await fs.appendFile(logFilePath, content, 'utf-8');
      
      this.logger.debug(
        `Successfully wrote ${logs.length} logs to file: ${logFilePath}`
      );
      
      // Cleanup old log files
      await this.cleanupOldLogFiles();
    } catch (error) {
      this.logger.error('Error writing logs to file', error);
      throw error;
    }
  }

  private async flushToWebhook(logs: SecurityAuditLog[]): Promise<void> {
    const webhookUrl = this.configService.get<string>(
      'security.monitoring.aggregation.webhook.url'
    );
    
    if (!webhookUrl) {
      return;
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.configService.get<Record<string, string>>(
            'security.monitoring.aggregation.webhook.headers',
            {}
          ),
        },
        body: JSON.stringify({ 
          timestamp: new Date().toISOString(),
          source: 'kadai-security-middleware',
          logs: logs.map(log => ({
            ...log,
            timestamp: log.timestamp.toISOString(),
          }))
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        this.logger.debug(
          `Successfully sent ${logs.length} logs to webhook`
        );
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error('Error sending logs to webhook', error);
      throw error;
    }
  }

  private async flushToCustomBackend(logs: SecurityAuditLog[]): Promise<void> {
    if (!this.config.aggregation.custom?.endpoint) {
      return;
    }

    const maxRetries = this.config.aggregation.custom.retryConfig.maxRetries;
    const backoffFactor =
      this.config.aggregation.custom.retryConfig.backoffFactor;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const response = await fetch(
          `${this.config.aggregation.custom.endpoint}/logs`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...this.config.aggregation.custom.headers,
            },
            body: JSON.stringify({ 
              timestamp: new Date().toISOString(),
              source: 'kadai-security-middleware',
              logs: logs.map(log => ({
                ...log,
                timestamp: log.timestamp.toISOString(),
              }))
            }),
            signal: AbortSignal.timeout(10000),
          }
        );

        if (response.ok) {
          this.logger.debug(
            `Successfully sent ${logs.length} logs to custom backend`
          );
          return;
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        if (attempt === maxRetries) {
          this.logger.error(
            `Failed to send logs to custom backend after ${
              maxRetries + 1
            } attempts`,
            error
          );
          throw error;
        }

        const delay = Math.pow(backoffFactor, attempt) * 1000;
        this.logger.debug(
          `Retrying custom backend request in ${delay}ms (attempt ${
            attempt + 1
          }/${maxRetries + 1})`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private async cleanupOldLogFiles(): Promise<void> {
    try {
      const files = await fs.readdir(this.logDirectory);
      const logFiles = files.filter(f => f.endsWith('.jsonl'));
      const retentionDays = this.config.audit.retentionDays;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      for (const file of logFiles) {
        const filePath = join(this.logDirectory, file);
        const stats = await fs.stat(filePath);
        
        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          this.logger.debug(`Deleted old log file: ${file}`);
        }
      }
    } catch (error) {
      this.logger.warn('Error during log file cleanup', error);
    }
  }

  /**
   * Query aggregated security metrics from in-memory logs
   */
  async getSecurityMetrics(timeWindow = 60): Promise<SecurityMetrics> {
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - timeWindow * 60 * 1000);

    const metrics: SecurityMetrics = {
      timestamp: endTime,
      timeWindow,
      eventCounts: {} as Record<SecurityEventType, number>,
      severityCounts: {} as Record<SecurityEventSeverity, number>,
      totalLogins: 0,
      successfulLogins: 0,
      failedLogins: 0,
      uniqueUsers: 0,
      rateLimitHits: 0,
      rateLimitBlocks: 0,
      adaptiveAdjustments: 0,
      topCountries: [],
      blockedCountries: [],
      ipBlocks: 0,
      uniqueBlockedIPs: 0,
      whitelistHits: 0,
      threatsDetected: 0,
      threatsBlocked: 0,
      falsePositives: 0,
      redisConnectionStatus: 'HEALTHY',
      circuitBreakerStatus: 'CLOSED',
      averageResponseTime: 0,
      errorRate: 0,
    };

    // Initialize counters
    Object.values(SecurityEventType).forEach((type) => {
      metrics.eventCounts[type] = 0;
    });
    Object.values(SecurityEventSeverity).forEach((severity) => {
      metrics.severityCounts[severity] = 0;
    });

    try {
      await this.queryInMemoryMetrics(metrics, startTime, endTime);
    } catch (error) {
      this.logger.error('Error querying security metrics', error);
    }

    return metrics;
  }

  private async queryInMemoryMetrics(
    metrics: SecurityMetrics,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    // Filter logs within time window
    const filteredLogs = this.inMemoryLogs.filter(
      log => log.timestamp >= startTime && log.timestamp <= endTime
    );

    const uniqueUsers = new Set<string>();
    const uniqueIPs = new Set<string>();
    const countryCount = new Map<string, number>();
    const blockedCountries = new Map<string, number>();

    // Process each log
    for (const log of filteredLogs) {
      // Event counts by type
      metrics.eventCounts[log.eventType] = 
        (metrics.eventCounts[log.eventType] || 0) + 1;
      
      // Severity counts
      metrics.severityCounts[log.severity] = 
        (metrics.severityCounts[log.severity] || 0) + 1;
      
      // Unique users
      if (log.userId) {
        uniqueUsers.add(log.userId);
      }
      
      // Unique IPs
      uniqueIPs.add(log.sourceIp);
      
      // Country distribution
      if (log.country) {
        countryCount.set(log.country, (countryCount.get(log.country) || 0) + 1);
        
        if (log.eventType === SecurityEventType.GEO_BLOCKED) {
          blockedCountries.set(log.country, (blockedCountries.get(log.country) || 0) + 1);
        }
      }
    }

    // Set computed metrics
    metrics.uniqueUsers = uniqueUsers.size;
    metrics.uniqueBlockedIPs = uniqueIPs.size;
    
    // Login metrics
    metrics.successfulLogins = metrics.eventCounts[SecurityEventType.LOGIN_SUCCESS] || 0;
    metrics.failedLogins = metrics.eventCounts[SecurityEventType.LOGIN_FAILURE] || 0;
    metrics.totalLogins = metrics.successfulLogins + metrics.failedLogins;
    
    // Rate limiting metrics
    metrics.rateLimitHits = metrics.eventCounts[SecurityEventType.RATE_LIMIT_EXCEEDED] || 0;
    metrics.rateLimitBlocks = metrics.eventCounts[SecurityEventType.BURST_LIMIT_EXCEEDED] || 0;
    
    // IP filtering metrics
    metrics.ipBlocks = metrics.eventCounts[SecurityEventType.IP_BLOCKED] || 0;
    
    // Threat detection metrics
    const threatEvents = [
      SecurityEventType.BRUTE_FORCE_ATTEMPT,
      SecurityEventType.SUSPICIOUS_ACTIVITY,
      SecurityEventType.ACCOUNT_ENUMERATION,
      SecurityEventType.PASSWORD_SPRAY_ATTACK,
      SecurityEventType.CREDENTIAL_STUFFING,
    ];
    
    metrics.threatsDetected = threatEvents.reduce(
      (sum, eventType) => sum + (metrics.eventCounts[eventType] || 0),
      0
    );
    
    // Country metrics
    metrics.topCountries = Array.from(countryCount.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
      
    metrics.blockedCountries = Array.from(blockedCountries.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }

  /**
   * Get aggregated data for time series visualization from in-memory logs
   */
  async getTimeSeriesData(
    startTime: Date,
    endTime: Date,
    interval: '1m' | '5m' | '15m' | '1h' | '1d' = '15m'
  ): Promise<{
    eventTimeSeries: Array<{
      timestamp: Date;
      eventType: SecurityEventType;
      count: number;
    }>;
    severityTimeSeries: Array<{
      timestamp: Date;
      severity: SecurityEventSeverity;
      count: number;
    }>;
  }> {
    const result = {
      eventTimeSeries: [] as Array<{
        timestamp: Date;
        eventType: SecurityEventType;
        count: number;
      }>,
      severityTimeSeries: [] as Array<{
        timestamp: Date;
        severity: SecurityEventSeverity;
        count: number;
      }>,
    };

    try {
      // Convert interval to milliseconds
      const intervalMs = this.parseIntervalToMs(interval);
      
      // Filter logs within time range
      const filteredLogs = this.inMemoryLogs.filter(
        log => log.timestamp >= startTime && log.timestamp <= endTime
      );
      
      // Group logs by time buckets
      const eventBuckets = new Map<string, Map<SecurityEventType, number>>();
      const severityBuckets = new Map<string, Map<SecurityEventSeverity, number>>();
      
      for (const log of filteredLogs) {
        // Round timestamp to interval bucket
        const bucketTime = new Date(
          Math.floor(log.timestamp.getTime() / intervalMs) * intervalMs
        );
        const bucketKey = bucketTime.toISOString();
        
        // Event type buckets
        if (!eventBuckets.has(bucketKey)) {
          eventBuckets.set(bucketKey, new Map());
        }
        const eventMap = eventBuckets.get(bucketKey)!;
        eventMap.set(log.eventType, (eventMap.get(log.eventType) || 0) + 1);
        
        // Severity buckets
        if (!severityBuckets.has(bucketKey)) {
          severityBuckets.set(bucketKey, new Map());
        }
        const severityMap = severityBuckets.get(bucketKey)!;
        severityMap.set(log.severity, (severityMap.get(log.severity) || 0) + 1);
      }
      
      // Convert buckets to time series arrays
      for (const [bucketKey, eventMap] of eventBuckets) {
        const timestamp = new Date(bucketKey);
        for (const [eventType, count] of eventMap) {
          result.eventTimeSeries.push({ timestamp, eventType, count });
        }
      }
      
      for (const [bucketKey, severityMap] of severityBuckets) {
        const timestamp = new Date(bucketKey);
        for (const [severity, count] of severityMap) {
          result.severityTimeSeries.push({ timestamp, severity, count });
        }
      }
      
      // Sort by timestamp
      result.eventTimeSeries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      result.severityTimeSeries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    } catch (error) {
      this.logger.error('Error generating time series data', error);
    }

    return result;
  }

  private parseIntervalToMs(interval: string): number {
    const intervalMap: Record<string, number> = {
      '1m': 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
    };
    return intervalMap[interval] || intervalMap['15m'];
  }

  /**
   * Search aggregated logs with advanced filters from in-memory logs
   */
  async searchLogs(filters: {
    query?: string;
    eventTypes?: SecurityEventType[];
    severities?: SecurityEventSeverity[];
    startTime?: Date;
    endTime?: Date;
    sourceIp?: string;
    userId?: string;
    country?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    logs: SecurityAuditLog[];
    total: number;
  }> {
    const result = {
      logs: [] as SecurityAuditLog[],
      total: 0,
    };

    try {
      let filteredLogs = [...this.inMemoryLogs];

      // Apply filters
      if (filters.startTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp >= filters.startTime!);
      }
      
      if (filters.endTime) {
        filteredLogs = filteredLogs.filter(log => log.timestamp <= filters.endTime!);
      }
      
      if (filters.eventTypes && filters.eventTypes.length > 0) {
        filteredLogs = filteredLogs.filter(log => 
          filters.eventTypes!.includes(log.eventType)
        );
      }
      
      if (filters.severities && filters.severities.length > 0) {
        filteredLogs = filteredLogs.filter(log => 
          filters.severities!.includes(log.severity)
        );
      }
      
      if (filters.sourceIp) {
        filteredLogs = filteredLogs.filter(log => log.sourceIp === filters.sourceIp);
      }
      
      if (filters.userId) {
        filteredLogs = filteredLogs.filter(log => log.userId === filters.userId);
      }
      
      if (filters.country) {
        filteredLogs = filteredLogs.filter(log => log.country === filters.country);
      }
      
      // Text search in message, userAgent, and requestPath
      if (filters.query) {
        const query = filters.query.toLowerCase();
        filteredLogs = filteredLogs.filter(log => 
          log.message.toLowerCase().includes(query) ||
          (log.userAgent && log.userAgent.toLowerCase().includes(query)) ||
          (log.requestPath && log.requestPath.toLowerCase().includes(query))
        );
      }
      
      // Sort by timestamp descending
      filteredLogs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      
      result.total = filteredLogs.length;
      
      // Apply pagination
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;
      result.logs = filteredLogs.slice(offset, offset + limit);
      
    } catch (error) {
      this.logger.error('Error searching logs', error);
    }

    return result;
  }

  /**
   * Export logs to JSON file for external analysis
   */
  async exportLogs(filters: {
    startTime?: Date;
    endTime?: Date;
    format?: 'json' | 'csv';
  } = {}): Promise<string> {
    try {
      const searchResult = await this.searchLogs({
        startTime: filters.startTime,
        endTime: filters.endTime,
        limit: 50000, // Large limit for export
      });
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const exportFileName = `security-logs-export-${timestamp}.${filters.format || 'json'}`;
      const exportPath = join(this.logDirectory, exportFileName);
      
      if (filters.format === 'csv') {
        // Convert to CSV format
        const headers = [
          'id', 'timestamp', 'eventType', 'severity', 'category', 'message',
          'sourceIp', 'userId', 'username', 'userRole', 'country', 'region', 'city',
          'requestMethod', 'requestPath', 'userAgent', 'acknowledged', 'resolved'
        ];
        
        const csvRows = [headers.join(',')];
        
        for (const log of searchResult.logs) {
          const row = headers.map(header => {
            const value = (log as any)[header] || '';
            // Escape commas and quotes in CSV
            return typeof value === 'string' && (value.includes(',') || value.includes('"')) 
              ? `"${value.replace(/"/g, '""')}"` 
              : value;
          });
          csvRows.push(row.join(','));
        }
        
        await fs.writeFile(exportPath, csvRows.join('\n'), 'utf-8');
      } else {
        // JSON format
        const exportData = {
          exportedAt: new Date().toISOString(),
          totalLogs: searchResult.total,
          filters,
          logs: searchResult.logs,
        };
        
        await fs.writeFile(exportPath, JSON.stringify(exportData, null, 2), 'utf-8');
      }
      
      this.logger.log(`Exported ${searchResult.logs.length} logs to ${exportPath}`);
      return exportPath;
    } catch (error) {
      this.logger.error('Error exporting logs', error);
      throw error;
    }
  }
}
