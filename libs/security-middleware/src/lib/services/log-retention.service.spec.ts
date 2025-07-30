import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { LogRetentionService } from './log-retention.service';
import { promises as fs } from 'fs';
import { join } from 'path';

// Mock filesystem
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn(),
    readdir: jest.fn(),
    stat: jest.fn(),
    unlink: jest.fn(),
    access: jest.fn(),
    copyFile: jest.fn(),
    writeFile: jest.fn(),
    readFile: jest.fn(),
  },
}));

// Mock Redis
const mockRedis = {
  keys: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  ttl: jest.fn(),
  pipeline: jest.fn(() => ({
    del: jest.fn(),
    exec: jest.fn(),
  })),
  disconnect: jest.fn(),
  memory: jest.fn(),
  info: jest.fn(),
};

jest.mock('ioredis', () => jest.fn(() => mockRedis));

// Mock Elasticsearch
const mockElasticsearch = {
  cat: {
    indices: jest.fn(),
  },
  indices: {
    delete: jest.fn(),
  },
  close: jest.fn(),
};

jest.mock('@elastic/elasticsearch', () => ({
  Client: jest.fn(() => mockElasticsearch),
}));

// Mock zlib
const mockZlib = {
  gzip: jest.fn(),
};

jest.mock('zlib', () => mockZlib);

