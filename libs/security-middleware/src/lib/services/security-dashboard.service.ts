import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  SecurityDashboardData,
  SecurityAuditLog,
  SecurityAlert,
  ThreatIndicator,
  SecurityMetrics,
  SecurityEventType,
  SecurityEventSeverity,
  SecurityMonitoringConfig,
} from '../types/security.types';
import { SecurityAuditService } from './security-audit.service';
import { SecurityMonitoringService } from './security-monitoring.service';
import { SecurityAggregationService } from './security-aggregation.service';

@Injectable()
export class SecurityDashboardService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SecurityDashboardService.name);
  private config: SecurityMonitoringConfig;
  private dashboardCache: Map<string, { data: any; timestamp: Date }> =
    new Map();
  private refreshInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly auditService: SecurityAuditService,
    private readonly monitoringService: SecurityMonitoringService,
    private readonly aggregationService: SecurityAggregationService
  ) {
    this.config = this.loadMonitoringConfig();
  }

  async onModuleInit() {
    if (this.config.dashboard.enabled) {
      this.startDashboardRefresh();
      this.logger.log('Security dashboard service initialized');
    } else {
      this.logger.warn('Security dashboard service is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
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

  private startDashboardRefresh(): void {
    // Pre-populate cache on startup
    this.refreshDashboardCache();

    // Set up periodic refresh
    this.refreshInterval = setInterval(
      () => this.refreshDashboardCache(),
      this.config.dashboard.refreshInterval * 1000
    );
  }

  private async refreshDashboardCache(): Promise<void> {
    try {
      this.logger.debug('Refreshing dashboard cache');

      // Refresh main dashboard data
      const dashboardData = await this.generateDashboardData();
      this.dashboardCache.set('main', {
        data: dashboardData,
        timestamp: new Date(),
      });

      // Refresh metrics
      const metrics = await this.aggregationService.getSecurityMetrics(60);
      this.dashboardCache.set('metrics', {
        data: metrics,
        timestamp: new Date(),
      });

      // Refresh time series data
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours
      const timeSeriesData = await this.aggregationService.getTimeSeriesData(
        startTime,
        endTime,
        '1h'
      );
      this.dashboardCache.set('timeSeries', {
        data: timeSeriesData,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error('Error refreshing dashboard cache', error);
    }
  }

  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(): Promise<SecurityDashboardData> {
    const cacheKey = 'main';
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp)) {
      return cached.data;
    }

    const dashboardData = await this.generateDashboardData();

    this.dashboardCache.set(cacheKey, {
      data: dashboardData,
      timestamp: new Date(),
    });

    return dashboardData;
  }

  private async generateDashboardData(): Promise<SecurityDashboardData> {
    const [
      recentEvents,
      activeAlerts,
      topThreats,
      metrics,
      timeSeriesData,
      geoData,
    ] = await Promise.all([
      this.getRecentSecurityEvents(50),
      this.monitoringService.getActiveAlerts(),
      this.getTopThreats(10),
      this.aggregationService.getSecurityMetrics(60),
      this.getTimeSeriesData(24), // Last 24 hours
      this.getGeographicData(),
    ]);

    const overview = {
      totalEvents:
        metrics.eventCounts[SecurityEventType.LOGIN_SUCCESS] +
          metrics.eventCounts[SecurityEventType.LOGIN_FAILURE] +
          metrics.eventCounts[SecurityEventType.RATE_LIMIT_EXCEEDED] +
          metrics.eventCounts[SecurityEventType.IP_BLOCKED] || 0,
      activeAlerts: activeAlerts.length,
      threatsDetected: metrics.threatsDetected,
      systemHealth: this.calculateSystemHealth(metrics, activeAlerts),
    };

    return {
      overview,
      recentEvents,
      activeAlerts,
      topThreats,
      metrics,
      eventTimeSeries: timeSeriesData.eventTimeSeries,
      alertTimeSeries: await this.getAlertTimeSeries(24),
      geoData,
    };
  }

  /**
   * Get recent security events
   */
  async getRecentSecurityEvents(limit = 100): Promise<SecurityAuditLog[]> {
    const cacheKey = `recentEvents:${limit}`;
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 30)) {
      // 30 second cache
      return cached.data;
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    const events = await this.auditService.getAuditLogs({
      startDate,
      endDate,
      limit,
    });

    this.dashboardCache.set(cacheKey, {
      data: events,
      timestamp: new Date(),
    });

    return events;
  }

  /**
   * Get top security threats
   */
  async getTopThreats(limit = 10): Promise<ThreatIndicator[]> {
    const cacheKey = `topThreats:${limit}`;
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 300)) {
      // 5 minute cache
      return cached.data;
    }

    // Get recent high-severity events that indicate threats
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000); // Last 7 days

    const threatEvents = await this.auditService.getAuditLogs({
      severities: [SecurityEventSeverity.HIGH, SecurityEventSeverity.CRITICAL],
      eventTypes: [
        SecurityEventType.BRUTE_FORCE_ATTEMPT,
        SecurityEventType.SUSPICIOUS_ACTIVITY,
        SecurityEventType.ACCOUNT_ENUMERATION,
        SecurityEventType.PASSWORD_SPRAY_ATTACK,
        SecurityEventType.CREDENTIAL_STUFFING,
        SecurityEventType.MALICIOUS_INPUT_DETECTED,
        SecurityEventType.SQL_INJECTION_ATTEMPT,
        SecurityEventType.XSS_ATTEMPT,
      ],
      startDate,
      endDate,
      limit: 1000,
    });

    // Aggregate threats by IP and type
    const threatMap = new Map<
      string,
      {
        ip: string;
        type: string;
        events: SecurityAuditLog[];
        threatScore: number;
        confidence: number;
      }
    >();

    threatEvents.forEach((event) => {
      const key = `${event.sourceIp}:${event.eventType}`;
      if (!threatMap.has(key)) {
        threatMap.set(key, {
          ip: event.sourceIp,
          type: event.eventType,
          events: [],
          threatScore: 0,
          confidence: 0,
        });
      }

      const threat = threatMap.get(key)!;
      threat.events.push(event);
      threat.threatScore = this.calculateThreatScore(threat.events);
      threat.confidence = this.calculateThreatConfidence(threat.events);
    });

    // Convert to ThreatIndicator format and sort by threat score
    const threats: ThreatIndicator[] = Array.from(threatMap.values())
      .map((threat) => ({
        id: `threat-${threat.ip}-${threat.type}`,
        timestamp: new Date(),
        type: 'IP' as const,
        value: threat.ip,
        threatScore: threat.threatScore,
        confidence: threat.confidence,
        detectionRules: [threat.type],
        evidenceEvents: threat.events.map((e) => e.id),
        firstSeen: new Date(
          Math.min(...threat.events.map((e) => e.timestamp.getTime()))
        ),
        lastSeen: new Date(
          Math.max(...threat.events.map((e) => e.timestamp.getTime()))
        ),
        occurrenceCount: threat.events.length,
        status: (threat.threatScore > 70 ? 'ACTIVE' : 'EXPIRED') as
          | 'ACTIVE'
          | 'EXPIRED'
          | 'BLOCKED'
          | 'WHITELISTED',
        blockingEnabled: threat.threatScore > 80,
      }))
      .sort((a, b) => b.threatScore - a.threatScore)
      .slice(0, limit);

    this.dashboardCache.set(cacheKey, {
      data: threats,
      timestamp: new Date(),
    });

    return threats;
  }

  /**
   * Get security metrics for dashboard overview
   */
  async getSecurityMetrics(timeWindow = 60): Promise<SecurityMetrics> {
    const cacheKey = `metrics:${timeWindow}`;
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 60)) {
      // 1 minute cache
      return cached.data;
    }

    const metrics = await this.aggregationService.getSecurityMetrics(
      timeWindow
    );

    this.dashboardCache.set(cacheKey, {
      data: metrics,
      timestamp: new Date(),
    });

    return metrics;
  }

  /**
   * Get time series data for charts
   */
  async getTimeSeriesData(hoursBack = 24): Promise<{
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
    const cacheKey = `timeSeries:${hoursBack}`;
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 300)) {
      // 5 minute cache
      return cached.data;
    }

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - hoursBack * 60 * 60 * 1000);

    const interval = hoursBack <= 6 ? '15m' : hoursBack <= 24 ? '1h' : '1d';
    const timeSeriesData = await this.aggregationService.getTimeSeriesData(
      startTime,
      endTime,
      interval
    );

    this.dashboardCache.set(cacheKey, {
      data: timeSeriesData,
      timestamp: new Date(),
    });

    return timeSeriesData;
  }

  /**
   * Get alert time series data
   */
  async getAlertTimeSeries(hoursBack = 24): Promise<
    Array<{
      timestamp: Date;
      severity: SecurityEventSeverity;
      count: number;
    }>
  > {
    const cacheKey = `alertTimeSeries:${hoursBack}`;
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 300)) {
      // 5 minute cache
      return cached.data;
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hoursBack * 60 * 60 * 1000);

    const alerts = await this.monitoringService.getAlerts({
      startDate,
      endDate,
      limit: 1000,
    });

    // Group alerts by hour and severity
    const alertTimeSeries: Array<{
      timestamp: Date;
      severity: SecurityEventSeverity;
      count: number;
    }> = [];

    const hourlyGroups = new Map<string, Map<SecurityEventSeverity, number>>();

    alerts.forEach((alert) => {
      const hourKey = new Date(
        alert.timestamp.getFullYear(),
        alert.timestamp.getMonth(),
        alert.timestamp.getDate(),
        alert.timestamp.getHours()
      ).toISOString();

      if (!hourlyGroups.has(hourKey)) {
        hourlyGroups.set(hourKey, new Map());
      }

      const severityMap = hourlyGroups.get(hourKey)!;
      severityMap.set(
        alert.severity,
        (severityMap.get(alert.severity) || 0) + 1
      );
    });

    // Convert to array format
    hourlyGroups.forEach((severityMap, hourKey) => {
      const timestamp = new Date(hourKey);
      severityMap.forEach((count, severity) => {
        alertTimeSeries.push({
          timestamp,
          severity,
          count,
        });
      });
    });

    // Sort by timestamp
    alertTimeSeries.sort(
      (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
    );

    this.dashboardCache.set(cacheKey, {
      data: alertTimeSeries,
      timestamp: new Date(),
    });

    return alertTimeSeries;
  }

  /**
   * Get geographic distribution data
   */
  async getGeographicData(): Promise<
    Array<{
      country: string;
      latitude: number;
      longitude: number;
      eventCount: number;
      threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    }>
  > {
    const cacheKey = 'geoData';
    const cached = this.dashboardCache.get(cacheKey);

    if (cached && this.isCacheValid(cached.timestamp, 600)) {
      // 10 minute cache
      return cached.data;
    }

    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    const events = await this.auditService.getAuditLogs({
      startDate,
      endDate,
      limit: 10000,
    });

    // Country coordinates mapping (simplified - in production use a proper geocoding service)
    const countryCoordinates: Record<string, [number, number]> = {
      US: [39.8283, -98.5795],
      IN: [20.5937, 78.9629],
      GB: [55.3781, -3.436],
      DE: [51.1657, 10.4515],
      FR: [46.2276, 2.2137],
      CA: [56.1304, -106.3468],
      AU: [-25.2744, 133.7751],
      JP: [36.2048, 138.2529],
      CN: [35.8617, 104.1954],
      BR: [-14.235, -51.9253],
    };

    // Aggregate events by country
    const countryStats = new Map<
      string,
      {
        eventCount: number;
        threatEvents: number;
      }
    >();

    events.forEach((event) => {
      if (!event.country) return;

      if (!countryStats.has(event.country)) {
        countryStats.set(event.country, { eventCount: 0, threatEvents: 0 });
      }

      const stats = countryStats.get(event.country)!;
      stats.eventCount++;

      // Count threat-related events
      if (
        [
          SecurityEventType.BRUTE_FORCE_ATTEMPT,
          SecurityEventType.SUSPICIOUS_ACTIVITY,
          SecurityEventType.MALICIOUS_INPUT_DETECTED,
          SecurityEventType.IP_BLOCKED,
        ].includes(event.eventType)
      ) {
        stats.threatEvents++;
      }
    });

    // Convert to geographic data format
    const geoData = Array.from(countryStats.entries())
      .map(([country, stats]) => {
        const coordinates = countryCoordinates[country] || [0, 0];
        const threatRatio = stats.threatEvents / stats.eventCount;

        let threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
        if (threatRatio > 0.5) {
          threatLevel = 'CRITICAL';
        } else if (threatRatio > 0.3) {
          threatLevel = 'HIGH';
        } else if (threatRatio > 0.1) {
          threatLevel = 'MEDIUM';
        } else {
          threatLevel = 'LOW';
        }

        return {
          country,
          latitude: coordinates[0],
          longitude: coordinates[1],
          eventCount: stats.eventCount,
          threatLevel,
        };
      })
      .sort((a, b) => b.eventCount - a.eventCount);

    this.dashboardCache.set(cacheKey, {
      data: geoData,
      timestamp: new Date(),
    });

    return geoData;
  }

  /**
   * Get dashboard statistics
   */
  async getDashboardStatistics(): Promise<{
    totalEvents24h: number;
    totalAlerts24h: number;
    threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    systemHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    topEventTypes: Array<{ eventType: SecurityEventType; count: number }>;
    topCountries: Array<{ country: string; count: number }>;
  }> {
    const metrics = await this.getSecurityMetrics(24 * 60); // 24 hours
    const activeAlerts = await this.monitoringService.getActiveAlerts();

    // Calculate total events
    const totalEvents24h = Object.values(metrics.eventCounts).reduce(
      (sum, count) => sum + count,
      0
    );

    // Get alerts from last 24 hours
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    const alerts24h = await this.monitoringService.getAlerts({
      startDate,
      endDate,
    });

    // Calculate threat level
    const criticalAlerts = activeAlerts.filter(
      (a) => a.severity === SecurityEventSeverity.CRITICAL
    ).length;
    const highAlerts = activeAlerts.filter(
      (a) => a.severity === SecurityEventSeverity.HIGH
    ).length;

    let threatLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    if (criticalAlerts > 0) {
      threatLevel = 'CRITICAL';
    } else if (highAlerts > 2) {
      threatLevel = 'HIGH';
    } else if (highAlerts > 0 || alerts24h.length > 10) {
      threatLevel = 'MEDIUM';
    } else {
      threatLevel = 'LOW';
    }

    // Get top event types
    const topEventTypes = Object.entries(metrics.eventCounts)
      .filter(([, count]) => count > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([eventType, count]) => ({
        eventType: eventType as SecurityEventType,
        count,
      }));

    return {
      totalEvents24h,
      totalAlerts24h: alerts24h.length,
      threatLevel,
      systemHealth: this.calculateSystemHealth(metrics, activeAlerts),
      topEventTypes,
      topCountries: metrics.topCountries.slice(0, 5),
    };
  }

  /**
   * Search security events for dashboard
   */
  async searchSecurityEvents(filters: {
    query?: string;
    eventTypes?: SecurityEventType[];
    severities?: SecurityEventSeverity[];
    startDate?: Date;
    endDate?: Date;
    sourceIp?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: SecurityAuditLog[];
    total: number;
  }> {
    // Try aggregation service first (faster), fallback to audit service
    try {
      const aggregationResult = await this.aggregationService.searchLogs({
        query: filters.query,
        eventTypes: filters.eventTypes,
        severities: filters.severities,
        startTime: filters.startDate,
        endTime: filters.endDate,
        sourceIp: filters.sourceIp,
        userId: filters.userId,
        limit: filters.limit,
        offset: filters.offset,
      });

      return {
        events: aggregationResult.logs,
        total: aggregationResult.total,
      };
    } catch (error) {
      this.logger.debug(
        'Aggregation search failed, falling back to audit service',
        error
      );

      // Fallback to audit service
      const events = await this.auditService.getAuditLogs({
        eventTypes: filters.eventTypes,
        severities: filters.severities,
        startDate: filters.startDate,
        endDate: filters.endDate,
        sourceIp: filters.sourceIp,
        userId: filters.userId,
        limit: filters.limit,
        offset: filters.offset,
      });

      return {
        events,
        total: events.length,
      };
    }
  }

  private calculateThreatScore(events: SecurityAuditLog[]): number {
    let score = 0;

    // Base score from event count
    score += Math.min(events.length * 10, 50);

    // Severity multiplier
    events.forEach((event) => {
      switch (event.severity) {
        case SecurityEventSeverity.CRITICAL:
          score += 30;
          break;
        case SecurityEventSeverity.HIGH:
          score += 20;
          break;
        case SecurityEventSeverity.MEDIUM:
          score += 10;
          break;
        case SecurityEventSeverity.LOW:
          score += 5;
          break;
      }
    });

    // Time factor - recent events are more threatening
    const now = Date.now();
    const recentEvents = events.filter(
      (e) => now - e.timestamp.getTime() < 60 * 60 * 1000
    ); // Last hour
    score += recentEvents.length * 5;

    return Math.min(score, 100);
  }

  private calculateThreatConfidence(events: SecurityAuditLog[]): number {
    let confidence = 50; // Base confidence

    // More events increase confidence
    confidence += Math.min(events.length * 5, 30);

    // Consistent pattern increases confidence
    const eventTypes = new Set(events.map((e) => e.eventType));
    if (eventTypes.size === 1) {
      confidence += 20; // Consistent attack pattern
    }

    // Geographic consistency
    const countries = new Set(events.map((e) => e.country).filter(Boolean));
    if (countries.size === 1) {
      confidence += 10;
    }

    return Math.min(confidence, 100);
  }

  private calculateSystemHealth(
    metrics: SecurityMetrics,
    activeAlerts: SecurityAlert[]
  ): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    const criticalAlerts = activeAlerts.filter(
      (a) => a.severity === SecurityEventSeverity.CRITICAL
    ).length;
    const highAlerts = activeAlerts.filter(
      (a) => a.severity === SecurityEventSeverity.HIGH
    ).length;

    // Check for critical conditions
    if (criticalAlerts > 0 || metrics.redisConnectionStatus === 'DOWN') {
      return 'CRITICAL';
    }

    // Check for warning conditions
    if (
      highAlerts > 1 ||
      metrics.errorRate > 0.05 || // 5% error rate
      metrics.circuitBreakerStatus === 'OPEN' ||
      metrics.redisConnectionStatus === 'DEGRADED'
    ) {
      return 'WARNING';
    }

    return 'HEALTHY';
  }

  private isCacheValid(timestamp: Date, maxAgeSeconds = 60): boolean {
    const age = (Date.now() - timestamp.getTime()) / 1000;
    return age < maxAgeSeconds;
  }

  /**
   * Clear dashboard cache
   */
  clearCache(): void {
    this.dashboardCache.clear();
    this.logger.log('Dashboard cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    totalEntries: number;
    cacheKeys: string[];
    oldestEntry?: Date;
    newestEntry?: Date;
  } {
    const entries = Array.from(this.dashboardCache.values());
    const timestamps = entries.map((e) => e.timestamp);

    return {
      totalEntries: this.dashboardCache.size,
      cacheKeys: Array.from(this.dashboardCache.keys()),
      oldestEntry:
        timestamps.length > 0
          ? new Date(Math.min(...timestamps.map((t) => t.getTime())))
          : undefined,
      newestEntry:
        timestamps.length > 0
          ? new Date(Math.max(...timestamps.map((t) => t.getTime())))
          : undefined,
    };
  }
}
