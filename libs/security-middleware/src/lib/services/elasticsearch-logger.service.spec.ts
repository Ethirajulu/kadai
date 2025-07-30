import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ElasticsearchLoggerService } from './elasticsearch-logger.service';
import {
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityAuditLog,
} from '../types/security.types';

// Mock Elasticsearch client
const mockElasticsearchClient = {
  cluster: {
    health: jest.fn(),
  },
  indices: {
    putIndexTemplate: jest.fn(),
  },
  bulk: jest.fn(),
  search: jest.fn(),
  index: jest.fn(),
  close: jest.fn(),
};

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => mockElasticsearchClient),
}));

// Mock winston
const mockWinstonLogger = {
  info: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
};

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockWinstonLogger),
  format: {
    combine: jest.fn(() => 'combined-format'),
    timestamp: jest.fn(() => 'timestamp-format'),
    errors: jest.fn(() => 'errors-format'),
    json: jest.fn(() => 'json-format'),
    colorize: jest.fn(() => 'colorize-format'),
    simple: jest.fn(() => 'simple-format'),
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn(),
  },
}));

describe('ElasticsearchLoggerService', () => {
  let service: ElasticsearchLoggerService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'security.monitoring.elasticsearch.enabled': true,
        'security.monitoring.elasticsearch.node': 'http://localhost:9200',
        'security.monitoring.elasticsearch.indices.security': 'test-security',
        'security.monitoring.elasticsearch.indices.alerts': 'test-alerts',
        'security.monitoring.elasticsearch.indices.metrics': 'test-metrics',
        'security.monitoring.elasticsearch.batchSize': 10,
        'security.monitoring.elasticsearch.flushInterval': 1,
        'security.monitoring.elasticsearch.maxRetries': 3,
        'security.monitoring.elasticsearch.requestTimeout': 5000,
        'LOG_LEVEL': 'debug',
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    
    // Reset config to default state
    mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'security.monitoring.elasticsearch.enabled': true,
        'security.monitoring.elasticsearch.node': 'http://localhost:9200',
        'security.monitoring.elasticsearch.indices.security': 'test-security',
        'security.monitoring.elasticsearch.indices.alerts': 'test-alerts',
        'security.monitoring.elasticsearch.indices.metrics': 'test-metrics',
        'security.monitoring.elasticsearch.batchSize': 10,
        'security.monitoring.elasticsearch.flushInterval': 1,
        'security.monitoring.elasticsearch.maxRetries': 3,
        'security.monitoring.elasticsearch.requestTimeout': 5000,
        'LOG_LEVEL': 'debug',
      };
      return config[key] ?? defaultValue;
    });
    
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ElasticsearchLoggerService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ElasticsearchLoggerService>(ElasticsearchLoggerService);
    configService = module.get<ConfigService>(ConfigService);

    // Mock cluster health response
    mockElasticsearchClient.cluster.health.mockResolvedValue({
      status: 'green',
      cluster_name: 'test-cluster',
      number_of_nodes: 1,
    });

    // Mock successful template creation
    mockElasticsearchClient.indices.putIndexTemplate.mockResolvedValue({});
  });

  describe('onModuleInit', () => {
    it('should initialize when enabled', async () => {
      await service.onModuleInit();
      
      expect(mockElasticsearchClient.cluster.health).toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.putIndexTemplate).toHaveBeenCalledTimes(2);
      expect(mockWinstonLogger.info).toHaveBeenCalledWith(
        'Elasticsearch connection established',
        expect.objectContaining({
          node: 'http://localhost:9200',
          clusterName: 'test-cluster',
        })
      );
    });

    it('should not initialize when disabled', async () => {
      // Clear any previous calls
      jest.clearAllMocks();
      
      // Create a new config service with elasticsearch disabled
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          const config: Record<string, any> = {
            'security.monitoring.elasticsearch.enabled': false,
            'security.monitoring.elasticsearch.node': 'http://localhost:9200',
            'security.monitoring.elasticsearch.indices.security': 'test-security',
            'security.monitoring.elasticsearch.indices.alerts': 'test-alerts',
            'security.monitoring.elasticsearch.indices.metrics': 'test-metrics',
            'security.monitoring.elasticsearch.batchSize': 10,
            'security.monitoring.elasticsearch.flushInterval': 1,
            'security.monitoring.elasticsearch.maxRetries': 3,
            'security.monitoring.elasticsearch.requestTimeout': 5000,
            'LOG_LEVEL': 'debug',
          };
          return config[key] ?? defaultValue;
        }),
      };

      const disabledService = new ElasticsearchLoggerService(disabledConfigService as any);
      await disabledService.onModuleInit();
      
      expect(mockElasticsearchClient.cluster.health).not.toHaveBeenCalled();
    });

    it('should handle connection errors', async () => {
      mockElasticsearchClient.cluster.health.mockRejectedValue(
        new Error('Connection failed')
      );

      await expect(service.onModuleInit()).rejects.toThrow('Connection failed');
      // The winston logger is created internally, so we can't easily test its calls
      // But we can verify that the error was thrown properly
    });
  });

  describe('logSecurityEvent', () => {
    const mockAuditLog: SecurityAuditLog = {
      id: 'test-id',
      timestamp: new Date('2024-01-01T00:00:00Z'),
      eventType: SecurityEventType.LOGIN_SUCCESS,
      severity: SecurityEventSeverity.LOW,
      category: SecurityEventCategory.AUTHENTICATION,
      message: 'Test login success',
      sourceIp: '192.168.1.1',
      userId: 'user-123',
      username: 'testuser',
      acknowledged: false,
      resolved: false,
    };

    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should log security event and add to buffer', async () => {
      await service.logSecurityEvent(mockAuditLog);

      // Buffer should contain the event
      const healthStatus = service.getHealthStatus();
      expect(healthStatus.bufferSize).toBe(1);
    });

    it('should immediately flush critical events', async () => {
      const criticalEvent = {
        ...mockAuditLog,
        severity: SecurityEventSeverity.CRITICAL,
      };

      mockElasticsearchClient.bulk.mockResolvedValue({
        took: 10,
        errors: false,
        items: [{ index: { _id: 'test-id', status: 201 } }],
      });

      await service.logSecurityEvent(criticalEvent);

      expect(mockElasticsearchClient.bulk).toHaveBeenCalled();
    });

    it('should flush when buffer is full', async () => {
      mockElasticsearchClient.bulk.mockResolvedValue({
        took: 10,
        errors: false,
        items: [],
      });

      // Fill buffer to trigger flush (batchSize is 10)
      for (let i = 0; i < 10; i++) {
        await service.logSecurityEvent({
          ...mockAuditLog,
          id: `test-id-${i}`,
        });
      }

      expect(mockElasticsearchClient.bulk).toHaveBeenCalled();
    });

    it('should handle disabled service', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.elasticsearch.enabled') {
          return false;
        }
        return defaultValue;
      });

      const newService = new ElasticsearchLoggerService(configService);
      await newService.logSecurityEvent(mockAuditLog);

      // Should not attempt to flush
      expect(mockElasticsearchClient.bulk).not.toHaveBeenCalled();
    });
  });

  describe('searchSecurityLogs', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should search security logs with basic query', async () => {
      const mockSearchResponse = {
        took: 5,
        hits: {
          total: { value: 1 },
          hits: [
            {
              _source: {
                id: 'test-id',
                timestamp: '2024-01-01T00:00:00Z',
                eventType: SecurityEventType.LOGIN_SUCCESS,
                severity: SecurityEventSeverity.LOW,
                message: 'Test event',
              },
            },
          ],
        },
      };

      mockElasticsearchClient.search.mockResolvedValue(mockSearchResponse);

      const result = await service.searchSecurityLogs({
        eventTypes: [SecurityEventType.LOGIN_SUCCESS],
        size: 100,
      });

      expect(result.hits).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.took).toBe(5);
      expect(result.hits[0].eventType).toBe(SecurityEventType.LOGIN_SUCCESS);
    });

    it('should search with time range filter', async () => {
      const startTime = new Date('2024-01-01T00:00:00Z');
      const endTime = new Date('2024-01-02T00:00:00Z');

      mockElasticsearchClient.search.mockResolvedValue({
        took: 5,
        hits: { total: { value: 0 }, hits: [] },
      });

      await service.searchSecurityLogs({
        startTime,
        endTime,
      });

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'test-security-*',
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              filter: expect.arrayContaining([
                {
                  range: {
                    timestamp: {
                      gte: startTime.toISOString(),
                      lte: endTime.toISOString(),
                    },
                  },
                },
              ]),
            }),
          }),
        }),
      });
    });

    it('should search with text query', async () => {
      mockElasticsearchClient.search.mockResolvedValue({
        took: 5,
        hits: { total: { value: 0 }, hits: [] },
      });

      await service.searchSecurityLogs({
        textQuery: 'login failed',
      });

      expect(mockElasticsearchClient.search).toHaveBeenCalledWith({
        index: 'test-security-*',
        body: expect.objectContaining({
          query: expect.objectContaining({
            bool: expect.objectContaining({
              must: expect.arrayContaining([
                {
                  multi_match: {
                    query: 'login failed',
                    fields: ['message', 'userAgent', 'requestPath', 'errorDetails'],
                    type: 'best_fields',
                    fuzziness: 'AUTO',
                  },
                },
              ]),
            }),
          }),
        }),
      });
    });

    it('should handle search errors', async () => {
      mockElasticsearchClient.search.mockRejectedValue(
        new Error('Search failed')
      );

      await expect(
        service.searchSecurityLogs({ size: 100 })
      ).rejects.toThrow('Search failed');
    });
  });

  describe('getSecurityMetricsAggregation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should get security metrics aggregation', async () => {
      const mockAggregationResponse = {
        aggregations: {
          event_types: {
            buckets: [
              { key: SecurityEventType.LOGIN_SUCCESS, doc_count: 10 },
              { key: SecurityEventType.LOGIN_FAILURE, doc_count: 5 },
            ],
          },
          severities: {
            buckets: [
              { key: SecurityEventSeverity.LOW, doc_count: 8 },
              { key: SecurityEventSeverity.HIGH, doc_count: 2 },
            ],
          },
          time_histogram: {
            buckets: [
              { key_as_string: '2024-01-01T00:00:00Z', doc_count: 15 },
            ],
          },
          top_source_ips: {
            buckets: [
              { key: '192.168.1.1', doc_count: 12 },
            ],
          },
          top_users: {
            buckets: [
              { key: 'user-123', doc_count: 10 },
            ],
          },
        },
      };

      mockElasticsearchClient.search.mockResolvedValue(mockAggregationResponse);

      const result = await service.getSecurityMetricsAggregation(60);

      expect(result.eventTypeAggregation).toEqual({
        [SecurityEventType.LOGIN_SUCCESS]: 10,
        [SecurityEventType.LOGIN_FAILURE]: 5,
      });
      expect(result.severityAggregation).toEqual({
        [SecurityEventSeverity.LOW]: 8,
        [SecurityEventSeverity.HIGH]: 2,
      });
      expect(result.timeHistogram).toEqual([
        { key: '2024-01-01T00:00:00Z', doc_count: 15 },
      ]);
      expect(result.topSourceIPs).toEqual([
        { key: '192.168.1.1', doc_count: 12 },
      ]);
      expect(result.topUsers).toEqual([
        { key: 'user-123', doc_count: 10 },
      ]);
    });

    it('should handle aggregation errors', async () => {
      mockElasticsearchClient.search.mockRejectedValue(
        new Error('Aggregation failed')
      );

      await expect(
        service.getSecurityMetricsAggregation(60)
      ).rejects.toThrow('Aggregation failed');
    });
  });

  describe('indexSecurityAlert', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should index security alert', async () => {
      const mockAlert = {
        id: 'alert-123',
        timestamp: new Date('2024-01-01T00:00:00Z'),
        title: 'Test Alert',
        severity: SecurityEventSeverity.HIGH,
      };

      mockElasticsearchClient.index.mockResolvedValue({
        _id: 'alert-123',
        result: 'created',
      });

      await service.indexSecurityAlert(mockAlert);

      expect(mockElasticsearchClient.index).toHaveBeenCalledWith({
        index: expect.stringMatching(/^test-alerts-\d{4}\.\d{2}\.\d{2}$/),
        id: 'alert-123',
        body: expect.objectContaining({
          '@timestamp': expect.any(String),
          id: 'alert-123',
          title: 'Test Alert',
          severity: SecurityEventSeverity.HIGH,
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      });

      // Verify the alert was indexed successfully
      expect(mockElasticsearchClient.index).toHaveBeenCalled();
    });

    it('should handle indexing errors', async () => {
      const mockAlert = {
        id: 'alert-123',
        timestamp: new Date(),
        title: 'Test Alert',
        severity: SecurityEventSeverity.HIGH,
      };

      mockElasticsearchClient.index.mockRejectedValue(
        new Error('Indexing failed')
      );

      await service.indexSecurityAlert(mockAlert);

      // Error should not cause the method to throw
      // The service handles errors internally
    });

    it('should not index when disabled', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.elasticsearch.enabled') {
          return false;
        }
        return defaultValue;
      });

      const newService = new ElasticsearchLoggerService(configService);
      const mockAlert = {
        id: 'alert-123',
        timestamp: new Date(),
        title: 'Test Alert',
        severity: SecurityEventSeverity.HIGH,
      };

      await newService.indexSecurityAlert(mockAlert);

      expect(mockElasticsearchClient.index).not.toHaveBeenCalled();
    });
  });

  describe('getHealthStatus', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return health status', () => {
      const healthStatus = service.getHealthStatus();

      expect(healthStatus).toEqual({
        elasticsearch: true,
        winston: true,
        bufferSize: expect.any(Number),
        config: expect.objectContaining({
          enabled: true,
          node: 'http://localhost:9200',
          indices: expect.objectContaining({
            security: 'test-security',
            alerts: 'test-alerts',
            metrics: 'test-metrics',
          }),
        }),
      });
    });
  });

  describe('onModuleDestroy', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should cleanup resources on destroy', async () => {
      // Add some events to buffer
      await service.logSecurityEvent({
        id: 'test-id',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Test event',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      });

      mockElasticsearchClient.bulk.mockResolvedValue({
        took: 10,
        errors: false,
        items: [{ index: { _id: 'test-id', status: 201 } }],
      });

      await service.onModuleDestroy();

      // Should flush remaining logs and close connection
      expect(mockElasticsearchClient.bulk).toHaveBeenCalled();
      expect(mockElasticsearchClient.close).toHaveBeenCalled();
    });

    it('should handle cleanup errors gracefully', async () => {
      mockElasticsearchClient.close.mockRejectedValue(
        new Error('Close failed')
      );

      await service.onModuleDestroy();

      // Error should not cause the method to throw
      // The service handles errors internally
    });
  });
});