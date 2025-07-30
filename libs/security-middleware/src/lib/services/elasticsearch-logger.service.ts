import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';
import * as winston from 'winston';
import {
  SecurityAuditLog,
  SecurityEventType,
  SecurityEventSeverity,
} from '../types/security.types';

interface ElasticsearchConfig {
  enabled: boolean;
  node: string;
  auth?: {
    username: string;
    password: string;
  };
  apiKey?: string;
  indices: {
    security: string;
    alerts: string;
    metrics: string;
  };
  batchSize: number;
  flushInterval: number;
  maxRetries: number;
  requestTimeout: number;
}

@Injectable()
export class ElasticsearchLoggerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(ElasticsearchLoggerService.name);
  private client: Client | null = null;
  private winstonLogger!: winston.Logger;
  private config: ElasticsearchConfig;
  private logBuffer: SecurityAuditLog[] = [];
  private flushInterval: NodeJS.Timeout | null = null;
  private isHealthy = false;

  constructor(private readonly configService: ConfigService) {
    this.config = this.loadElasticsearchConfig();
    this.initializeWinstonLogger();
  }

  async onModuleInit() {
    if (this.config.enabled) {
      await this.initializeElasticsearch();
      this.startBatchProcessor();
      this.logger.log('Elasticsearch logger service initialized');
    } else {
      this.logger.warn('Elasticsearch logger service is disabled');
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

    if (this.client) {
      try {
        await this.client.close();
        this.logger.log('Elasticsearch connection closed');
      } catch (error) {
        this.logger.error('Error closing Elasticsearch connection', error);
      }
    }
  }

  private loadElasticsearchConfig(): ElasticsearchConfig {
    return {
      enabled: this.configService.get<boolean>(
        'security.monitoring.elasticsearch.enabled',
        false
      ),
      node: this.configService.get<string>(
        'security.monitoring.elasticsearch.node',
        'http://localhost:9200'
      ),
      auth: this.configService.get<string>(
        'security.monitoring.elasticsearch.auth.username'
      )
        ? {
            username: this.configService.get<string>(
              'security.monitoring.elasticsearch.auth.username',
              ''
            ),
            password: this.configService.get<string>(
              'security.monitoring.elasticsearch.auth.password',
              ''
            ),
          }
        : undefined,
      apiKey: this.configService.get<string>(
        'security.monitoring.elasticsearch.apiKey'
      ),
      indices: {
        security: this.configService.get<string>(
          'security.monitoring.elasticsearch.indices.security',
          'kadai-security-logs'
        ),
        alerts: this.configService.get<string>(
          'security.monitoring.elasticsearch.indices.alerts',
          'kadai-security-alerts'
        ),
        metrics: this.configService.get<string>(
          'security.monitoring.elasticsearch.indices.metrics',
          'kadai-security-metrics'
        ),
      },
      batchSize: this.configService.get<number>(
        'security.monitoring.elasticsearch.batchSize',
        100
      ),
      flushInterval: this.configService.get<number>(
        'security.monitoring.elasticsearch.flushInterval',
        30
      ),
      maxRetries: this.configService.get<number>(
        'security.monitoring.elasticsearch.maxRetries',
        3
      ),
      requestTimeout: this.configService.get<number>(
        'security.monitoring.elasticsearch.requestTimeout',
        30000
      ),
    };
  }

  private initializeWinstonLogger(): void {
    // Create custom format for structured JSON logging
    const customFormat = winston.format.combine(
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json()
    );

    this.winstonLogger = winston.createLogger({
      level: this.configService.get<string>('LOG_LEVEL', 'info'),
      format: customFormat,
      defaultMeta: {
        service: 'kadai-security-middleware',
        component: 'elasticsearch-logger',
      },
      transports: [
        // Console transport for development
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple()
          ),
        }),
        // File transport for audit logs
        new winston.transports.File({
          filename: 'logs/security/elasticsearch-audit.log',
          maxsize: 10 * 1024 * 1024, // 10MB
          maxFiles: 5,
          tailable: true,
        }),
        // Error-only file transport
        new winston.transports.File({
          filename: 'logs/security/elasticsearch-errors.log',
          level: 'error',
          maxsize: 10 * 1024 * 1024,
          maxFiles: 3,
        }),
      ],
      exceptionHandlers: [
        new winston.transports.File({
          filename: 'logs/security/elasticsearch-exceptions.log',
        }),
      ],
      rejectionHandlers: [
        new winston.transports.File({
          filename: 'logs/security/elasticsearch-rejections.log',
        }),
      ],
    });
  }

  private async initializeElasticsearch(): Promise<void> {
    try {
      const clientConfig: any = {
        node: this.config.node,
        requestTimeout: this.config.requestTimeout,
        maxRetries: this.config.maxRetries,
        resurrectStrategy: 'ping',
      };

      if (this.config.apiKey) {
        clientConfig.auth = {
          apiKey: this.config.apiKey,
        };
      } else if (this.config.auth) {
        clientConfig.auth = {
          username: this.config.auth.username,
          password: this.config.auth.password,
        };
      }

      this.client = new Client(clientConfig);

      // Test connection and get cluster health
      const health = await this.client.cluster.health();
      this.isHealthy = health.status !== 'red';

      this.winstonLogger.info('Elasticsearch connection established', {
        node: this.config.node,
        clusterName: health.cluster_name,
        status: health.status,
        numberOfNodes: health.number_of_nodes,
      });

      // Create index templates if they don't exist
      await this.createIndexTemplates();

      this.logger.log('Elasticsearch client initialized successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Elasticsearch', error);
      this.winstonLogger.error('Elasticsearch connection failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        node: this.config.node,
      });
      throw error;
    }
  }

  private async createIndexTemplates(): Promise<void> {
    if (!this.client) return;

    try {
      // Security logs index template
      await this.client.indices.putIndexTemplate({
        name: 'kadai-security-logs-template',
        index_patterns: [`${this.config.indices.security}-*`],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
            'index.lifecycle.name': 'kadai-security-policy',
            'index.lifecycle.rollover_alias': this.config.indices.security,
          },
          mappings: {
            properties: {
              '@timestamp': { type: 'date' },
              id: { type: 'keyword' },
              timestamp: { type: 'date' },
              eventType: { type: 'keyword' },
              severity: { type: 'keyword' },
              category: { type: 'keyword' },
              message: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 },
                },
              },
              requestId: { type: 'keyword' },
              sessionId: { type: 'keyword' },
              userId: { type: 'keyword' },
              username: { type: 'keyword' },
              userRole: { type: 'keyword' },
              sourceIp: { type: 'ip' },
              userAgent: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 },
                },
              },
              requestMethod: { type: 'keyword' },
              requestPath: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 },
                },
              },
              country: { type: 'keyword' },
              region: { type: 'keyword' },
              city: { type: 'keyword' },
              correlationId: { type: 'keyword' },
              acknowledged: { type: 'boolean' },
              resolved: { type: 'boolean' },
              metadata: { type: 'object' },
              errorDetails: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 },
                },
              },
            },
          },
        },
      });

      // Security alerts index template
      await this.client.indices.putIndexTemplate({
        name: 'kadai-security-alerts-template',
        index_patterns: [`${this.config.indices.alerts}-*`],
        template: {
          settings: {
            number_of_shards: 1,
            number_of_replicas: 1,
          },
          mappings: {
            properties: {
              '@timestamp': { type: 'date' },
              id: { type: 'keyword' },
              timestamp: { type: 'date' },
              title: {
                type: 'text',
                fields: {
                  keyword: { type: 'keyword', ignore_above: 256 },
                },
              },
              description: { type: 'text' },
              severity: { type: 'keyword' },
              category: { type: 'keyword' },
              eventType: { type: 'keyword' },
              triggerCount: { type: 'integer' },
              threshold: { type: 'integer' },
              timeWindow: { type: 'integer' },
              status: { type: 'keyword' },
              relatedEvents: { type: 'keyword' },
              correlationId: { type: 'keyword' },
              autoResponseEnabled: { type: 'boolean' },
              actionsTaken: { type: 'keyword' },
              notificationsSent: { type: 'keyword' },
              escalationLevel: { type: 'integer' },
            },
          },
        },
      });

      this.winstonLogger.info(
        'Elasticsearch index templates created successfully'
      );
    } catch (error) {
      this.winstonLogger.error(
        'Failed to create Elasticsearch index templates',
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        }
      );
    }
  }

  private startBatchProcessor(): void {
    this.flushInterval = setInterval(
      () => this.flushLogs(),
      this.config.flushInterval * 1000
    );
  }

  /**
   * Log security audit event to Elasticsearch
   */
  async logSecurityEvent(auditLog: SecurityAuditLog): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    try {
      // Add to buffer for batch processing
      this.logBuffer.push(auditLog);

      // Also log to Winston for local file backup
      this.winstonLogger.info('Security event logged', {
        eventId: auditLog.id,
        eventType: auditLog.eventType,
        severity: auditLog.severity,
        sourceIp: auditLog.sourceIp,
        userId: auditLog.userId,
        message: auditLog.message,
      });

      // Immediate flush for critical events
      if (auditLog.severity === SecurityEventSeverity.CRITICAL) {
        await this.flushLogs();
      }

      // Flush if buffer is full
      if (this.logBuffer.length >= this.config.batchSize) {
        await this.flushLogs();
      }
    } catch (error) {
      this.winstonLogger.error('Error logging security event', {
        error: error instanceof Error ? error.message : String(error),
        eventId: auditLog.id,
        eventType: auditLog.eventType,
      });
    }
  }

  /**
   * Flush buffered logs to Elasticsearch
   */
  private async flushLogs(): Promise<void> {
    if (this.logBuffer.length === 0 || !this.client) {
      return;
    }

    const logsToFlush = [...this.logBuffer];
    this.logBuffer = [];

    try {
      const body = [];
      const indexName = `${
        this.config.indices.security
      }-${this.getCurrentDateString()}`;

      for (const log of logsToFlush) {
        // Index operation
        body.push({
          index: {
            _index: indexName,
            _id: log.id,
          },
        });

        // Document
        body.push({
          '@timestamp': new Date().toISOString(),
          ...log,
          timestamp: log.timestamp.toISOString(),
        });
      }

      const response = await this.client.bulk({
        body,
        refresh: false, // Don't refresh immediately for performance
      });

      if (response.errors) {
        const errorItems = response.items.filter(
          (item: any) =>
            item.index?.error ||
            item.create?.error ||
            item.update?.error ||
            item.delete?.error
        );

        this.winstonLogger.error('Elasticsearch bulk operation had errors', {
          errorCount: errorItems.length,
          totalItems: response.items.length,
          errors: errorItems.slice(0, 5), // Log first 5 errors
        });
      }

      this.winstonLogger.debug('Security logs flushed to Elasticsearch', {
        count: logsToFlush.length,
        index: indexName,
        took: response.took,
        errors: response.errors,
      });

      this.isHealthy = true;
    } catch (error) {
      this.isHealthy = false;
      this.winstonLogger.error('Error flushing logs to Elasticsearch', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        logCount: logsToFlush.length,
      });

      // Re-add logs to buffer for retry
      this.logBuffer.unshift(...logsToFlush);
    }
  }

  /**
   * Search security logs in Elasticsearch
   */
  async searchSecurityLogs(query: {
    eventTypes?: SecurityEventType[];
    severities?: SecurityEventSeverity[];
    startTime?: Date;
    endTime?: Date;
    sourceIp?: string;
    userId?: string;
    textQuery?: string;
    size?: number;
    from?: number;
  }): Promise<{
    hits: SecurityAuditLog[];
    total: number;
    took: number;
  }> {
    if (!this.client) {
      throw new Error('Elasticsearch client not initialized');
    }

    try {
      const must: any[] = [];
      const filter: any[] = [];

      // Time range filter
      if (query.startTime || query.endTime) {
        const range: any = {};
        if (query.startTime) {
          range.gte = query.startTime.toISOString();
        }
        if (query.endTime) {
          range.lte = query.endTime.toISOString();
        }
        filter.push({ range: { timestamp: range } });
      }

      // Event types filter
      if (query.eventTypes && query.eventTypes.length > 0) {
        filter.push({ terms: { eventType: query.eventTypes } });
      }

      // Severities filter
      if (query.severities && query.severities.length > 0) {
        filter.push({ terms: { severity: query.severities } });
      }

      // Source IP filter
      if (query.sourceIp) {
        filter.push({ term: { sourceIp: query.sourceIp } });
      }

      // User ID filter
      if (query.userId) {
        filter.push({ term: { userId: query.userId } });
      }

      // Text query
      if (query.textQuery) {
        must.push({
          multi_match: {
            query: query.textQuery,
            fields: ['message', 'userAgent', 'requestPath', 'errorDetails'],
            type: 'best_fields',
            fuzziness: 'AUTO',
          },
        });
      }

      const searchBody: any = {
        query: {
          bool: {
            must: must.length > 0 ? must : [{ match_all: {} }],
            filter,
          },
        },
        sort: [{ timestamp: { order: 'desc' } }],
        size: query.size || 100,
        from: query.from || 0,
      };

      const response = await this.client.search({
        index: `${this.config.indices.security}-*`,
        body: searchBody,
      });

      const hits = response.hits.hits.map((hit: any) => {
        const source = hit._source;
        return {
          ...source,
          timestamp: new Date(source.timestamp),
        };
      });

      return {
        hits,
        total:
          typeof response.hits.total === 'number'
            ? response.hits.total
            : response.hits.total?.value || 0,
        took: response.took,
      };
    } catch (error) {
      this.winstonLogger.error(
        'Error searching security logs in Elasticsearch',
        {
          error: error instanceof Error ? error.message : String(error),
          query,
        }
      );
      throw error;
    }
  }

  /**
   * Get security metrics aggregation
   */
  async getSecurityMetricsAggregation(timeWindow = 60): Promise<{
    eventTypeAggregation: Record<string, number>;
    severityAggregation: Record<string, number>;
    timeHistogram: Array<{ key: string; doc_count: number }>;
    topSourceIPs: Array<{ key: string; doc_count: number }>;
    topUsers: Array<{ key: string; doc_count: number }>;
  }> {
    if (!this.client) {
      throw new Error('Elasticsearch client not initialized');
    }

    try {
      const endTime = new Date();
      const startTime = new Date(endTime.getTime() - timeWindow * 60 * 1000);

      const response = await this.client.search({
        index: `${this.config.indices.security}-*`,
        size: 0, // We only want aggregations
        body: {
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
              terms: {
                field: 'eventType',
                size: 50,
              },
            },
            severities: {
              terms: {
                field: 'severity',
                size: 10,
              },
            },
            time_histogram: {
              date_histogram: {
                field: 'timestamp',
                fixed_interval: '5m',
                extended_bounds: {
                  min: startTime.toISOString(),
                  max: endTime.toISOString(),
                },
              },
            },
            top_source_ips: {
              terms: {
                field: 'sourceIp',
                size: 10,
              },
            },
            top_users: {
              terms: {
                field: 'userId',
                size: 10,
              },
            },
          },
        },
      });

      const aggs = response.aggregations as any;

      return {
        eventTypeAggregation: Object.fromEntries(
          aggs?.event_types?.buckets?.map((bucket: any) => [
            bucket.key,
            bucket.doc_count,
          ]) || []
        ),
        severityAggregation: Object.fromEntries(
          aggs?.severities?.buckets?.map((bucket: any) => [
            bucket.key,
            bucket.doc_count,
          ]) || []
        ),
        timeHistogram:
          aggs?.time_histogram?.buckets?.map((bucket: any) => ({
            key: bucket.key_as_string,
            doc_count: bucket.doc_count,
          })) || [],
        topSourceIPs:
          aggs?.top_source_ips?.buckets?.map((bucket: any) => ({
            key: bucket.key,
            doc_count: bucket.doc_count,
          })) || [],
        topUsers:
          aggs?.top_users?.buckets?.map((bucket: any) => ({
            key: bucket.key,
            doc_count: bucket.doc_count,
          })) || [],
      };
    } catch (error) {
      this.winstonLogger.error('Error getting security metrics aggregation', {
        error: error instanceof Error ? error.message : String(error),
        timeWindow,
      });
      throw error;
    }
  }

  /**
   * Index security alert to Elasticsearch
   */
  async indexSecurityAlert(alert: any): Promise<void> {
    if (!this.client || !this.config.enabled) {
      return;
    }

    try {
      const indexName = `${
        this.config.indices.alerts
      }-${this.getCurrentDateString()}`;

      await this.client.index({
        index: indexName,
        id: alert.id,
        body: {
          '@timestamp': new Date().toISOString(),
          ...alert,
          timestamp: alert.timestamp.toISOString(),
        },
      });

      this.winstonLogger.info('Security alert indexed to Elasticsearch', {
        alertId: alert.id,
        severity: alert.severity,
        index: indexName,
      });
    } catch (error) {
      this.winstonLogger.error('Error indexing security alert', {
        error: error instanceof Error ? error.message : String(error),
        alertId: alert.id,
      });
    }
  }

  /**
   * Get health status
   */
  getHealthStatus(): {
    elasticsearch: boolean;
    winston: boolean;
    bufferSize: number;
    config: Partial<ElasticsearchConfig>;
  } {
    return {
      elasticsearch: this.isHealthy,
      winston: true, // Winston is always available
      bufferSize: this.logBuffer.length,
      config: {
        enabled: this.config.enabled,
        node: this.config.node,
        indices: this.config.indices,
        batchSize: this.config.batchSize,
        flushInterval: this.config.flushInterval,
      },
    };
  }

  private getCurrentDateString(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}.${month}.${day}`;
  }
}
