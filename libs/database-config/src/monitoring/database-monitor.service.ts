import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseManager } from '../database-manager.service';
import {
  DatabaseHealthCheckService,
  OverallHealthStatus,
} from '../health-check.service';

export interface DatabaseMetrics {
  timestamp: Date;
  postgresql: {
    connected: boolean;
    responseTime: number;
    connectionCount?: number;
    activeQueries?: number;
    errorRate?: number;
  };
  mongodb: {
    connected: boolean;
    responseTime: number;
    connectionCount?: number;
    collections?: number;
    errorRate?: number;
  };
  redis: {
    connected: boolean;
    responseTime: number;
    memory?: string;
    keyspaceHits?: number;
    keyspaceMisses?: number;
    errorRate?: number;
  };
  qdrant: {
    connected: boolean;
    responseTime: number;
    collections?: number;
    vectorCount?: number;
    errorRate?: number;
  };
}

export interface DatabaseAlert {
  id: string;
  timestamp: Date;
  level: 'info' | 'warning' | 'error' | 'critical';
  database: 'postgresql' | 'mongodb' | 'redis' | 'qdrant' | 'system';
  message: string;
  details?: Record<string, any>;
  resolved?: boolean;
  resolvedAt?: Date;
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsInterval: number; // milliseconds
  alertThresholds: {
    responseTimeMs: number;
    errorRatePercent: number;
    memoryUsagePercent: number;
  };
  retentionPeriod: number; // milliseconds
  maxMetricsHistory: number;
  maxAlertsHistory: number;
}