describe('LogRetentionService', () => {
  let service: LogRetentionService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config: Record<string, any> = {
        'security.retention.enabled': true,
        'security.retention.policies.audit.retentionDays': 30,
        'security.retention.policies.audit.archiveAfterDays': 7,
        'security.retention.policies.audit.compressionEnabled': true,
        'security.retention.policies.alerts.retentionDays': 90,
        'security.retention.policies.alerts.archiveAfterDays': 30,
        'security.retention.policies.elasticsearch.retentionDays': 60,
        'security.retention.policies.elasticsearch.ilmPolicyEnabled': true,
        'security.retention.policies.redis.retentionDays': 7,
        'security.retention.storage.archiveLocation': 'test-archives',
        'security.retention.storage.encryptionEnabled': false,
        'security.retention.cleanup.schedule': '0 2 * * *',
        'security.retention.cleanup.batchSize': 100,
        'security.retention.cleanup.maxRunTimeMinutes': 30,
        'security.monitoring.logDirectory': 'test-logs',
        'security.monitoring.elasticsearch.enabled': true,
        'security.monitoring.elasticsearch.node': 'http://localhost:9200',
        'redis.host': 'localhost',
        'redis.port': 6379,
        'redis.db': 0,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-15T10:00:00Z'));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogRetentionService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<LogRetentionService>(LogRetentionService);
    configService = module.get<ConfigService>(ConfigService);

    // Mock successful initialization
    (fs.mkdir as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('onModuleInit', () => {
    it('should initialize when enabled', async () => {
      await service.onModuleInit();

      expect(fs.mkdir).toHaveBeenCalledWith('test-archives', { recursive: true });
    });

    it('should not initialize when disabled', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.retention.enabled') {
          return false;
        }
        return defaultValue;
      });

      const newService = new LogRetentionService(configService);
      await newService.onModuleInit();

      expect(fs.mkdir).not.toHaveBeenCalled();
    });
  });

  describe('runScheduledCleanup', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should run cleanup tasks successfully', async () => {
      // Mock file system for audit logs
      (fs.readdir as jest.Mock).mockResolvedValue(['log-2024-01-01.jsonl', 'log-2024-01-14.jsonl']);
      (fs.stat as jest.Mock).mockResolvedValue({
        size: 1024,
        mtime: new Date('2024-01-01T00:00:00Z'), // Old file
      });
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      // Mock Redis cleanup
      mockRedis.keys.mockResolvedValue(['security_audit:logs:key1', 'security_audit:logs:key2']);
      mockRedis.get.mockResolvedValue(JSON.stringify({
        timestamp: '2024-01-01T00:00:00Z', // Old log
      }));
      const mockPipeline = {
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      // Mock Elasticsearch cleanup
      mockElasticsearch.cat.indices.mockResolvedValue([
        { index: 'kadai-security-logs-2024.01.01' },
        { index: 'kadai-security-logs-2024.01.14' },
      ]);
      mockElasticsearch.indices.delete.mockResolvedValue({});

      await service.runScheduledCleanup();

      const stats = service.getRetentionStats();
      expect(stats.totalFilesProcessed).toBeGreaterThan(0);
      expect(stats.totalDeleted).toBeGreaterThan(0);
    });

    it('should not run when already running', async () => {
      // Start first cleanup
      const cleanup1Promise = service.runScheduledCleanup();
      
      // Try to start second cleanup immediately
      await service.runScheduledCleanup();

      // Complete first cleanup
      await cleanup1Promise;

      // Second cleanup should not have done anything
      const stats = service.getRetentionStats();
      expect(stats.errors).not.toContain('Already running');
    });

    it('should handle timeout gracefully', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.retention.cleanup.maxRunTimeMinutes') {
          return 0.001; // Very short timeout
        }
        return mockConfigService.get(key, defaultValue);
      });

      // Mock long-running operation
      (fs.readdir as jest.Mock).mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve([]), 1000))
      );

      const newService = new LogRetentionService(configService);
      await newService.onModuleInit();
      
      await newService.runScheduledCleanup();

      const stats = newService.getRetentionStats();
      expect(stats.errors).toContain('Cleanup timeout');
    });
  });

  describe('cleanupAuditLogs', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should delete old audit logs', async () => {
      const oldDate = new Date('2023-12-01T00:00:00Z'); // Older than retention period
      
      (fs.readdir as jest.Mock).mockResolvedValue(['old-log.jsonl', 'recent-log.jsonl']);
      (fs.stat as jest.Mock)
        .mockResolvedValueOnce({ size: 1024, mtime: oldDate })
        .mockResolvedValueOnce({ size: 512, mtime: new Date('2024-01-10T00:00:00Z') });
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.runScheduledCleanup();

      expect(fs.unlink).toHaveBeenCalledWith(join('test-logs', 'old-log.jsonl'));
      expect(fs.unlink).not.toHaveBeenCalledWith(join('test-logs', 'recent-log.jsonl'));
    });

    it('should archive files older than archive threshold', async () => {
      const archiveDate = new Date('2024-01-05T00:00:00Z'); // Older than archive threshold but newer than retention
      
      (fs.readdir as jest.Mock).mockResolvedValue(['archive-log.jsonl']);
      (fs.stat as jest.Mock).mockResolvedValue({ size: 1024, mtime: archiveDate });
      (fs.readFile as jest.Mock).mockResolvedValue(Buffer.from('log content'));
      (mockZlib.gzip as jest.Mock).mockResolvedValue(Buffer.from('compressed'));
      (fs.writeFile as jest.Mock).mockResolvedValue(undefined);
      (fs.unlink as jest.Mock).mockResolvedValue(undefined);

      await service.runScheduledCleanup();

      expect(fs.writeFile).toHaveBeenCalledWith(
        join('test-archives', 'audit', 'archive-log.jsonl.gz'),
        expect.any(Buffer)
      );
      expect(fs.unlink).toHaveBeenCalledWith(join('test-logs', 'archive-log.jsonl'));
    });

    it('should handle file processing errors gracefully', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['error-log.jsonl']);
      (fs.stat as jest.Mock).mockRejectedValue(new Error('Stat failed'));

      await service.runScheduledCleanup();

      const stats = service.getRetentionStats();
      expect(stats.errors).toContain('Audit log error-log.jsonl: Stat failed');
    });
  });

  describe('cleanupRedisLogs', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should delete old Redis logs', async () => {
      const oldLog = {
        timestamp: '2024-01-01T00:00:00Z', // Old log
      };

      mockRedis.keys.mockResolvedValue(['security_audit:logs:old', 'security_audit:logs:recent']);
      mockRedis.get
        .mockResolvedValueOnce(JSON.stringify(oldLog))
        .mockResolvedValueOnce(JSON.stringify({ timestamp: '2024-01-14T00:00:00Z' }));

      const mockPipeline = {
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await service.runScheduledCleanup();

      expect(mockPipeline.del).toHaveBeenCalledWith('security_audit:logs:old');
      expect(mockPipeline.del).not.toHaveBeenCalledWith('security_audit:logs:recent');
    });

    it('should clean monitoring keys without TTL', async () => {
      mockRedis.keys
        .mockResolvedValueOnce([]) // No audit keys
        .mockResolvedValueOnce(['security_monitoring:old_key']);
      mockRedis.ttl.mockResolvedValue(-1); // No TTL set
      
      // Mock getKeyAge to return old age
      mockRedis.memory.mockResolvedValue(1000);

      const mockPipeline = {
        del: jest.fn(),
        exec: jest.fn().mockResolvedValue([]),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline);

      await service.runScheduledCleanup();

      expect(mockRedis.ttl).toHaveBeenCalledWith('security_monitoring:old_key');
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      await service.runScheduledCleanup();

      const stats = service.getRetentionStats();
      expect(stats.errors).toContain('Redis cleanup: Redis error');
    });
  });

  describe('cleanupElasticsearchIndices', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should delete old Elasticsearch indices', async () => {
      const oldIndex = { index: 'kadai-security-logs-2023.12.01' };
      const recentIndex = { index: 'kadai-security-logs-2024.01.14' };

      mockElasticsearch.cat.indices.mockResolvedValue([oldIndex, recentIndex]);
      mockElasticsearch.indices.delete.mockResolvedValue({});

      await service.runScheduledCleanup();

      expect(mockElasticsearch.indices.delete).toHaveBeenCalledWith({
        index: 'kadai-security-logs-2023.12.01',
      });
      expect(mockElasticsearch.indices.delete).not.toHaveBeenCalledWith({
        index: 'kadai-security-logs-2024.01.14',
      });
    });

    it('should skip when ILM is disabled', async () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        if (key === 'security.retention.policies.elasticsearch.ilmPolicyEnabled') {
          return false;
        }
        return mockConfigService.get(key, defaultValue);
      });

      const newService = new LogRetentionService(configService);
      await newService.onModuleInit();
      await newService.runScheduledCleanup();

      expect(mockElasticsearch.cat.indices).not.toHaveBeenCalled();
    });

    it('should handle Elasticsearch errors gracefully', async () => {
      mockElasticsearch.cat.indices.mockRejectedValue(new Error('ES error'));

      await service.runScheduledCleanup();

      const stats = service.getRetentionStats();
      expect(stats.errors).toContain('Elasticsearch cleanup: ES error');
    });
  });

  describe('getStorageStats', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should return storage statistics', async () => {
      // Mock audit logs
      (fs.readdir as jest.Mock).mockResolvedValueOnce(['log1.jsonl', 'log2.jsonl']);
      (fs.stat as jest.Mock)
        .mockResolvedValueOnce({ size: 1024 })
        .mockResolvedValueOnce({ size: 2048 });

      // Mock archives
      (fs.readdir as jest.Mock).mockResolvedValueOnce(['archive1.gz']);
      (fs.stat as jest.Mock).mockResolvedValueOnce({ size: 512, isFile: () => true });

      // Mock Redis
      mockRedis.keys
        .mockResolvedValueOnce(['audit:key1', 'audit:key2'])
        .mockResolvedValueOnce(['monitoring:key1']);
      mockRedis.info.mockResolvedValue('used_memory:4096\n');

      const stats = await service.getStorageStats();

      expect(stats.auditLogs.count).toBe(2);
      expect(stats.auditLogs.totalSize).toBe(3072);
      expect(stats.archives.count).toBe(1);
      expect(stats.archives.totalSize).toBe(512);
      expect(stats.redis.keyCount).toBe(3);
      expect(stats.redis.memoryUsage).toBe(4096);
    });

    it('should handle missing directories gracefully', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('Directory not found'));

      const stats = await service.getStorageStats();

      expect(stats.auditLogs.count).toBe(0);
      expect(stats.auditLogs.totalSize).toBe(0);
    });
  });

  describe('updateRetentionPolicies', () => {
    it('should update retention policies', async () => {
      const newPolicies = {
        audit: {
          retentionDays: 60,
          archiveAfterDays: 14,
          compressionEnabled: false,
        },
      };

      await service.updateRetentionPolicies(newPolicies);

      const config = service.getRetentionConfig();
      expect(config.policies.audit.retentionDays).toBe(60);
      expect(config.policies.audit.archiveAfterDays).toBe(14);
      expect(config.policies.audit.compressionEnabled).toBe(false);
    });
  });

  describe('runManualCleanup', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should run manual cleanup and return stats', async () => {
      // Mock successful cleanup
      (fs.readdir as jest.Mock).mockResolvedValue([]);
      mockRedis.keys.mockResolvedValue([]);
      mockElasticsearch.cat.indices.mockResolvedValue([]);

      const stats = await service.runManualCleanup();

      expect(stats).toBeDefined();
      expect(stats.lastRunTime).toBeInstanceOf(Date);
    });

    it('should throw error if cleanup is already running', async () => {
      // Start cleanup
      const cleanupPromise = service.runManualCleanup();

      // Try to start another
      await expect(service.runManualCleanup()).rejects.toThrow('Cleanup is already running');

      // Wait for first to complete
      await cleanupPromise;
    });
  });

  describe('getRetentionStats', () => {
    it('should return retention statistics', () => {
      const stats = service.getRetentionStats();

      expect(stats).toEqual({
        lastRunTime: expect.any(Date),
        totalFilesProcessed: expect.any(Number),
        totalSizeFreed: expect.any(Number),
        totalArchived: expect.any(Number),
        totalDeleted: expect.any(Number),
        errors: expect.any(Array),
      });
    });
  });

  describe('getRetentionConfig', () => {
    it('should return retention configuration', () => {
      const config = service.getRetentionConfig();

      expect(config).toEqual({
        enabled: true,
        policies: expect.objectContaining({
          audit: expect.objectContaining({
            retentionDays: 30,
            archiveAfterDays: 7,
            compressionEnabled: true,
          }),
          alerts: expect.objectContaining({
            retentionDays: 90,
            archiveAfterDays: 30,
          }),
          elasticsearch: expect.objectContaining({
            retentionDays: 60,
            ilmPolicyEnabled: true,
          }),
          redis: expect.objectContaining({
            retentionDays: 7,
          }),
        }),
        storage: expect.objectContaining({
          archiveLocation: 'test-archives',
          encryptionEnabled: false,
        }),
        cleanup: expect.objectContaining({
          schedule: '0 2 * * *',
          batchSize: 100,
          maxRunTimeMinutes: 30,
        }),
      });
    });
  });
});