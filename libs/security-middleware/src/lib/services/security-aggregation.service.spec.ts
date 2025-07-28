import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SecurityAggregationService } from './security-aggregation.service';
import {
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityAuditLog,
} from '../types/security.types';

// Mock Elasticsearch client
const mockElasticsearchClient = {
  ping: jest.fn().mockResolvedValue({}),
  close: jest.fn().mockResolvedValue({}),
  indices: {
    exists: jest.fn().mockResolvedValue(false),
    create: jest.fn().mockResolvedValue({}),
  },
  bulk: jest.fn().mockResolvedValue({
    errors: false,
    items: [],
  }),
  search: jest.fn().mockResolvedValue({
    hits: {
      total: { value: 0 },
      hits: [],
    },
    aggregations: {},
  }),
};

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn().mockImplementation(() => mockElasticsearchClient),
}));

// Mock fetch for custom backend
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  status: 200,
  statusText: 'OK',
}) as jest.Mock;

describe('SecurityAggregationService', () => {
  let service: SecurityAggregationService;
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityAggregationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config: Record<string, any> = {
                'security.monitoring.audit.enabled': true,
                'security.monitoring.audit.logLevel': 'INFO',
                'security.monitoring.audit.batchSize': 100,
                'security.monitoring.audit.flushInterval': 10,
                'security.monitoring.aggregation.enabled': true,
                'security.monitoring.aggregation.backends': ['ELASTICSEARCH'],
                'security.monitoring.aggregation.elasticsearch.hosts': 'http://localhost:9200',
                'security.monitoring.aggregation.elasticsearch.index': 'security-logs-test',
                'security.monitoring.aggregation.custom.endpoint': 'https://custom.example.com',
                'security.monitoring.aggregation.custom.batchSize': 100,
                'security.monitoring.aggregation.custom.retryConfig.maxRetries': 3,
                'security.monitoring.aggregation.custom.retryConfig.backoffFactor': 2,
                'security.monitoring.dashboard.enabled': true,
                'security.monitoring.dashboard.refreshInterval': 30,
                'security.monitoring.dashboard.historicalDataDays': 7,
                'security.monitoring.dashboard.maxEventsPerQuery': 1000,
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
        {
          provide: EventEmitter2,
          useValue: {
            on: jest.fn(),
            emit: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<SecurityAggregationService>(SecurityAggregationService);
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);

    // Reset mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize Elasticsearch backend when enabled', async () => {
      await service.onModuleInit();
      
      expect(mockElasticsearchClient.ping).toHaveBeenCalled();
      expect(mockElasticsearchClient.indices.exists).toHaveBeenCalled();
      expect(eventEmitter.on).toHaveBeenCalledWith('security.audit.logged', expect.any(Function));
    });

    it('should create Elasticsearch index if it does not exist', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(false);
      
      await service.onModuleInit();
      
      expect(mockElasticsearchClient.indices.create).toHaveBeenCalledWith({
        index: 'security-logs-test',
        mappings: expect.any(Object),
        settings: expect.any(Object),
      });
    });

    it('should not create index if it already exists', async () => {
      mockElasticsearchClient.indices.exists.mockResolvedValue(true);
      
      await service.onModuleInit();
      
      expect(mockElasticsearchClient.indices.create).not.toHaveBeenCalled();
    });

    it('should not initialize when aggregation is disabled', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.aggregation.enabled') {
          return false;
        }
        return defaultValue;
      });

      const testService = new SecurityAggregationService(configService, eventEmitter);
      await testService.onModuleInit();
      
      expect(mockElasticsearchClient.ping).not.toHaveBeenCalled();
    });

    it('should handle Elasticsearch connection errors gracefully', async () => {
      mockElasticsearchClient.ping.mockRejectedValue(new Error('Connection failed'));
      
      await service.onModuleInit();
      
      // Should not throw, but log error
      expect(mockElasticsearchClient.ping).toHaveBeenCalled();
    });
  });

  describe('custom backend initialization', () => {
    beforeEach(() => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'security.monitoring.aggregation.enabled': true,
          'security.monitoring.aggregation.backends': ['CUSTOM'],
          'security.monitoring.aggregation.custom.endpoint': 'https://custom.example.com',
        };
        return config[key] ?? defaultValue;
      });
    });

    it('should initialize custom backend', async () => {
      await service.onModuleInit();
      
      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.example.com/health',
        expect.objectContaining({
          method: 'GET',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('should handle custom backend initialization errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));
      
      await service.onModuleInit();
      
      // Should not throw
      expect(global.fetch).toHaveBeenCalled();
    });
  });

  describe('log aggregation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should aggregate audit logs to Elasticsearch', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'User login successful',
        sourceIp: '192.168.1.1',
        userId: 'user-123',
        acknowledged: false,
        resolved: false,
      };

      // Get the event handler and trigger it
      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Add multiple logs to trigger batch flush
      for (let i = 0; i < 101; i++) {
        await eventHandler({ ...mockAuditLog, id: `log-${i}` });
      }

      expect(mockElasticsearchClient.bulk).toHaveBeenCalled();
      
      const bulkCall = mockElasticsearchClient.bulk.mock.calls[0][0];
      expect(bulkCall.operations).toHaveLength(200); // 100 logs * 2 (index + document)
    });

    it('should handle Elasticsearch bulk errors gracefully', async () => {
      mockElasticsearchClient.bulk.mockRejectedValue(new Error('Bulk operation failed'));

      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'User login successful',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Should not throw
      await expect(eventHandler(mockAuditLog)).resolves.toBeUndefined();
    });
  });

  describe('custom backend aggregation', () => {
    beforeEach(async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'security.monitoring.aggregation.enabled': true,
          'security.monitoring.aggregation.backends': ['CUSTOM'],
          'security.monitoring.aggregation.custom.endpoint': 'https://custom.example.com',
          'security.monitoring.aggregation.custom.batchSize': 10,
          'security.monitoring.aggregation.custom.retryConfig.maxRetries': 2,
          'security.monitoring.aggregation.custom.retryConfig.backoffFactor': 2,
        };
        return config[key] ?? defaultValue;
      });

      const testService = new SecurityAggregationService(configService, eventEmitter);
      await testService.onModuleInit();
      service = testService;
    });

    it('should send logs to custom backend', async () => {
      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'User login successful',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls.find(
        call => call[0] === 'security.audit.logged'
      )[1];
      
      // Add enough logs to trigger batch flush
      for (let i = 0; i < 11; i++) {
        await eventHandler({ ...mockAuditLog, id: `log-${i}` });
      }

      expect(global.fetch).toHaveBeenCalledWith(
        'https://custom.example.com/logs',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
          body: expect.stringContaining('logs'),
        })
      );
    });

    it('should retry failed requests to custom backend', async () => {
      (global.fetch as jest.Mock)
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue({ ok: true });

      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'User login successful',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls.find(
        call => call[0] === 'security.audit.logged'
      )[1];
      
      // Add enough logs to trigger batch flush
      for (let i = 0; i < 11; i++) {
        await eventHandler({ ...mockAuditLog, id: `log-${i}` });
      }

      // Should have made 3 attempts (1 + 2 retries)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });

    it('should give up after max retries', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Persistent network error'));

      const mockAuditLog: SecurityAuditLog = {
        id: 'log-123',
        timestamp: new Date(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'User login successful',
        sourceIp: '192.168.1.1',
        acknowledged: false,
        resolved: false,
      };

      const eventHandler = (eventEmitter.on as jest.Mock).mock.calls.find(
        call => call[0] === 'security.audit.logged'
      )[1];
      
      // Add enough logs to trigger batch flush
      for (let i = 0; i < 11; i++) {
        await eventHandler({ ...mockAuditLog, id: `log-${i}` });
      }

      // Should have made max attempts (1 + 2 retries = 3)
      expect(global.fetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('security metrics', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return security metrics from Elasticsearch', async () => {
      const mockAggregations = {
        event_types: {
          buckets: [
            { key: SecurityEventType.LOGIN_SUCCESS, doc_count: 10 },
            { key: SecurityEventType.LOGIN_FAILURE, doc_count: 5 },
          ],
        },
        severities: {
          buckets: [
            { key: SecurityEventSeverity.LOW, doc_count: 8 },
            { key: SecurityEventSeverity.MEDIUM, doc_count: 7 },
          ],
        },
        countries: {
          buckets: [
            { key: 'US', doc_count: 12 },
            { key: 'IN', doc_count: 3 },
          ],
        },
        unique_users: {
          value: 25,
        },
        login_events: {
          login_types: {
            buckets: [
              { key: SecurityEventType.LOGIN_SUCCESS, doc_count: 10 },
              { key: SecurityEventType.LOGIN_FAILURE, doc_count: 5 },
            ],
          },
        },
      };

      mockElasticsearchClient.search.mockResolvedValue({
        hits: { total: { value: 15 } },
        aggregations: mockAggregations,
      });

      const metrics = await service.getSecurityMetrics(60);

      expect(metrics.eventCounts[SecurityEventType.LOGIN_SUCCESS]).toBe(10);
      expect(metrics.eventCounts[SecurityEventType.LOGIN_FAILURE]).toBe(5);
      expect(metrics.severityCounts[SecurityEventSeverity.LOW]).toBe(8);
      expect(metrics.severityCounts[SecurityEventSeverity.MEDIUM]).toBe(7);
      expect(metrics.topCountries).toEqual([
        { country: 'US', count: 12 },
        { country: 'IN', count: 3 },
      ]);
      expect(metrics.uniqueUsers).toBe(25);
      expect(metrics.totalLogins).toBe(15);
      expect(metrics.successfulLogins).toBe(10);
      expect(metrics.failedLogins).toBe(5);
    });

    it('should return empty metrics when Elasticsearch is not available', async () => {
      // Create service without Elasticsearch
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.aggregation.enabled') {
          return false;
        }
        return defaultValue;
      });

      const testService = new SecurityAggregationService(configService, eventEmitter);
      await testService.onModuleInit();

      const metrics = await testService.getSecurityMetrics(60);

      expect(metrics.totalLogins).toBe(0);
      expect(metrics.uniqueUsers).toBe(0);
      expect(metrics.topCountries).toEqual([]);
    });

    it('should handle Elasticsearch query errors gracefully', async () => {
      mockElasticsearchClient.search.mockRejectedValue(new Error('Query failed'));

      const metrics = await service.getSecurityMetrics(60);

      // Should return initialized metrics structure
      expect(metrics.totalLogins).toBe(0);
      expect(metrics.eventCounts).toBeDefined();
      expect(metrics.severityCounts).toBeDefined();
    });
  });

  describe('time series data', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return time series data for visualization', async () => {
      const mockResponse = {
        aggregations: {
          events_over_time: {
            buckets: [
              {
                key: Date.now() - 3600000, // 1 hour ago
                event_types: {
                  buckets: [
                    { key: SecurityEventType.LOGIN_SUCCESS, doc_count: 5 },
                    { key: SecurityEventType.LOGIN_FAILURE, doc_count: 2 },
                  ],
                },
                severities: {
                  buckets: [
                    { key: SecurityEventSeverity.LOW, doc_count: 4 },
                    { key: SecurityEventSeverity.MEDIUM, doc_count: 3 },
                  ],
                },
              },
              {
                key: Date.now() - 1800000, // 30 minutes ago
                event_types: {
                  buckets: [
                    { key: SecurityEventType.LOGIN_SUCCESS, doc_count: 8 },
                  ],
                },
                severities: {
                  buckets: [
                    { key: SecurityEventSeverity.LOW, doc_count: 8 },
                  ],
                },
              },
            ],
          },
        },
      };

      mockElasticsearchClient.search.mockResolvedValue(mockResponse);

      const startTime = new Date(Date.now() - 7200000); // 2 hours ago
      const endTime = new Date();

      const timeSeriesData = await service.getTimeSeriesData(startTime, endTime, '15m');

      expect(timeSeriesData.eventTimeSeries).toHaveLength(3); // 2 + 1 events
      expect(timeSeriesData.severityTimeSeries).toHaveLength(3); // 2 + 1 severities

      expect(timeSeriesData.eventTimeSeries[0]).toMatchObject({
        timestamp: expect.any(Date),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        count: 5,
      });

      expect(timeSeriesData.severityTimeSeries[0]).toMatchObject({
        timestamp: expect.any(Date),
        severity: SecurityEventSeverity.LOW,
        count: 4,
      });
    });

    it('should return empty data when Elasticsearch is not available', async () => {
      // Create service without Elasticsearch
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.aggregation.enabled') {
          return false;
        }
        return defaultValue;
      });

      const testService = new SecurityAggregationService(configService, eventEmitter);
      await testService.onModuleInit();

      const startTime = new Date(Date.now() - 3600000);
      const endTime = new Date();

      const timeSeriesData = await testService.getTimeSeriesData(startTime, endTime);

      expect(timeSeriesData.eventTimeSeries).toEqual([]);
      expect(timeSeriesData.severityTimeSeries).toEqual([]);
    });
  });

  describe('log searching', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should search logs with filters', async () => {
      const mockSearchResult = {
        hits: {
          total: { value: 2 },
          hits: [
              {
                _source: {
                  id: 'log-1',
                  timestamp: '2023-01-01T10:00:00Z',
                  eventType: SecurityEventType.LOGIN_SUCCESS,
                  severity: SecurityEventSeverity.LOW,
                  message: 'Login successful',
                  sourceIp: '192.168.1.1',
                  userId: 'user-1',
                },
              },
              {
                _source: {
                  id: 'log-2',
                  timestamp: '2023-01-01T11:00:00Z',
                  eventType: SecurityEventType.LOGIN_FAILURE,
                  severity: SecurityEventSeverity.MEDIUM,
                  message: 'Login failed',
                  sourceIp: '192.168.1.2',
                  userId: 'user-2',
                },
              },
            ],
          },
        };

      mockElasticsearchClient.search.mockResolvedValue(mockSearchResult);

      const searchResult = await service.searchLogs({
        query: 'login',
        eventTypes: [SecurityEventType.LOGIN_SUCCESS, SecurityEventType.LOGIN_FAILURE],
        severities: [SecurityEventSeverity.LOW, SecurityEventSeverity.MEDIUM],
        sourceIp: '192.168.1.1',
        limit: 10,
        offset: 0,
      });

      expect(searchResult.total).toBe(2);
      expect(searchResult.logs).toHaveLength(2);
      expect(searchResult.logs[0].id).toBe('log-1');
      expect(searchResult.logs[0].timestamp).toBeInstanceOf(Date);

      // Verify the search query was constructed correctly
      const searchCall = mockElasticsearchClient.search.mock.calls[0][0];
      expect(searchCall.query.bool.must).toHaveLength(1); // Text query
      expect(searchCall.query.bool.filter).toContainEqual({
        terms: { eventType: [SecurityEventType.LOGIN_SUCCESS, SecurityEventType.LOGIN_FAILURE] },
      });
      expect(searchCall.query.bool.filter).toContainEqual({
        terms: { severity: [SecurityEventSeverity.LOW, SecurityEventSeverity.MEDIUM] },
      });
      expect(searchCall.query.bool.filter).toContainEqual({
        term: { sourceIp: '192.168.1.1' },
      });
    });

    it('should handle search errors gracefully', async () => {
      mockElasticsearchClient.search.mockRejectedValue(new Error('Search failed'));

      const searchResult = await service.searchLogs({ query: 'test' });

      expect(searchResult.total).toBe(0);
      expect(searchResult.logs).toEqual([]);
    });

    it('should return empty results when Elasticsearch is not available', async () => {
      // Create service without Elasticsearch
      jest.spyOn(configService, 'get').mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.monitoring.aggregation.enabled') {
          return false;
        }
        return defaultValue;
      });

      const testService = new SecurityAggregationService(configService, eventEmitter);
      await testService.onModuleInit();

      const searchResult = await testService.searchLogs({ query: 'test' });

      expect(searchResult.total).toBe(0);
      expect(searchResult.logs).toEqual([]);
    });
  });
});