@Injectable()
export class DatabaseMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseMonitorService.name);
  private metricsInterval?: NodeJS.Timeout;
  private metricsHistory: DatabaseMetrics[] = [];
  private alertsHistory: DatabaseAlert[] = [];
  private readonly config: MonitoringConfig;
  private alertIdCounter = 0;

  constructor(
    private databaseManager: DatabaseManager,
    private healthCheckService: DatabaseHealthCheckService,
    private configService: ConfigService
  ) {
    this.config = {
      enabled: this.configService.get<string>('NODE_ENV') !== 'test',
      metricsInterval: this.configService.get<number>(
        'DB_METRICS_INTERVAL',
        30000
      ), // 30 seconds
      alertThresholds: {
        responseTimeMs: this.configService.get<number>(
          'DB_RESPONSE_TIME_THRESHOLD',
          5000
        ), // 5 seconds
        errorRatePercent: this.configService.get<number>(
          'DB_ERROR_RATE_THRESHOLD',
          5
        ), // 5%
        memoryUsagePercent: this.configService.get<number>(
          'DB_MEMORY_THRESHOLD',
          90
        ), // 90%
      },
      retentionPeriod: this.configService.get<number>(
        'DB_METRICS_RETENTION',
        86400000
      ), // 24 hours
      maxMetricsHistory: this.configService.get<number>('DB_MAX_METRICS', 2880), // 24 hours worth at 30s intervals
      maxAlertsHistory: this.configService.get<number>('DB_MAX_ALERTS', 1000),
    };
  }

  async onModuleInit(): Promise<void> {
    if (this.config.enabled) {
      this.startMonitoring();
      this.logger.log(
        `Database monitoring started with ${this.config.metricsInterval}ms interval`
      );
    } else {
      this.logger.log('Database monitoring disabled');
    }
  }

  async onModuleDestroy(): Promise<void> {
    this.stopMonitoring();
  }

  /**
   * Start monitoring all databases
   */
  private startMonitoring(): void {
    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics();
        this.cleanupOldData();
      } catch (error) {
        this.logger.error('Error during metrics collection:', error);
        this.createAlert('system', 'error', 'Metrics collection failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }, this.config.metricsInterval);
  }

  /**
   * Stop monitoring
   */
  private stopMonitoring(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = undefined;
      this.logger.log('Database monitoring stopped');
    }
  }

  /**
   * Collect comprehensive metrics from all databases
   */
  private async collectMetrics(): Promise<void> {
    const timestamp = new Date();
    const healthStatus = await this.healthCheckService.checkAllDatabases();

    const metrics: DatabaseMetrics = {
      timestamp,
      postgresql: await this.collectPostgreSQLMetrics(healthStatus),
      mongodb: await this.collectMongoDBMetrics(healthStatus),
      redis: await this.collectRedisMetrics(healthStatus),
      qdrant: await this.collectQdrantMetrics(healthStatus),
    };

    // Add to history
    this.metricsHistory.push(metrics);

    // Limit history size
    if (this.metricsHistory.length > this.config.maxMetricsHistory) {
      this.metricsHistory = this.metricsHistory.slice(
        -this.config.maxMetricsHistory
      );
    }

    // Check for alerts
    this.checkForAlerts(metrics);

    this.logger.debug('Database metrics collected', {
      postgresql: metrics.postgresql.connected,
      mongodb: metrics.mongodb.connected,
      redis: metrics.redis.connected,
      qdrant: metrics.qdrant.connected,
    });
  }

  /**
   * Collect PostgreSQL specific metrics
   */
  private async collectPostgreSQLMetrics(healthStatus: OverallHealthStatus) {
    const dbHealth = healthStatus.databases.find(
      (db) => db.name === 'PostgreSQL'
    );
    const prisma = this.databaseManager.getPostgreSQL();

    const metrics = {
      connected: dbHealth?.status === 'healthy',
      responseTime: dbHealth?.responseTime || 0,
    };

    try {
      if (metrics.connected) {
        // Get additional PostgreSQL metrics
        await prisma.getConnectionInfo(); // Connection info for future metrics
        // Add more metrics as needed when schema is available
      }
    } catch (error) {
      this.logger.warn('Failed to collect PostgreSQL metrics:', error);
    }

    return metrics;
  }

  /**
   * Collect MongoDB specific metrics
   */
  private async collectMongoDBMetrics(healthStatus: OverallHealthStatus) {
    const dbHealth = healthStatus.databases.find((db) => db.name === 'MongoDB');
    const mongodb = this.databaseManager.getMongoDB();

    const metrics = {
      connected: dbHealth?.status === 'healthy',
      responseTime: dbHealth?.responseTime || 0,
    };

    try {
      if (metrics.connected) {
        const connectionInfo = await mongodb.getConnectionInfo();
        Object.assign(metrics, {
          collections: connectionInfo.collections.length,
        });
      }
    } catch (error) {
      this.logger.warn('Failed to collect MongoDB metrics:', error);
    }

    return metrics;
  }

  /**
   * Collect Redis specific metrics
   */
  private async collectRedisMetrics(healthStatus: OverallHealthStatus) {
    const dbHealth = healthStatus.databases.find((db) => db.name === 'Redis');
    const redis = this.databaseManager.getRedis();

    const metrics = {
      connected: dbHealth?.status === 'healthy',
      responseTime: dbHealth?.responseTime || 0,
    };

    try {
      if (metrics.connected) {
        const stats = await redis.getCacheStats();
        Object.assign(metrics, {
          memory: stats.info.used_memory_human,
          keyspaceHits: parseInt(stats.info.keyspace_hits || '0'),
          keyspaceMisses: parseInt(stats.info.keyspace_misses || '0'),
        });
      }
    } catch (error) {
      this.logger.warn('Failed to collect Redis metrics:', error);
    }

    return metrics;
  }

  /**
   * Collect Qdrant specific metrics
   */
  private async collectQdrantMetrics(healthStatus: OverallHealthStatus) {
    const dbHealth = healthStatus.databases.find((db) => db.name === 'Qdrant');
    const qdrant = this.databaseManager.getQdrant();

    const metrics = {
      connected: dbHealth?.status === 'healthy',
      responseTime: dbHealth?.responseTime || 0,
    };

    try {
      if (metrics.connected) {
        const collections = await qdrant.listCollections();
        Object.assign(metrics, {
          collections: collections.length,
        });
      }
    } catch (error) {
      this.logger.warn('Failed to collect Qdrant metrics:', error);
    }

    return metrics;
  }

  /**
   * Check for alert conditions
   */
  private checkForAlerts(metrics: DatabaseMetrics): void {
    const { alertThresholds } = this.config;

    // Check response times
    this.checkResponseTimeAlerts(metrics, alertThresholds.responseTimeMs);

    // Check connection status
    this.checkConnectionAlerts(metrics);

    // Check Redis memory usage
    this.checkRedisMemoryAlerts(metrics);
  }

  /**
   * Check for response time alerts
   */
  private checkResponseTimeAlerts(
    metrics: DatabaseMetrics,
    threshold: number
  ): void {
    const databases = ['postgresql', 'mongodb', 'redis', 'qdrant'] as const;

    for (const db of databases) {
      const dbMetrics = metrics[db];
      if (dbMetrics.connected && dbMetrics.responseTime > threshold) {
        this.createAlert(db, 'warning', `High response time detected`, {
          responseTime: dbMetrics.responseTime,
          threshold,
          database: db,
        });
      }
    }
  }

  /**
   * Check for connection alerts
   */
  private checkConnectionAlerts(metrics: DatabaseMetrics): void {
    const databases = ['postgresql', 'mongodb', 'redis', 'qdrant'] as const;

    for (const db of databases) {
      const dbMetrics = metrics[db];
      if (!dbMetrics.connected) {
        this.createAlert(db, 'critical', `Database connection lost`, {
          database: db,
          lastConnected: this.getLastConnectedTime(db),
        });
      }
    }
  }

  /**
   * Check Redis memory usage alerts
   */
  private checkRedisMemoryAlerts(metrics: DatabaseMetrics): void {
    if (metrics.redis.connected && metrics.redis.memory) {
      // Extract memory usage percentage if available
      const memoryStr = metrics.redis.memory;
      // This is a simplified check - in production you'd parse the actual memory values
      if (memoryStr.includes('G') && parseFloat(memoryStr) > 1) {
        // More than 1GB
        this.createAlert(
          'redis',
          'warning',
          'High Redis memory usage detected',
          {
            memory: memoryStr,
            threshold: this.config.alertThresholds.memoryUsagePercent,
          }
        );
      }
    }
  }

  /**
   * Create a new alert
   */
  private createAlert(
    database: DatabaseAlert['database'],
    level: DatabaseAlert['level'],
    message: string,
    details?: Record<string, any>
  ): void {
    const alert: DatabaseAlert = {
      id: `alert_${++this.alertIdCounter}_${Date.now()}`,
      timestamp: new Date(),
      level,
      database,
      message,
      details,
      resolved: false,
    };

    this.alertsHistory.push(alert);

    // Limit alerts history
    if (this.alertsHistory.length > this.config.maxAlertsHistory) {
      this.alertsHistory = this.alertsHistory.slice(
        -this.config.maxAlertsHistory
      );
    }

    // Log the alert
    const logMethod =
      level === 'critical' ? 'error' : level === 'warning' ? 'warn' : 'log';
    this.logger[logMethod](
      `[${level.toUpperCase()}] ${database}: ${message}`,
      details
    );
  }

  /**
   * Get the last time a database was connected
   */
  private getLastConnectedTime(database: string): Date | null {
    for (let i = this.metricsHistory.length - 1; i >= 0; i--) {
      const metrics = this.metricsHistory[i];
      const dbMetrics = metrics[database as keyof DatabaseMetrics] as any;
      if (dbMetrics && dbMetrics.connected) {
        return metrics.timestamp;
      }
    }
    return null;
  }

  /**
   * Clean up old data
   */
  private cleanupOldData(): void {
    const cutoffTime = Date.now() - this.config.retentionPeriod;

    // Clean old metrics
    this.metricsHistory = this.metricsHistory.filter(
      (metrics) => metrics.timestamp.getTime() > cutoffTime
    );

    // Clean old resolved alerts
    this.alertsHistory = this.alertsHistory.filter(
      (alert) => !alert.resolved || alert.timestamp.getTime() > cutoffTime
    );
  }

  /**
   * Get current metrics
   */
  getCurrentMetrics(): DatabaseMetrics | null {
    return this.metricsHistory.length > 0
      ? this.metricsHistory[this.metricsHistory.length - 1]
      : null;
  }

  /**
   * Get metrics history
   */
  getMetricsHistory(limit?: number): DatabaseMetrics[] {
    return limit ? this.metricsHistory.slice(-limit) : this.metricsHistory;
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): DatabaseAlert[] {
    return this.alertsHistory.filter((alert) => !alert.resolved);
  }

  /**
   * Get all alerts
   */
  getAllAlerts(limit?: number): DatabaseAlert[] {
    return limit ? this.alertsHistory.slice(-limit) : this.alertsHistory;
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string): boolean {
    const alert = this.alertsHistory.find((a) => a.id === alertId);
    if (alert && !alert.resolved) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.logger.log(`Alert resolved: ${alertId}`);
      return true;
    }
    return false;
  }

  /**
   * Get monitoring statistics
   */
  getMonitoringStats(): {
    isEnabled: boolean;
    uptime: number;
    metricsCollected: number;
    activeAlerts: number;
    totalAlerts: number;
    lastMetricsCollection: Date | null;
  } {
    return {
      isEnabled: this.config.enabled,
      uptime: this.metricsInterval
        ? Date.now() -
          (this.metricsHistory[0]?.timestamp.getTime() || Date.now())
        : 0,
      metricsCollected: this.metricsHistory.length,
      activeAlerts: this.getActiveAlerts().length,
      totalAlerts: this.alertsHistory.length,
      lastMetricsCollection: this.getCurrentMetrics()?.timestamp || null,
    };
  }

  /**
   * Force immediate metrics collection
   */
  async forceMetricsCollection(): Promise<DatabaseMetrics> {
    await this.collectMetrics();
    return this.getCurrentMetrics()!;
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(newConfig: Partial<MonitoringConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Monitoring configuration updated', newConfig);

    // Restart monitoring if interval changed
    if (newConfig.metricsInterval && this.metricsInterval) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(format: 'json' | 'prometheus' = 'json'): string {
    const currentMetrics = this.getCurrentMetrics();

    if (!currentMetrics) {
      return format === 'json' ? '{}' : '';
    }

    if (format === 'prometheus') {
      return this.formatPrometheusMetrics(currentMetrics);
    }

    return JSON.stringify(currentMetrics, null, 2);
  }

  /**
   * Format metrics in Prometheus format
   */
  private formatPrometheusMetrics(metrics: DatabaseMetrics): string {
    const lines: string[] = [];
    const timestamp = Math.floor(metrics.timestamp.getTime() / 1000);

    // Database connection status
    lines.push(
      `# HELP database_connected Database connection status (1 = connected, 0 = disconnected)`
    );
    lines.push(`# TYPE database_connected gauge`);
    lines.push(
      `database_connected{database="postgresql"} ${
        metrics.postgresql.connected ? 1 : 0
      } ${timestamp}`
    );
    lines.push(
      `database_connected{database="mongodb"} ${
        metrics.mongodb.connected ? 1 : 0
      } ${timestamp}`
    );
    lines.push(
      `database_connected{database="redis"} ${
        metrics.redis.connected ? 1 : 0
      } ${timestamp}`
    );
    lines.push(
      `database_connected{database="qdrant"} ${
        metrics.qdrant.connected ? 1 : 0
      } ${timestamp}`
    );

    // Response times
    lines.push(
      `# HELP database_response_time_ms Database response time in milliseconds`
    );
    lines.push(`# TYPE database_response_time_ms gauge`);
    lines.push(
      `database_response_time_ms{database="postgresql"} ${metrics.postgresql.responseTime} ${timestamp}`
    );
    lines.push(
      `database_response_time_ms{database="mongodb"} ${metrics.mongodb.responseTime} ${timestamp}`
    );
    lines.push(
      `database_response_time_ms{database="redis"} ${metrics.redis.responseTime} ${timestamp}`
    );
    lines.push(
      `database_response_time_ms{database="qdrant"} ${metrics.qdrant.responseTime} ${timestamp}`
    );

    return lines.join('\n');
  }
}
