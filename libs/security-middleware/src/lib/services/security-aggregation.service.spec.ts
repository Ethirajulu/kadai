import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { promises as fs } from 'fs';
import { SecurityAggregationService } from './security-aggregation.service';
import {
  SecurityEventType,
  SecurityEventSeverity,
  SecurityEventCategory,
  SecurityAuditLog,
} from '../types/security.types';

// Completely mock the fs module to prevent real file operations
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    readdir: jest.fn().mockResolvedValue([]),
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn().mockResolvedValue(undefined),
    appendFile: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ 
      mtime: new Date(),
      isFile: () => true,
      isDirectory: () => false,
      size: 1024
    }),
    unlink: jest.fn().mockResolvedValue(undefined),
    access: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock fetch completely
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

describe('SecurityAggregationService', () => {
  let service: SecurityAggregationService;
  let configService: ConfigService;
  let eventEmitter: EventEmitter2;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'security.monitoring.audit.enabled': true,
        'security.monitoring.audit.logLevel': 'INFO',
        'security.monitoring.audit.batchSize': 100,
        'security.monitoring.audit.flushInterval': 10,
        'security.monitoring.audit.retentionDays': 30,
        'security.monitoring.aggregation.enabled': true,
        'security.monitoring.aggregation.backends': ['FILE'],
        'security.monitoring.logDirectory': '/tmp/test-security-logs',
        'security.monitoring.aggregation.webhook.url': 'https://webhook.example.com',
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
  };

  const mockEventEmitter = {
    on: jest.fn(),
    emit: jest.fn(),
  };

  beforeEach(async () => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Reset fs mocks
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
    (fs.readdir as jest.Mock).mockResolvedValue([]);
    (fs.readFile as jest.Mock).mockResolvedValue('');
    (fs.appendFile as jest.Mock).mockResolvedValue(undefined);
    (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
    (fs.stat as jest.Mock).mockResolvedValue({ 
      mtime: new Date(),
      isFile: () => true,
      isDirectory: () => false,
      size: 1024
    });
    (fs.unlink as jest.Mock).mockResolvedValue(undefined);
    (fs.access as jest.Mock).mockResolvedValue(undefined);
    
    // Reset fetch mock
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: jest.fn().mockResolvedValue({}),
      text: jest.fn().mockResolvedValue(''),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SecurityAggregationService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
      ],
    }).compile();

    service = module.get<SecurityAggregationService>(SecurityAggregationService);
    configService = module.get<ConfigService>(ConfigService);
    eventEmitter = module.get<EventEmitter2>(EventEmitter2);
  });

  afterEach(async () => {
    try {
      await service.onModuleDestroy();
    } catch (error) {
      // Ignore cleanup errors in tests
    }
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize file system when enabled', async () => {
      await service.onModuleInit();
      
      expect(fs.mkdir).toHaveBeenCalledWith('/tmp/test-security-logs', { recursive: true });
      expect(mockEventEmitter.on).toHaveBeenCalledWith('security.audit.logged', expect.any(Function));
    });

    it('should load recent logs into memory during initialization', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['security-logs-2023-01-01.jsonl']);
      (fs.readFile as jest.Mock).mockResolvedValue(JSON.stringify({
        id: 'test-log',
        timestamp: new Date().toISOString(),
        eventType: SecurityEventType.LOGIN_SUCCESS,
        severity: SecurityEventSeverity.LOW,
        category: SecurityEventCategory.AUTHENTICATION,
        message: 'Test log',
        sourceIp: '127.0.0.1',
        acknowledged: false,
        resolved: false,
      }));
      
      await service.onModuleInit();
      
      expect(fs.readdir).toHaveBeenCalledWith('/tmp/test-security-logs');
    });

    it('should handle file system errors during initialization', async () => {
      (fs.mkdir as jest.Mock).mockRejectedValue(new Error('Permission denied'));
      
      // Should not throw when initialization fails
      await expect(service.onModuleInit()).resolves.toBeUndefined();
      
      // Verify that mkdir was called and failed
      expect(fs.mkdir).toHaveBeenCalled();
    });

    it('should not initialize when aggregation is disabled', async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'security.monitoring.aggregation.enabled') {
            return false;
          }
          return mockConfigService.get(key, defaultValue);
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SecurityAggregationService,
          {
            provide: ConfigService,
            useValue: disabledConfigService,
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
        ],
      }).compile();

      const testService = module.get<SecurityAggregationService>(SecurityAggregationService);
      await testService.onModuleInit();
      
      expect(fs.mkdir).not.toHaveBeenCalled();
    });

    it('should handle file system read errors gracefully', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('Read failed'));
      
      await service.onModuleInit();
      
      // Should not throw, but log error
      expect(fs.mkdir).toHaveBeenCalled();
    });
  });

  describe('custom backend initialization', () => {
    beforeEach(() => {
      // Reset fetch mock
      mockFetch.mockReset();
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        statusText: 'OK',
      });
      
      mockConfigService.get = jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'security.monitoring.aggregation.enabled': true,
          'security.monitoring.aggregation.backends': ['CUSTOM'],
          'security.monitoring.aggregation.custom.endpoint': 'https://custom.example.com',
        };
        return config[key] ?? defaultValue;
      });
    });

    it('should initialize custom backend', async () => {
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SecurityAggregationService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
        ],
      }).compile();

      const testService = module.get<SecurityAggregationService>(SecurityAggregationService);
      await testService.onModuleInit();
      
      expect(mockFetch).toHaveBeenCalledWith(
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
      mockFetch.mockRejectedValue(new Error('Network error'));
      
      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SecurityAggregationService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
        ],
      }).compile();

      const testService = module.get<SecurityAggregationService>(SecurityAggregationService);
      
      // Should not throw when custom backend fails
      await expect(testService.onModuleInit()).resolves.toBeUndefined();
      
      // Verify that fetch was called and failed
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  describe('log aggregation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should aggregate audit logs to file', async () => {
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
      const eventHandler = (mockEventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Add multiple logs to trigger batch flush
      for (let i = 0; i < 101; i++) {
        await eventHandler({ ...mockAuditLog, id: `log-${i}` });
      }

      expect(fs.appendFile).toHaveBeenCalled();
      
      const appendCall = (fs.appendFile as jest.Mock).mock.calls[0];
      expect(appendCall[0]).toContain('.jsonl');
      expect(appendCall[1]).toContain('LOGIN_SUCCESS');
    });

    it('should handle file write errors gracefully', async () => {
      (fs.appendFile as jest.Mock).mockRejectedValue(new Error('Write operation failed'));

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

      const eventHandler = (mockEventEmitter.on as jest.Mock).mock.calls[0][1];
      
      // Should not throw
      await expect(eventHandler(mockAuditLog)).resolves.toBeUndefined();
    });
  });

  describe('aggregation status', () => {
    it('should return aggregation status', async () => {
      // Reset to default config for this test
      mockConfigService.get = jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          'security.monitoring.audit.enabled': true,
          'security.monitoring.audit.logLevel': 'INFO',
          'security.monitoring.audit.batchSize': 100,
          'security.monitoring.audit.flushInterval': 10,
          'security.monitoring.audit.retentionDays': 30,
          'security.monitoring.aggregation.enabled': true,
          'security.monitoring.aggregation.backends': ['FILE'],
          'security.monitoring.logDirectory': '/tmp/test-security-logs',
          'security.monitoring.aggregation.webhook.url': 'https://webhook.example.com',
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
      });

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SecurityAggregationService,
          {
            provide: ConfigService,
            useValue: mockConfigService,
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
        ],
      }).compile();

      const testService = module.get<SecurityAggregationService>(SecurityAggregationService);
      await testService.onModuleInit();
      
      const status = testService.getAggregationStatus();
      
      expect(status).toMatchObject({
        enabled: true,
        backends: ['FILE'],
        logDirectory: '/tmp/test-security-logs',
        currentLogFile: expect.stringContaining('.jsonl'),
        inMemoryLogCount: expect.any(Number),
        bufferSize: expect.any(Number),
      });
    });
  });

  describe('security metrics', () => {
    it('should return empty metrics when aggregation is disabled', async () => {
      const disabledConfigService = {
        get: jest.fn((key: string, defaultValue?: any) => {
          if (key === 'security.monitoring.aggregation.enabled') {
            return false;
          }
          return mockConfigService.get(key, defaultValue);
        }),
      };

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          SecurityAggregationService,
          {
            provide: ConfigService,
            useValue: disabledConfigService,
          },
          {
            provide: EventEmitter2,
            useValue: mockEventEmitter,
          },
        ],
      }).compile();

      const disabledService = module.get<SecurityAggregationService>(SecurityAggregationService);
      await disabledService.onModuleInit();

      const metrics = await disabledService.getSecurityMetrics(60);

      expect(metrics.totalLogins).toBe(0);
      expect(metrics.uniqueUsers).toBe(0);
      expect(metrics.topCountries).toEqual([]);
    });

    it('should handle metrics calculation errors gracefully', async () => {
      const metrics = await service.getSecurityMetrics(60);

      // Should return initialized metrics structure
      expect(metrics.totalLogins).toBe(0);
      expect(metrics.eventCounts).toBeDefined();
      expect(metrics.severityCounts).toBeDefined();
      expect(metrics.timestamp).toBeInstanceOf(Date);
      expect(metrics.timeWindow).toBe(60);
    });
  });

  describe('export functionality', () => {
    beforeEach(async () => {
      await service.onModuleInit();
      
      // Add test logs for export functionality
      const mockLogs: SecurityAuditLog[] = [
        {
          id: 'export-log-1',
          timestamp: new Date('2023-01-01T10:00:00Z'),
          eventType: SecurityEventType.LOGIN_SUCCESS,
          severity: SecurityEventSeverity.LOW,
          category: SecurityEventCategory.AUTHENTICATION,
          message: 'Login successful',
          sourceIp: '192.168.1.1',
          userId: 'user-1',
          acknowledged: false,
          resolved: false,
        },
      ];
      
      // Add logs directly to in-memory store for testing
      service['inMemoryLogs'] = mockLogs;
    });

    it('should export logs to JSON file', async () => {
      const exportPath = await service.exportLogs({
        format: 'json',
      });

      expect(exportPath).toContain('.json');
      expect(fs.writeFile).toHaveBeenCalled();
      
      const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
        call => call[0].includes('.json')
      );
      expect(writeCall).toBeDefined();
    });

    it('should export logs to CSV file', async () => {
      const exportPath = await service.exportLogs({
        format: 'csv',
      });

      expect(exportPath).toContain('.csv');
      expect(fs.writeFile).toHaveBeenCalled();
      
      const writeCall = (fs.writeFile as jest.Mock).mock.calls.find(
        call => call[0].includes('.csv')
      );
      expect(writeCall).toBeDefined();
    });
  });
});