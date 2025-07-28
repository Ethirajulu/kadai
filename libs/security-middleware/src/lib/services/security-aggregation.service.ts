import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
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
  private elasticsearchClient?: ElasticsearchClient;
  private aggregationBuffer: SecurityAuditLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;

  constructor(
    private readonly configService: ConfigService,
    private readonly eventEmitter: EventEmitter2
  ) {
    this.config = this.loadMonitoringConfig();
  }

  async onModuleInit() {
    if (this.config.aggregation.enabled) {
      await this.initializeBackends();
      this.startAggregation();
      this.logger.log('Security aggregation service initialized');
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

    if (this.elasticsearchClient) {
      try {
        await this.elasticsearchClient.close();
        this.logger.log('Elasticsearch client closed');
      } catch (error) {
        this.logger.error('Error closing Elasticsearch client', error);
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
          'FILE' | 'DATABASE' | 'ELASTICSEARCH' | 'CLOUD'
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
        backends: this.configService.get<
          Array<'ELASTICSEARCH' | 'SPLUNK' | 'DATADOG' | 'CUSTOM'>
        >('security.monitoring.aggregation.backends', []),
        elasticsearch: {
          hosts: this.configService
            .get<string>(
              'security.monitoring.aggregation.elasticsearch.hosts',
              'http://localhost:9200'
            )
            .split(','),
          username: this.configService.get<string>(
            'security.monitoring.aggregation.elasticsearch.username'
          ),
          password: this.configService.get<string>(
            'security.monitoring.aggregation.elasticsearch.password'
          ),
          index: this.configService.get<string>(
            'security.monitoring.aggregation.elasticsearch.index',
            'security-logs'
          ),
          mappingTemplate: this.configService.get<string>(
            'security.monitoring.aggregation.elasticsearch.mappingTemplate'
          ),
        },
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

  private async initializeBackends(): Promise<void> {
    for (const backend of this.config.aggregation.backends) {
      switch (backend) {
        case 'ELASTICSEARCH':
          await this.initializeElasticsearch();
          break;
        case 'CUSTOM':
          await this.initializeCustomBackend();
          break;
        case 'SPLUNK':
        case 'DATADOG':
          this.logger.warn(`${backend} backend not yet implemented`);
          break;
        default:
          this.logger.warn(`Unknown aggregation backend: ${backend}`);
      }
    }
  }

  private async initializeElasticsearch(): Promise<void> {
    if (!this.config.aggregation.elasticsearch) {
      return;
    }

    try {
      const clientConfig: any = {
        nodes: this.config.aggregation.elasticsearch.hosts,
      };

      if (
        this.config.aggregation.elasticsearch.username &&
        this.config.aggregation.elasticsearch.password
      ) {
        clientConfig.auth = {
          username: this.config.aggregation.elasticsearch.username,
          password: this.config.aggregation.elasticsearch.password,
        };
      }

      this.elasticsearchClient = new ElasticsearchClient(clientConfig);

      // Test connection
      await this.elasticsearchClient.ping();

      // Create index if it doesn't exist
      await this.createElasticsearchIndex();

      this.logger.log('Elasticsearch client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Elasticsearch client', error);
      this.elasticsearchClient = undefined;
    }
  }

  private async createElasticsearchIndex(): Promise<void> {
    if (!this.elasticsearchClient || !this.config.aggregation.elasticsearch) {
      return;
    }

    const indexName = this.config.aggregation.elasticsearch.index;

    try {
      const exists = await this.elasticsearchClient.indices.exists({
        index: indexName,
      });

      if (!exists) {
        await this.elasticsearchClient.indices.create({
          index: indexName,
          mappings: {
            properties: {
              id: { type: 'keyword' },
              timestamp: { type: 'date' },
              eventType: { type: 'keyword' },
              severity: { type: 'keyword' },
              category: { type: 'keyword' },
              message: { type: 'text' },
              sourceIp: { type: 'ip' },
              userId: { type: 'keyword' },
              username: { type: 'keyword' },
              userRole: { type: 'keyword' },
              country: { type: 'keyword' },
              region: { type: 'keyword' },
              city: { type: 'keyword' },
              requestMethod: { type: 'keyword' },
              requestPath: { type: 'text' },
              userAgent: { type: 'text' },
              correlationId: { type: 'keyword' },
              acknowledged: { type: 'boolean' },
              resolved: { type: 'boolean' },
              metadata: { type: 'object' },
            },
          },
          settings: {
            number_of_shards: 1,
            number_of_replicas: 0,
            'index.lifecycle.name': 'security-logs-policy',
            'index.lifecycle.rollover_alias': 'security-logs',
          },
        });

        this.logger.log(`Elasticsearch index '${indexName}' created`);
      }
    } catch (error) {
      this.logger.error(
        `Error creating Elasticsearch index '${indexName}'`,
        error
      );
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

    for (const backend of this.config.aggregation.backends) {
      switch (backend) {
        case 'ELASTICSEARCH':
          flushPromises.push(this.flushToElasticsearch(logsToFlush));
          break;
        case 'CUSTOM':
          flushPromises.push(this.flushToCustomBackend(logsToFlush));
          break;
        default:
          break;
      }
    }

    try {
      await Promise.allSettled(flushPromises);
      this.logger.debug(
        `Flushed ${logsToFlush.length} logs to aggregation backends`
      );
    } catch (error) {
      this.logger.error('Error flushing logs to aggregation backends', error);
      // Re-add logs to buffer for retry
      this.aggregationBuffer.unshift(...logsToFlush);
    }
  }

  private async flushToElasticsearch(logs: SecurityAuditLog[]): Promise<void> {
    if (!this.elasticsearchClient || !this.config.aggregation.elasticsearch) {
      return;
    }

    try {
      const body = logs.flatMap((log) => [
        {
          index: {
            _index:
              this.config.aggregation.elasticsearch?.index || 'security-logs',
            _id: log.id,
          },
        },
        {
          ...log,
          '@timestamp': log.timestamp.toISOString(),
        },
      ]);

      await this.elasticsearchClient.bulk({
        operations: body,
      });
      this.logger.debug(
        `Successfully sent ${logs.length} logs to Elasticsearch`
      );
    } catch (error) {
      this.logger.error('Error sending logs to Elasticsearch', error);
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
            body: JSON.stringify({ logs }),
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

  /**
   * Query aggregated security metrics
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
      if (this.elasticsearchClient && this.config.aggregation.elasticsearch) {
        await this.queryElasticsearchMetrics(metrics, startTime, endTime);
      } else {
        // Fallback to in-memory aggregation if no backend is available
        this.logger.debug(
          'No aggregation backend available, returning empty metrics'
        );
      }
    } catch (error) {
      this.logger.error('Error querying security metrics', error);
    }

    return metrics;
  }

  private async queryElasticsearchMetrics(
    metrics: SecurityMetrics,
    startTime: Date,
    endTime: Date
  ): Promise<void> {
    if (!this.elasticsearchClient || !this.config.aggregation.elasticsearch) {
      return;
    }

    try {
      const response = await this.elasticsearchClient.search({
        index: this.config.aggregation.elasticsearch.index,
        query: {
          range: {
            timestamp: {
              gte: startTime.toISOString(),
              lte: endTime.toISOString(),
            },
          },
        },
        aggs: {
          event_types: {
            terms: { field: 'eventType', size: 50 },
          },
          severities: {
            terms: { field: 'severity', size: 10 },
          },
          countries: {
            terms: { field: 'country', size: 20 },
          },
          unique_users: {
            cardinality: { field: 'userId' },
          },
          unique_ips: {
            cardinality: { field: 'sourceIp' },
          },
          login_events: {
            filter: {
              terms: {
                eventType: [
                  SecurityEventType.LOGIN_SUCCESS,
                  SecurityEventType.LOGIN_FAILURE,
                ],
              },
            },
            aggs: {
              login_types: {
                terms: { field: 'eventType' },
              },
            },
          },
        },
        size: 0,
      });

      // Process aggregation results
      const aggs = response.aggregations as any;

      // Event counts by type
      if (aggs?.event_types?.buckets) {
        for (const bucket of aggs.event_types.buckets) {
          metrics.eventCounts[bucket.key as SecurityEventType] =
            bucket.doc_count;
        }
      }

      // Severity counts
      if (aggs?.severities?.buckets) {
        for (const bucket of aggs.severities.buckets) {
          metrics.severityCounts[bucket.key as SecurityEventSeverity] =
            bucket.doc_count;
        }
      }

      // Country distribution
      if (aggs?.countries?.buckets) {
        metrics.topCountries = aggs.countries.buckets.map((bucket: any) => ({
          country: bucket.key,
          count: bucket.doc_count,
        }));
      }

      // Unique users
      if (aggs?.unique_users?.value) {
        metrics.uniqueUsers = aggs.unique_users.value;
      }

      // Login metrics
      if (aggs?.login_events?.login_types?.buckets) {
        for (const bucket of aggs.login_events.login_types.buckets) {
          if (bucket.key === SecurityEventType.LOGIN_SUCCESS) {
            metrics.successfulLogins = bucket.doc_count;
          } else if (bucket.key === SecurityEventType.LOGIN_FAILURE) {
            metrics.failedLogins = bucket.doc_count;
          }
        }
        metrics.totalLogins = metrics.successfulLogins + metrics.failedLogins;
      }

      // Rate limiting metrics
      metrics.rateLimitHits =
        metrics.eventCounts[SecurityEventType.RATE_LIMIT_EXCEEDED] || 0;
      metrics.rateLimitBlocks =
        metrics.eventCounts[SecurityEventType.BURST_LIMIT_EXCEEDED] || 0;

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
    } catch (error) {
      this.logger.error('Error querying Elasticsearch for metrics', error);
    }
  }

  /**
   * Get aggregated data for time series visualization
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

    if (!this.elasticsearchClient || !this.config.aggregation.elasticsearch) {
      return result;
    }

    try {
      const response = await this.elasticsearchClient.search({
        index: this.config.aggregation.elasticsearch.index,
        query: {
          range: {
            timestamp: {
              gte: startTime.toISOString(),
              lte: endTime.toISOString(),
            },
          },
        },
        aggs: {
          events_over_time: {
            date_histogram: {
              field: 'timestamp',
              fixed_interval: interval,
            },
            aggs: {
              event_types: {
                terms: { field: 'eventType', size: 50 },
              },
              severities: {
                terms: { field: 'severity', size: 10 },
              },
            },
          },
        },
        size: 0,
      });

      const buckets =
        (response.aggregations as any)?.events_over_time?.buckets || [];

      for (const bucket of buckets) {
        const timestamp = new Date(bucket.key);

        // Process event types
        if (bucket.event_types?.buckets) {
          for (const eventBucket of bucket.event_types.buckets) {
            result.eventTimeSeries.push({
              timestamp,
              eventType: eventBucket.key as SecurityEventType,
              count: eventBucket.doc_count,
            });
          }
        }

        // Process severities
        if (bucket.severities?.buckets) {
          for (const severityBucket of bucket.severities.buckets) {
            result.severityTimeSeries.push({
              timestamp,
              severity: severityBucket.key as SecurityEventSeverity,
              count: severityBucket.doc_count,
            });
          }
        }
      }
    } catch (error) {
      this.logger.error('Error querying time series data', error);
    }

    return result;
  }

  /**
   * Search aggregated logs with advanced filters
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

    if (!this.elasticsearchClient || !this.config.aggregation.elasticsearch) {
      return result;
    }

    try {
      const query: any = {
        bool: {
          must: [],
          filter: [],
        },
      };

      // Text search
      if (filters.query) {
        query.bool.must.push({
          multi_match: {
            query: filters.query,
            fields: ['message', 'userAgent', 'requestPath'],
          },
        });
      }

      // Event types filter
      if (filters.eventTypes && filters.eventTypes.length > 0) {
        query.bool.filter.push({
          terms: { eventType: filters.eventTypes },
        });
      }

      // Severities filter
      if (filters.severities && filters.severities.length > 0) {
        query.bool.filter.push({
          terms: { severity: filters.severities },
        });
      }

      // Time range filter
      if (filters.startTime || filters.endTime) {
        const timeRange: any = {};
        if (filters.startTime) {
          timeRange.gte = filters.startTime.toISOString();
        }
        if (filters.endTime) {
          timeRange.lte = filters.endTime.toISOString();
        }
        query.bool.filter.push({
          range: { timestamp: timeRange },
        });
      }

      // Source IP filter
      if (filters.sourceIp) {
        query.bool.filter.push({
          term: { sourceIp: filters.sourceIp },
        });
      }

      // User ID filter
      if (filters.userId) {
        query.bool.filter.push({
          term: { userId: filters.userId },
        });
      }

      // Country filter
      if (filters.country) {
        query.bool.filter.push({
          term: { country: filters.country },
        });
      }

      const response = await this.elasticsearchClient.search({
        index: this.config.aggregation.elasticsearch.index,
        query,
        sort: [{ timestamp: { order: 'desc' } }],
        from: filters.offset || 0,
        size: filters.limit || 100,
      });

      result.total =
        (response.hits.total as any)?.value || response.hits.hits.length;
      result.logs = response.hits.hits.map((hit: any) => ({
        ...hit._source,
        timestamp: new Date(hit._source.timestamp),
      }));
    } catch (error) {
      this.logger.error('Error searching aggregated logs', error);
    }

    return result;
  }
}
