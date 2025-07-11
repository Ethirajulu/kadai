import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';

// Mock Redis to avoid actual Redis connection in tests
const mockRedis = {
  ping: jest.fn().mockResolvedValue('PONG'),
  setex: jest.fn().mockResolvedValue('OK'),
  get: jest.fn().mockResolvedValue(null),
  del: jest.fn().mockResolvedValue(1),
  exists: jest.fn().mockResolvedValue(1),
  expire: jest.fn().mockResolvedValue(1),
  ttl: jest.fn().mockResolvedValue(300),
  keys: jest.fn().mockResolvedValue([]),
  flushall: jest.fn().mockResolvedValue('OK'),
  flushdb: jest.fn().mockResolvedValue('OK'),
  info: jest.fn().mockResolvedValue('redis_version:7.0.0'),
  quit: jest.fn().mockResolvedValue('OK'),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockRedis),
    Cluster: jest.fn().mockImplementation(() => mockRedis),
  };
});

describe('RedisService', () => {
  let service: RedisService;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                REDIS_HOST: 'localhost',
                REDIS_PORT: 6379,
                REDIS_PASSWORD: undefined,
                REDIS_DB: 0,
                REDIS_CLUSTER: false,
                REDIS_CLUSTER_NODES: '',
                REDIS_RETRY_DELAY: 100,
                REDIS_MAX_RETRIES: 3,
                REDIS_CONNECT_TIMEOUT: 10000,
                REDIS_COMMAND_TIMEOUT: 5000,
                REDIS_KEY_PREFIX: 'kadai:',
              };
              return config[key] || defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<RedisService>(RedisService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should initialize and connect to Redis', async () => {
    await service.onModuleInit();
    expect(service.getClient()).toBeDefined();
  });

  it('should perform health check', async () => {
    await service.onModuleInit();
    const isHealthy = await service.healthCheck();
    expect(isHealthy).toBe(true);
  });

  describe('Cache Operations', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should set and get cache values', async () => {
      const testData = { id: '123', name: 'test' };
      const mockGet = service.getClient().get as jest.Mock;
      mockGet.mockResolvedValue(JSON.stringify(testData));

      await service.set('user', 'test-key', testData);
      const result = await service.get('user', 'test-key');

      expect(service.getClient().setex).toHaveBeenCalledWith(
        'user:test-key',
        900, // default TTL for user cache
        JSON.stringify(testData)
      );
      expect(result).toEqual(testData);
    });

    it('should delete cache values', async () => {
      await service.delete('user', 'test-key');
      expect(service.getClient().del).toHaveBeenCalledWith('user:test-key');
    });

    it('should check if key exists', async () => {
      const exists = await service.exists('user', 'test-key');
      expect(exists).toBe(true);
      expect(service.getClient().exists).toHaveBeenCalledWith('user:test-key');
    });

    it('should set expiration for key', async () => {
      await service.expire('user', 'test-key', 600);
      expect(service.getClient().expire).toHaveBeenCalledWith('user:test-key', 600);
    });

    it('should get TTL for key', async () => {
      const ttl = await service.getTtl('user', 'test-key');
      expect(ttl).toBe(300);
      expect(service.getClient().ttl).toHaveBeenCalledWith('user:test-key');
    });

    it('should throw error for unknown key type', async () => {
      await expect(service.set('unknown', 'key', 'value')).rejects.toThrow(
        'Unknown cache key type: unknown'
      );
    });

    it('should handle custom TTL', async () => {
      const testData = { id: '123' };
      await service.set('user', 'test-key', testData, 1800);

      expect(service.getClient().setex).toHaveBeenCalledWith(
        'user:test-key',
        1800,
        JSON.stringify(testData)
      );
    });
  });

  describe('Cache Invalidation', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should invalidate user cache', async () => {
      const mockKeys = service.getClient().keys as jest.Mock;
      mockKeys.mockResolvedValue(['user:123:profile', 'session:123:token']);

      await service.invalidateUserCache('123');

      expect(service.getClient().keys).toHaveBeenCalledWith('user:123:*');
      expect(service.getClient().keys).toHaveBeenCalledWith('session:123:*');
    });

    it('should invalidate product cache', async () => {
      const mockKeys = service.getClient().keys as jest.Mock;
      mockKeys.mockResolvedValue(['product:456:details']);

      await service.invalidateProductCache('456');

      expect(service.getClient().keys).toHaveBeenCalledWith('product:456:*');
      expect(service.getClient().keys).toHaveBeenCalledWith('computed:product:456:*');
    });

    it('should delete pattern', async () => {
      const mockKeys = service.getClient().keys as jest.Mock;
      mockKeys.mockResolvedValue(['user:123:profile', 'user:123:settings']);

      await service.deletePattern('user', '123:*');

      expect(service.getClient().keys).toHaveBeenCalledWith('user:123:*');
      expect(service.getClient().del).toHaveBeenCalledWith('user:123:profile', 'user:123:settings');
    });
  });

  describe('Cache Management', () => {
    beforeEach(async () => {
      await service.onModuleInit();
    });

    it('should flush all cache', async () => {
      await service.flushAll();
      expect(service.getClient().flushall).toHaveBeenCalled();
    });

    it('should flush database cache', async () => {
      await service.flushDb();
      expect(service.getClient().flushdb).toHaveBeenCalled();
    });

    it('should get Redis info', async () => {
      const info = await service.getInfo();
      expect(info).toBe('redis_version:7.0.0');
      expect(service.getClient().info).toHaveBeenCalled();
    });

    it('should get cache statistics', async () => {
      const stats = await service.getCacheStats();
      expect(stats).toHaveProperty('connected', true);
      expect(stats).toHaveProperty('info');
    });
  });

  describe('Error Handling', () => {
    it('should handle JSON parse errors gracefully', async () => {
      await service.onModuleInit();
      const mockGet = service.getClient().get as jest.Mock;
      mockGet.mockResolvedValue('invalid-json');

      const result = await service.get('user', 'test-key');
      expect(result).toBeNull();
    });

    it('should handle health check failures', async () => {
      await service.onModuleInit();
      const mockPing = service.getClient().ping as jest.Mock;
      mockPing.mockRejectedValue(new Error('Connection failed'));

      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(false);
    });
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });
});