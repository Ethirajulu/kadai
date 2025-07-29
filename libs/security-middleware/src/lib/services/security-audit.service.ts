import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import {
  SecurityAuditLog,
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityRequest,
  SecurityMonitoringConfig,
} from '../types/security.types';

@Injectable()
export class SecurityAuditService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityAuditService.name);
  private redis!: Redis;
  private config: SecurityMonitoringConfig;
  private logBuffer: SecurityAuditLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadMonitoringConfig();
  }

  async onModuleInit() {
    if (this.config.audit.enabled) {
      await this.initializeRedis();
      this.startFlushTimer();
      this.logger.log('Security audit service initialized');
    } else {
      this.logger.warn('Security audit service is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
    }

    // Flush remaining logs
    if (this.logBuffer.length > 0) {
      await this.flushLogs();
    }

    if (this.redis) {
      try {
        await this.redis.disconnect();
        this.logger.log('Redis connection closed for audit service');
      } catch (error) {
        this.logger.error(
          'Error closing Redis connection for audit service',
          error
        );
      }
    }
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
        >('security.monitoring.audit.storageBackend', 'DATABASE'),
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
        channels: this.configService.get<
          Array<'EMAIL' | 'SMS' | 'WEBHOOK' | 'SLACK'>
        >('security.monitoring.alerting.channels', ['EMAIL']),
        rateLimiting: {
          maxAlertsPerMinute: this.configService.get<number>(
            'security.monitoring.alerting.maxAlertsPerMinute',
            10
          ),
          cooldownPeriod: this.configService.get<number>(
            'security.monitoring.alerting.cooldownPeriod',
            5
          ),
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
          false
        ),
        backends: [],
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

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis({
        host: this.configService.get<string>('redis.host', 'localhost'),
        port: this.configService.get<number>('redis.port', 6379),
        password: this.configService.get<string>('redis.password'),
        db: this.configService.get<number>('redis.db', 0),
        keyPrefix: 'security_audit:',
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });

      await this.redis.ping();
      this.logger.log(
        'Redis connection established for security audit service'
      );
    } catch (error) {
      this.logger.error(
        'Failed to connect to Redis for security audit service',
        error
      );
      throw error;
    }
  }

  private startFlushTimer(): void {
    this.flushInterval = setInterval(
      () => this.flushLogs(),
      this.config.audit.flushInterval * 1000
    );
  }

  /**
   * Log a security event with structured data
   */
  async logSecurityEvent(
    eventType: SecurityEventType,
    severity: SecurityEventSeverity,
    message: string,
    request?: SecurityRequest,
    metadata?: Record<string, any>,
    errorDetails?: string,
    correlationId?: string
  ): Promise<string> {
    if (!this.config.audit.enabled) {
      return '';
    }

    const auditLog: SecurityAuditLog = {
      id: uuidv4(),
      timestamp: new Date(),
      eventType,
      severity,
      category: this.getEventCategory(eventType),
      message,

      // Request context
      requestId: request?.headers?.['x-request-id'] as string,
      sessionId: request?.headers?.['x-session-id'] as string,
      userId: request?.user?.id,
      username: request?.user?.email || request?.user?.name,
      userRole: request?.user?.role,

      // Network context
      sourceIp: this.getClientIP(request),
      userAgent: request?.headers?.['user-agent'] as string,
      requestMethod: request?.method,
      requestPath: request?.path || request?.url,
      requestHeaders: this.sanitizeHeaders(request?.headers),

      // Geographic context
      country: request?.ipInfo?.country,
      region: request?.ipInfo?.region,
      city: request?.ipInfo?.city,

      // Additional context
      metadata,
      errorDetails,

      // Correlation
      correlationId,

      // Processing status
      acknowledged: false,
      resolved: false,
    };

    // Add to buffer for batch processing
    this.logBuffer.push(auditLog);

    // Immediate flush for critical events
    if (severity === SecurityEventSeverity.CRITICAL) {
      await this.flushLogs();
    }

    // Flush if buffer is full
    if (this.logBuffer.length >= this.config.audit.batchSize) {
      await this.flushLogs();
    }

    // Log to console based on log level
    this.logToConsole(auditLog);

    return auditLog.id;
  }

  /**
   * Get audit logs by various filters
   */
  async getAuditLogs(filters: {
    eventTypes?: SecurityEventType[];
    severities?: SecurityEventSeverity[];
    categories?: SecurityEventCategory[];
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    sourceIp?: string;
    correlationId?: string;
    limit?: number;
    offset?: number;
  }): Promise<SecurityAuditLog[]> {
    if (!this.redis) {
      return [];
    }

    try {
      const keys = await this.redis.keys('logs:*');
      const logs: SecurityAuditLog[] = [];

      for (const key of keys) {
        const logData = await this.redis.get(key);
        if (logData) {
          const log: SecurityAuditLog = JSON.parse(logData, this.dateReviver);

          // Apply filters
          if (this.matchesFilters(log, filters)) {
            logs.push(log);
          }
        }
      }

      // Sort by timestamp descending
      logs.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      // Apply pagination
      const offset = filters.offset || 0;
      const limit = filters.limit || 100;
      return logs.slice(offset, offset + limit);
    } catch (error) {
      this.logger.error('Error retrieving audit logs', error);
      return [];
    }
  }

  /**
   * Get audit logs by correlation ID
   */
  async getCorrelatedLogs(correlationId: string): Promise<SecurityAuditLog[]> {
    return this.getAuditLogs({ correlationId });
  }

  /**
   * Mark audit log as acknowledged
   */
  async acknowledgeLog(
    logId: string,
    acknowledgedBy: string,
    notes?: string
  ): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const key = `logs:${logId}`;
      const logData = await this.redis.get(key);

      if (logData) {
        const log: SecurityAuditLog = JSON.parse(logData, this.dateReviver);
        log.acknowledged = true;
        log.acknowledgedBy = acknowledgedBy;
        log.acknowledgedAt = new Date();
        if (notes) {
          log.notes = notes;
        }

        await this.redis.setex(
          key,
          this.getLogTTL(),
          JSON.stringify(log, this.dateReplacer)
        );
        this.logger.log(`Audit log ${logId} acknowledged by ${acknowledgedBy}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error acknowledging audit log ${logId}`, error);
      return false;
    }
  }

  /**
   * Mark audit log as resolved
   */
  async resolveLog(
    logId: string,
    resolvedBy: string,
    notes?: string
  ): Promise<boolean> {
    if (!this.redis) {
      return false;
    }

    try {
      const key = `logs:${logId}`;
      const logData = await this.redis.get(key);

      if (logData) {
        const log: SecurityAuditLog = JSON.parse(logData, this.dateReviver);
        log.resolved = true;
        log.resolvedBy = resolvedBy;
        log.resolvedAt = new Date();
        if (notes) {
          log.notes = (log.notes || '') + '\n' + notes;
        }

        await this.redis.setex(
          key,
          this.getLogTTL(),
          JSON.stringify(log, this.dateReplacer)
        );
        this.logger.log(`Audit log ${logId} resolved by ${resolvedBy}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Error resolving audit log ${logId}`, error);
      return false;
    }
  }

  /**
   * Get audit statistics
   */
  async getAuditStatistics(timeWindow = 24): Promise<{
    totalEvents: number;
    eventsBySeverity: Record<SecurityEventSeverity, number>;
    eventsByType: Record<SecurityEventType, number>;
    eventsByCategory: Record<SecurityEventCategory, number>;
    topSourceIPs: Array<{ ip: string; count: number }>;
    topUsers: Array<{ userId: string; count: number }>;
    recentEvents: SecurityAuditLog[];
  }> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - timeWindow * 60 * 60 * 1000);

    const logs = await this.getAuditLogs({
      startDate,
      endDate,
      limit: 10000,
    });

    const stats = {
      totalEvents: logs.length,
      eventsBySeverity: {} as Record<SecurityEventSeverity, number>,
      eventsByType: {} as Record<SecurityEventType, number>,
      eventsByCategory: {} as Record<SecurityEventCategory, number>,
      topSourceIPs: [] as Array<{ ip: string; count: number }>,
      topUsers: [] as Array<{ userId: string; count: number }>,
      recentEvents: logs.slice(0, 20),
    };

    // Initialize counters
    Object.values(SecurityEventSeverity).forEach((severity) => {
      stats.eventsBySeverity[severity] = 0;
    });
    Object.values(SecurityEventType).forEach((type) => {
      stats.eventsByType[type] = 0;
    });
    Object.values(SecurityEventCategory).forEach((category) => {
      stats.eventsByCategory[category] = 0;
    });

    // Count events
    const ipCounts: Record<string, number> = {};
    const userCounts: Record<string, number> = {};

    logs.forEach((log) => {
      stats.eventsBySeverity[log.severity]++;
      stats.eventsByType[log.eventType]++;
      stats.eventsByCategory[log.category]++;

      if (log.sourceIp) {
        ipCounts[log.sourceIp] = (ipCounts[log.sourceIp] || 0) + 1;
      }

      if (log.userId) {
        userCounts[log.userId] = (userCounts[log.userId] || 0) + 1;
      }
    });

    // Get top IPs and users
    stats.topSourceIPs = Object.entries(ipCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([ip, count]) => ({ ip, count }));

    stats.topUsers = Object.entries(userCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([userId, count]) => ({ userId, count }));

    return stats;
  }

  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.redis) {
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const pipeline = this.redis.pipeline();
      const ttl = this.getLogTTL();

      logsToFlush.forEach((log) => {
        const key = `logs:${log.id}`;
        pipeline.setex(key, ttl, JSON.stringify(log, this.dateReplacer));
      });

      await pipeline.exec();
      this.logger.debug(`Flushed ${logsToFlush.length} audit logs to Redis`);
    } catch (error) {
      this.logger.error('Error flushing audit logs to Redis', error);
      // Re-add logs to buffer for retry
      this.logBuffer.unshift(...logsToFlush);
    }
  }

  private getEventCategory(
    eventType: SecurityEventType
  ): SecurityEventCategory {
    if (
      [
        SecurityEventType.LOGIN_SUCCESS,
        SecurityEventType.LOGIN_FAILURE,
        SecurityEventType.LOGOUT,
        SecurityEventType.TOKEN_REFRESH,
        SecurityEventType.TOKEN_BLACKLIST,
        SecurityEventType.TOKEN_EXPIRED,
        SecurityEventType.TOKEN_INVALID,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.AUTHENTICATION;
    }

    if (
      [
        SecurityEventType.ACCESS_DENIED,
        SecurityEventType.PERMISSION_DENIED,
        SecurityEventType.ROLE_ESCALATION_ATTEMPT,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.AUTHORIZATION;
    }

    if (
      [
        SecurityEventType.RATE_LIMIT_EXCEEDED,
        SecurityEventType.BURST_LIMIT_EXCEEDED,
        SecurityEventType.ADAPTIVE_RATE_LIMIT_TRIGGERED,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.RATE_LIMITING;
    }

    if (
      [
        SecurityEventType.IP_BLOCKED,
        SecurityEventType.IP_WHITELISTED,
        SecurityEventType.GEO_BLOCKED,
        SecurityEventType.GEO_ANOMALY,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.FILTERING;
    }

    if (
      [
        SecurityEventType.VALIDATION_FAILURE,
        SecurityEventType.MALICIOUS_INPUT_DETECTED,
        SecurityEventType.SQL_INJECTION_ATTEMPT,
        SecurityEventType.XSS_ATTEMPT,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.VALIDATION;
    }

    if (
      [
        SecurityEventType.SECURITY_CONFIG_CHANGED,
        SecurityEventType.CIRCUIT_BREAKER_OPEN,
        SecurityEventType.REDIS_CONNECTION_FAILURE,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.SYSTEM;
    }

    if (
      [
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityEventType.BRUTE_FORCE_ATTEMPT,
        SecurityEventType.ACCOUNT_ENUMERATION,
        SecurityEventType.PASSWORD_SPRAY_ATTACK,
        SecurityEventType.CREDENTIAL_STUFFING,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.THREAT_DETECTION;
    }

    if (
      [
        SecurityEventType.SENSITIVE_DATA_ACCESS,
        SecurityEventType.DATA_EXFILTRATION_ATTEMPT,
        SecurityEventType.UNAUTHORIZED_DATA_MODIFICATION,
      ].includes(eventType)
    ) {
      return SecurityEventCategory.DATA_PROTECTION;
    }

    return SecurityEventCategory.SYSTEM;
  }

  private getClientIP(request?: SecurityRequest): string {
    if (!request) {
      return 'unknown';
    }

    return (
      (request.headers?.['x-forwarded-for'] as string)?.split(',')[0] ||
      (request.headers?.['x-real-ip'] as string) ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      'unknown'
    );
  }

  private sanitizeHeaders(
    headers?: Record<string, any>
  ): Record<string, string> | undefined {
    if (!headers) {
      return undefined;
    }

    const sanitized: Record<string, string> = {};
    const allowedHeaders = [
      'x-request-id',
      'x-session-id',
      'user-agent',
      'accept',
      'accept-language',
      'accept-encoding',
      'content-type',
      'content-length',
      'origin',
      'referer',
      'x-forwarded-for',
      'x-real-ip',
    ];

    allowedHeaders.forEach((header) => {
      if (headers[header]) {
        sanitized[header] = String(headers[header]);
      }
    });

    return sanitized;
  }

  private logToConsole(auditLog: SecurityAuditLog): void {
    const shouldLog = this.shouldLogToConsole(auditLog.severity);
    if (!shouldLog) {
      return;
    }

    const logData = {
      id: auditLog.id,
      timestamp: auditLog.timestamp.toISOString(),
      eventType: auditLog.eventType,
      severity: auditLog.severity,
      category: auditLog.category,
      message: auditLog.message,
      sourceIp: auditLog.sourceIp,
      userId: auditLog.userId,
      correlationId: auditLog.correlationId,
    };

    switch (auditLog.severity) {
      case SecurityEventSeverity.CRITICAL:
        this.logger.error(
          `CRITICAL SECURITY EVENT: ${auditLog.message}`,
          logData
        );
        break;
      case SecurityEventSeverity.HIGH:
        this.logger.error(`HIGH SECURITY EVENT: ${auditLog.message}`, logData);
        break;
      case SecurityEventSeverity.MEDIUM:
        this.logger.warn(`MEDIUM SECURITY EVENT: ${auditLog.message}`, logData);
        break;
      case SecurityEventSeverity.LOW:
        this.logger.log(`LOW SECURITY EVENT: ${auditLog.message}`, logData);
        break;
    }
  }

  private shouldLogToConsole(severity: SecurityEventSeverity): boolean {
    const logLevel = this.config.audit.logLevel;

    switch (logLevel) {
      case 'ERROR':
        return (
          severity === SecurityEventSeverity.CRITICAL ||
          severity === SecurityEventSeverity.HIGH
        );
      case 'WARN':
        return severity !== SecurityEventSeverity.LOW;
      case 'INFO':
        return true;
      case 'DEBUG':
        return true;
      default:
        return true;
    }
  }

  private matchesFilters(log: SecurityAuditLog, filters: any): boolean {
    if (filters.eventTypes && !filters.eventTypes.includes(log.eventType)) {
      return false;
    }
    if (filters.severities && !filters.severities.includes(log.severity)) {
      return false;
    }
    if (filters.categories && !filters.categories.includes(log.category)) {
      return false;
    }
    if (filters.startDate && log.timestamp < filters.startDate) {
      return false;
    }
    if (filters.endDate && log.timestamp > filters.endDate) {
      return false;
    }
    if (filters.userId && log.userId !== filters.userId) {
      return false;
    }
    if (filters.sourceIp && log.sourceIp !== filters.sourceIp) {
      return false;
    }
    if (filters.correlationId && log.correlationId !== filters.correlationId) {
      return false;
    }
    return true;
  }

  private getLogTTL(): number {
    return this.config.audit.retentionDays * 24 * 60 * 60; // Convert days to seconds
  }

  private dateReplacer(key: string, value: any): any {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    return value;
  }

  private dateReviver(key: string, value: any): any {
    if (value && typeof value === 'object' && value.__type === 'Date') {
      return new Date(value.value);
    }
    return value;
  }
}
