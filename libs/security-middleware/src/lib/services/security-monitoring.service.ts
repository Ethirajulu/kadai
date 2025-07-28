import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { v4 as uuidv4 } from 'uuid';
import { EventEmitter2 } from '@nestjs/event-emitter';
import * as nodemailer from 'nodemailer';
import {
  SecurityAlert,
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityMonitoringConfig,
  SecurityAuditLog,
} from '../types/security.types';
import { SecurityAuditService } from './security-audit.service';

@Injectable()
export class SecurityMonitoringService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityMonitoringService.name);
  private redis!: Redis;
  private config: SecurityMonitoringConfig;
  private activeAlerts: Map<string, SecurityAlert> = new Map();
  private alertRateLimiter: Map<string, { count: number; lastReset: Date }> = new Map();
  private mailTransporter?: nodemailer.Transporter;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: SecurityAuditService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.config = this.loadMonitoringConfig();
  }

  async onModuleInit() {
    if (this.config.alerting.enabled) {
      await this.initializeRedis();
      await this.initializeMailTransporter();
      this.startAlertProcessing();
      this.logger.log('Security monitoring service initialized');
    } else {
      this.logger.warn('Security monitoring service is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      try {
        await this.redis.disconnect();
        this.logger.log('Redis connection closed for monitoring service');
      } catch (error) {
        this.logger.error('Error closing Redis connection for monitoring service', error);
      }
    }
  }

  private loadMonitoringConfig(): SecurityMonitoringConfig {
    return {
      audit: {
        enabled: this.configService.get<boolean>('security.monitoring.audit.enabled', true),
        logLevel: this.configService.get<'DEBUG' | 'INFO' | 'WARN' | 'ERROR'>('security.monitoring.audit.logLevel', 'INFO'),
        maxLogSize: this.configService.get<number>('security.monitoring.audit.maxLogSize', 100),
        retentionDays: this.configService.get<number>('security.monitoring.audit.retentionDays', 30),
        storageBackend: this.configService.get<'FILE' | 'DATABASE' | 'ELASTICSEARCH' | 'CLOUD'>('security.monitoring.audit.storageBackend', 'DATABASE'),
        batchSize: this.configService.get<number>('security.monitoring.audit.batchSize', 100),
        flushInterval: this.configService.get<number>('security.monitoring.audit.flushInterval', 10),
      },
      alerting: {
        enabled: this.configService.get<boolean>('security.monitoring.alerting.enabled', true),
        channels: this.configService.get<Array<'EMAIL' | 'SMS' | 'WEBHOOK' | 'SLACK'>>('security.monitoring.alerting.channels', ['EMAIL']),
        emailConfig: {
          smtpHost: this.configService.get<string>('security.monitoring.alerting.email.smtpHost', 'localhost'),
          smtpPort: this.configService.get<number>('security.monitoring.alerting.email.smtpPort', 587),
          username: this.configService.get<string>('security.monitoring.alerting.email.username', ''),
          password: this.configService.get<string>('security.monitoring.alerting.email.password', ''),
          fromAddress: this.configService.get<string>('security.monitoring.alerting.email.fromAddress', 'security@kadai.com'),
          recipients: this.configService.get<string>('security.monitoring.alerting.email.recipients', '').split(',').filter(Boolean),
        },
        webhookConfig: {
          url: this.configService.get<string>('security.monitoring.alerting.webhook.url', ''),
          headers: {},
          timeout: this.configService.get<number>('security.monitoring.alerting.webhook.timeout', 5000),
        },
        rateLimiting: {
          maxAlertsPerMinute: this.configService.get<number>('security.monitoring.alerting.maxAlertsPerMinute', 10),
          cooldownPeriod: this.configService.get<number>('security.monitoring.alerting.cooldownPeriod', 5),
        },
      },
      threatDetection: {
        enabled: this.configService.get<boolean>('security.monitoring.threatDetection.enabled', true),
        rules: this.getDefaultThreatDetectionRules(),
        correlationRules: this.getDefaultCorrelationRules(),
        ipReputationConfig: {
          enabled: false,
          providers: [],
          cacheTimeout: 60,
          scoreThreshold: 70,
        },
      },
      aggregation: {
        enabled: this.configService.get<boolean>('security.monitoring.aggregation.enabled', false),
        backends: [],
      },
      dashboard: {
        enabled: this.configService.get<boolean>('security.monitoring.dashboard.enabled', true),
        refreshInterval: this.configService.get<number>('security.monitoring.dashboard.refreshInterval', 30),
        historicalDataDays: this.configService.get<number>('security.monitoring.dashboard.historicalDataDays', 7),
        maxEventsPerQuery: this.configService.get<number>('security.monitoring.dashboard.maxEventsPerQuery', 1000),
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
        keyPrefix: 'security_monitoring:',
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
      });

      await this.redis.ping();
      this.logger.log('Redis connection established for security monitoring service');
    } catch (error) {
      this.logger.error('Failed to connect to Redis for security monitoring service', error);
      throw error;
    }
  }

  private async initializeMailTransporter(): Promise<void> {
    if (!this.config.alerting.channels.includes('EMAIL') || !this.config.alerting.emailConfig) {
      return;
    }

    try {
      this.mailTransporter = nodemailer.createTransport({
        host: this.config.alerting.emailConfig.smtpHost,
        port: this.config.alerting.emailConfig.smtpPort,
        secure: this.config.alerting.emailConfig.smtpPort === 465,
        auth: {
          user: this.config.alerting.emailConfig.username,
          pass: this.config.alerting.emailConfig.password,
        },
      });

      if (this.mailTransporter) {
        await this.mailTransporter.verify();
      }
      this.logger.log('Email transporter initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize email transporter', error);
      this.mailTransporter = undefined;
    }
  }

  private startAlertProcessing(): void {
    // Listen for audit events to trigger alert evaluation
    this.eventEmitter.on('security.audit.logged', async (auditLog: SecurityAuditLog) => {
      await this.evaluateForAlerts(auditLog);
    });

    // Clean up expired alerts every 5 minutes
    setInterval(() => {
      this.cleanupExpiredAlerts();
    }, 5 * 60 * 1000);

    // Reset rate limiter every minute
    setInterval(() => {
      this.resetRateLimiter();
    }, 60 * 1000);
  }

  /**
   * Evaluate an audit log for potential alerts
   */
  private async evaluateForAlerts(auditLog: SecurityAuditLog): Promise<void> {
    if (!this.config.threatDetection.enabled) {
      return;
    }

    for (const rule of this.config.threatDetection.rules) {
      if (this.matchesRule(auditLog, rule)) {
        await this.processRuleMatch(auditLog, rule);
      }
    }

    // Check for correlation patterns
    for (const correlationRule of this.config.threatDetection.correlationRules) {
      await this.evaluateCorrelationRule(auditLog, correlationRule);
    }
  }

  private matchesRule(auditLog: SecurityAuditLog, rule: any): boolean {
    // Check if event type matches
    if (!rule.eventTypes.includes(auditLog.eventType)) {
      return false;
    }

    // Check conditions
    for (const condition of rule.conditions) {
      if (!this.evaluateCondition(auditLog, condition)) {
        return false;
      }
    }

    return true;
  }

  private evaluateCondition(auditLog: SecurityAuditLog, condition: any): boolean {
    const fieldValue = this.getFieldValue(auditLog, condition.field);
    
    switch (condition.operator) {
      case 'equals':
        return fieldValue === condition.value;
      case 'contains':
        return String(fieldValue).includes(condition.value);
      case 'regex':
        return new RegExp(condition.value).test(String(fieldValue));
      case 'greater_than':
        return Number(fieldValue) > Number(condition.value);
      case 'less_than':
        return Number(fieldValue) < Number(condition.value);
      default:
        return false;
    }
  }

  private getFieldValue(auditLog: SecurityAuditLog, field: string): any {
    const parts = field.split('.');
    let value: any = auditLog;
    
    for (const part of parts) {
      if (value && typeof value === 'object' && part in value) {
        value = value[part];
      } else {
        return undefined;
      }
    }
    
    return value;
  }

  private async processRuleMatch(auditLog: SecurityAuditLog, rule: any): Promise<void> {
    const timeWindow = rule.timeWindow * 60 * 1000; // Convert to milliseconds

    // Get recent events for this rule and context
    const recentEvents = await this.getRecentEventsForRule(rule, auditLog, timeWindow);
    
    if (recentEvents.length >= rule.threshold) {
      await this.createAlert(rule, auditLog, recentEvents);
      
      // Auto-block if configured
      if (rule.autoBlock && auditLog.sourceIp) {
        await this.autoBlockIP(auditLog.sourceIp, rule.blockDuration || 60);
      }
    }
  }

  private async getRecentEventsForRule(rule: any, auditLog: SecurityAuditLog, timeWindow: number): Promise<SecurityAuditLog[]> {
    const startDate = new Date(Date.now() - timeWindow);
    
    return this.auditService.getAuditLogs({
      eventTypes: rule.eventTypes,
      sourceIp: auditLog.sourceIp,
      userId: auditLog.userId,
      startDate,
      limit: 1000,
    });
  }

  private async evaluateCorrelationRule(auditLog: SecurityAuditLog, correlationRule: any): Promise<void> {
    // This is a simplified correlation implementation
    // In a production system, you might want more sophisticated event correlation
    const timeWindow = correlationRule.maxTimeSpan * 60 * 1000;
    const startDate = new Date(Date.now() - timeWindow);

    const correlatedEvents = await this.auditService.getAuditLogs({
      eventTypes: correlationRule.eventSequence,
      sourceIp: auditLog.sourceIp,
      userId: auditLog.userId,
      startDate,
      limit: 100,
    });

    if (correlatedEvents.length >= correlationRule.minOccurrences) {
      await this.createCorrelationAlert(correlationRule, auditLog, correlatedEvents);
    }
  }

  private async createAlert(rule: any, triggerEvent: SecurityAuditLog, relatedEvents: SecurityAuditLog[]): Promise<string> {
    const alert: SecurityAlert = {
      id: uuidv4(),
      timestamp: new Date(),
      title: rule.name,
      description: rule.description,
      severity: rule.severity,
      category: triggerEvent.category,
      eventType: triggerEvent.eventType,
      triggerCount: relatedEvents.length,
      threshold: rule.threshold,
      timeWindow: rule.timeWindow,
      relatedEvents: relatedEvents.map(e => e.id),
      correlationId: triggerEvent.correlationId,
      status: 'ACTIVE',
      autoResponseEnabled: rule.autoBlock || false,
      actionsTaken: rule.autoBlock ? ['IP_BLOCKED'] : [],
      notificationsSent: [],
      escalationLevel: 1,
    };

    // Store alert
    this.activeAlerts.set(alert.id, alert);
    await this.storeAlert(alert);

    // Send notifications
    await this.sendAlertNotifications(alert);

    this.logger.warn(`Security alert created: ${alert.title}`, {
      alertId: alert.id,
      severity: alert.severity,
      triggerCount: alert.triggerCount,
      sourceIp: triggerEvent.sourceIp,
    });

    return alert.id;
  }

  private async createCorrelationAlert(correlationRule: any, triggerEvent: SecurityAuditLog, correlatedEvents: SecurityAuditLog[]): Promise<string> {
    const alert: SecurityAlert = {
      id: uuidv4(),
      timestamp: new Date(),
      title: `Correlation Alert: ${correlationRule.name}`,
      description: correlationRule.description,
      severity: correlationRule.severity,
      category: SecurityEventCategory.THREAT_DETECTION,
      eventType: SecurityEventType.SUSPICIOUS_ACTIVITY,
      triggerCount: correlatedEvents.length,
      threshold: correlationRule.minOccurrences,
      timeWindow: correlationRule.maxTimeSpan,
      relatedEvents: correlatedEvents.map(e => e.id),
      correlationId: uuidv4(),
      status: 'ACTIVE',
      autoResponseEnabled: false,
      actionsTaken: [],
      notificationsSent: [],
      escalationLevel: 1,
    };

    this.activeAlerts.set(alert.id, alert);
    await this.storeAlert(alert);
    await this.sendAlertNotifications(alert);

    this.logger.warn(`Correlation alert created: ${alert.title}`, {
      alertId: alert.id,
      correlatedEvents: correlatedEvents.length,
    });

    return alert.id;
  }

  private async storeAlert(alert: SecurityAlert): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const key = `alerts:${alert.id}`;
      const ttl = 30 * 24 * 60 * 60; // 30 days
      await this.redis.setex(key, ttl, JSON.stringify(alert, this.dateReplacer));
    } catch (error) {
      this.logger.error(`Error storing alert ${alert.id}`, error);
    }
  }

  private async sendAlertNotifications(alert: SecurityAlert): Promise<void> {
    if (!this.isRateLimitOk(alert)) {
      this.logger.debug(`Alert notification rate limited: ${alert.id}`);
      return;
    }

    const notifications: Promise<void>[] = [];

    if (this.config.alerting.channels.includes('EMAIL')) {
      notifications.push(this.sendEmailAlert(alert));
    }

    if (this.config.alerting.channels.includes('WEBHOOK')) {
      notifications.push(this.sendWebhookAlert(alert));
    }

    try {
      await Promise.allSettled(notifications);
      this.updateRateLimit(alert);
    } catch (error) {
      this.logger.error(`Error sending alert notifications for ${alert.id}`, error);
    }
  }

  private async sendEmailAlert(alert: SecurityAlert): Promise<void> {
    if (!this.mailTransporter || !this.config.alerting.emailConfig?.recipients.length) {
      return;
    }

    try {
      const subject = `[SECURITY ALERT] ${alert.severity} - ${alert.title}`;
      const html = this.generateEmailTemplate(alert);

      await this.mailTransporter.sendMail({
        from: this.config.alerting.emailConfig.fromAddress,
        to: this.config.alerting.emailConfig.recipients,
        subject,
        html,
      });

      alert.notificationsSent.push(...this.config.alerting.emailConfig.recipients);
      this.logger.log(`Email alert sent for ${alert.id}`);
    } catch (error) {
      this.logger.error(`Error sending email alert for ${alert.id}`, error);
    }
  }

  private async sendWebhookAlert(alert: SecurityAlert): Promise<void> {
    if (!this.config.alerting.webhookConfig?.url) {
      return;
    }

    try {
      const response = await fetch(this.config.alerting.webhookConfig.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.alerting.webhookConfig.headers,
        },
        body: JSON.stringify(alert),
        signal: AbortSignal.timeout(this.config.alerting.webhookConfig.timeout),
      });

      if (response.ok) {
        alert.notificationsSent.push(this.config.alerting.webhookConfig.url);
        this.logger.log(`Webhook alert sent for ${alert.id}`);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      this.logger.error(`Error sending webhook alert for ${alert.id}`, error);
    }
  }

  private generateEmailTemplate(alert: SecurityAlert): string {
    return `
      <html>
        <body>
          <h2 style="color: ${this.getSeverityColor(alert.severity)};">
            Security Alert: ${alert.title}
          </h2>
          
          <table style="border-collapse: collapse; width: 100%;">
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Alert ID:</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${alert.id}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Severity:</td>
              <td style="border: 1px solid #ddd; padding: 8px; color: ${this.getSeverityColor(alert.severity)};">${alert.severity}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Category:</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${alert.category}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Event Type:</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${alert.eventType}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Timestamp:</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${alert.timestamp.toISOString()}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Trigger Count:</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${alert.triggerCount}</td>
            </tr>
            <tr>
              <td style="border: 1px solid #ddd; padding: 8px; font-weight: bold;">Description:</td>
              <td style="border: 1px solid #ddd; padding: 8px;">${alert.description}</td>
            </tr>
          </table>
          
          <p style="margin-top: 20px;">
            <strong>Actions Taken:</strong> ${alert.actionsTaken?.join(', ') || 'None'}
          </p>
          
          <p style="margin-top: 20px; font-size: 12px; color: #666;">
            This is an automated security alert from the Kadai Security Monitoring System.
          </p>
        </body>
      </html>
    `;
  }

  private getSeverityColor(severity: SecurityEventSeverity): string {
    switch (severity) {
      case SecurityEventSeverity.CRITICAL:
        return '#dc3545';
      case SecurityEventSeverity.HIGH:
        return '#fd7e14';
      case SecurityEventSeverity.MEDIUM:
        return '#ffc107';
      case SecurityEventSeverity.LOW:
        return '#28a745';
      default:
        return '#6c757d';
    }
  }

  private isRateLimitOk(alert: SecurityAlert): boolean {
    const now = new Date();
    const key = `${alert.eventType}:${alert.severity}`;
    const rateLimitData = this.alertRateLimiter.get(key);

    if (!rateLimitData) {
      return true;
    }

    const timeSinceLastReset = now.getTime() - rateLimitData.lastReset.getTime();
    if (timeSinceLastReset > 60 * 1000) { // Reset every minute
      return true;
    }

    return rateLimitData.count < this.config.alerting.rateLimiting.maxAlertsPerMinute;
  }

  private updateRateLimit(alert: SecurityAlert): void {
    const now = new Date();
    const key = `${alert.eventType}:${alert.severity}`;
    const rateLimitData = this.alertRateLimiter.get(key);

    if (!rateLimitData) {
      this.alertRateLimiter.set(key, { count: 1, lastReset: now });
    } else {
      rateLimitData.count++;
    }
  }

  private resetRateLimiter(): void {
    const now = new Date();
    for (const [, data] of this.alertRateLimiter.entries()) {
      const timeSinceLastReset = now.getTime() - data.lastReset.getTime();
      if (timeSinceLastReset > 60 * 1000) {
        data.count = 0;
        data.lastReset = now;
      }
    }
  }

  private async autoBlockIP(ip: string, durationMinutes: number): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      const key = `blocked_ips:${ip}`;
      const ttl = durationMinutes * 60; // Convert to seconds
      await this.redis.setex(key, ttl, JSON.stringify({
        ip,
        blockedAt: new Date().toISOString(),
        duration: durationMinutes,
        reason: 'Auto-blocked by security monitoring',
      }));

      this.logger.warn(`IP ${ip} auto-blocked for ${durationMinutes} minutes`);
    } catch (error) {
      this.logger.error(`Error auto-blocking IP ${ip}`, error);
    }
  }

  private cleanupExpiredAlerts(): void {
    const now = Date.now();
    const expiredThreshold = 24 * 60 * 60 * 1000; // 24 hours

    for (const [alertId, alert] of this.activeAlerts.entries()) {
      const age = now - alert.timestamp.getTime();
      if (age > expiredThreshold && alert.status === 'RESOLVED') {
        this.activeAlerts.delete(alertId);
      }
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<SecurityAlert[]> {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'ACTIVE')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Get all alerts with optional filters
   */
  async getAlerts(filters: {
    status?: string;
    severity?: SecurityEventSeverity;
    category?: SecurityEventCategory;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<SecurityAlert[]> {
    let alerts = Array.from(this.activeAlerts.values());

    // Apply filters
    if (filters.status) {
      alerts = alerts.filter(alert => alert.status === filters.status);
    }
    if (filters.severity) {
      alerts = alerts.filter(alert => alert.severity === filters.severity);
    }
    if (filters.category) {
      alerts = alerts.filter(alert => alert.category === filters.category);
    }
    if (filters.startDate) {
      alerts = alerts.filter(alert => alert.timestamp >= filters.startDate!);
    }
    if (filters.endDate) {
      alerts = alerts.filter(alert => alert.timestamp <= filters.endDate!);
    }

    // Sort by timestamp descending
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply limit
    if (filters.limit) {
      alerts = alerts.slice(0, filters.limit);
    }

    return alerts;
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = 'ACKNOWLEDGED';
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    await this.storeAlert(alert);
    this.logger.log(`Alert ${alertId} acknowledged by ${acknowledgedBy}`);
    return true;
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string, resolvedBy: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = 'RESOLVED';
    alert.resolvedBy = resolvedBy;
    alert.resolvedAt = new Date();

    await this.storeAlert(alert);
    this.logger.log(`Alert ${alertId} resolved by ${resolvedBy}`);
    return true;
  }

  private getDefaultThreatDetectionRules(): any[] {
    return [
      {
        id: 'brute-force-login',
        name: 'Brute Force Login Attempt',
        description: 'Multiple failed login attempts from the same IP',
        eventTypes: [SecurityEventType.LOGIN_FAILURE],
        conditions: [],
        threshold: 5,
        timeWindow: 15, // minutes
        severity: SecurityEventSeverity.HIGH,
        autoBlock: true,
        blockDuration: 60, // minutes
      },
      {
        id: 'rate-limit-abuse',
        name: 'Rate Limit Abuse',
        description: 'Excessive rate limit violations',
        eventTypes: [SecurityEventType.RATE_LIMIT_EXCEEDED],
        conditions: [],
        threshold: 10,
        timeWindow: 5,
        severity: SecurityEventSeverity.MEDIUM,
        autoBlock: true,
        blockDuration: 30,
      },
      {
        id: 'geo-anomaly',
        name: 'Geographic Anomaly',
        description: 'Access from unusual geographic locations',
        eventTypes: [SecurityEventType.GEO_ANOMALY],
        conditions: [],
        threshold: 1,
        timeWindow: 60,
        severity: SecurityEventSeverity.MEDIUM,
        autoBlock: false,
      },
      {
        id: 'privilege-escalation',
        name: 'Privilege Escalation Attempt',
        description: 'Attempt to access resources with insufficient privileges',
        eventTypes: [SecurityEventType.ROLE_ESCALATION_ATTEMPT],
        conditions: [],
        threshold: 3,
        timeWindow: 30,
        severity: SecurityEventSeverity.HIGH,
        autoBlock: false,
      },
    ];
  }

  private getDefaultCorrelationRules(): any[] {
    return [
      {
        id: 'login-then-sensitive-access',
        name: 'Login followed by sensitive data access',
        description: 'User login followed by access to sensitive data',
        eventSequence: [SecurityEventType.LOGIN_SUCCESS, SecurityEventType.SENSITIVE_DATA_ACCESS],
        maxTimeSpan: 10, // minutes
        minOccurrences: 1,
        severity: SecurityEventSeverity.MEDIUM,
      },
      {
        id: 'multiple-failed-then-success',
        name: 'Multiple failed logins then success',
        description: 'Multiple failed login attempts followed by successful login',
        eventSequence: [SecurityEventType.LOGIN_FAILURE, SecurityEventType.LOGIN_SUCCESS],
        maxTimeSpan: 30,
        minOccurrences: 3,
        severity: SecurityEventSeverity.HIGH,
      },
    ];
  }

  private dateReplacer(key: string, value: any): any {
    if (value instanceof Date) {
      return { __type: 'Date', value: value.toISOString() };
    }
    return value;
  }
}