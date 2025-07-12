import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DatabaseManager } from './database-manager.service';
import { DatabaseHealthCheckService } from './health-check.service';
import { PrismaService } from './postgresql/config/prisma.service';
import { MongodbService } from './mongodb/config/mongodb.service';
import { RedisService } from './redis/config/redis.service';
import { QdrantService } from './qdrant/config/qdrant.service';

describe('DatabaseManager', () => {
  let service: DatabaseManager;
  let module: TestingModule;
  let prismaService: jest.Mocked<PrismaService>;
  let mongodbService: jest.Mocked<MongodbService>;
  let redisService: jest.Mocked<RedisService>;
  let qdrantService: jest.Mocked<QdrantService>;
  let healthCheckService: jest.Mocked<DatabaseHealthCheckService>;

  const mockPrismaService = {
    healthCheck: jest.fn(),
    cleanDb: jest.fn(),
    onModuleDestroy: jest.fn(),
  };

  const mockMongodbService = {
    healthCheck: jest.fn(),
    cleanDb: jest.fn(),
    onModuleDestroy: jest.fn(),
    getConnectionInfo: jest.fn(),
  };

  const mockRedisService = {
    healthCheck: jest.fn(),
    flushDb: jest.fn(),
    onModuleDestroy: jest.fn(),
    getCacheStats: jest.fn(),
  };

  const mockQdrantService = {
    healthCheck: jest.fn(),
    cleanDb: jest.fn(),
    onModuleDestroy: jest.fn(),
    listCollections: jest.fn(),
    getClusterInfo: jest.fn(),
  };

  const mockHealthCheckService = {
    checkAllDatabases: jest.fn(),
    checkPostgreSQLHealth: jest.fn(),
    checkMongoDBHealth: jest.fn(),
    checkRedisHealth: jest.fn(),
    checkQdrantHealth: jest.fn(),
  };

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
      ],
      providers: [
        DatabaseManager,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: MongodbService,
          useValue: mockMongodbService,
        },
        {
          provide: RedisService,
          useValue: mockRedisService,
        },
        {
          provide: QdrantService,
          useValue: mockQdrantService,
        },
        {
          provide: DatabaseHealthCheckService,
          useValue: mockHealthCheckService,
        },
      ],
    }).compile();

    service = module.get<DatabaseManager>(DatabaseManager);
    prismaService = module.get(PrismaService);
    mongodbService = module.get(MongodbService);
    redisService = module.get(RedisService);
    qdrantService = module.get(QdrantService);
    healthCheckService = module.get(DatabaseHealthCheckService);

    // Reset all mocks
    jest.clearAllMocks();
  });

  afterEach(async () => {
    if (module) {
      await module.close();
    }
  });

  describe('Database Manager Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should initialize all database connections on module init', async () => {
      // Arrange
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);

      // Act
      await service.onModuleInit();

      // Assert
      expect(prismaService.healthCheck).toHaveBeenCalled();
      expect(mongodbService.healthCheck).toHaveBeenCalled();
      expect(redisService.healthCheck).toHaveBeenCalled();
      expect(qdrantService.healthCheck).toHaveBeenCalled();
      expect(service.isReady()).toBe(true);
    });

    it('should handle connection failures and retry', async () => {
      // Arrange
      prismaService.healthCheck
        .mockRejectedValueOnce(new Error('Connection failed'))
        .mockResolvedValueOnce(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);

      // Act & Assert
      await expect(service.onModuleInit()).resolves.not.toThrow();
      expect(prismaService.healthCheck).toHaveBeenCalledTimes(2);
    });

    it('should fail initialization if all retry attempts are exhausted', async () => {
      // Arrange
      const error = new Error('Persistent connection failure');
      prismaService.healthCheck.mockRejectedValue(error);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);

      // Override config to reduce retry attempts for faster testing
      service.updateConfig({ reconnectAttempts: 2, reconnectDelay: 100 });

      // Act & Assert
      await expect(service.onModuleInit()).rejects.toThrow();
    }, 10000); // Reduce timeout since we're using fewer retries
  });

  describe('Connection Status', () => {
    beforeEach(async () => {
      // Initialize service first
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should return current connection status for all databases', async () => {
      // Arrange
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(false);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);

      // Act
      const status = await service.getConnectionStatus();

      // Assert
      expect(status).toEqual({
        postgresql: true,
        mongodb: false,
        redis: true,
        qdrant: true,
      });
    });

    it('should handle health check errors gracefully', async () => {
      // Arrange
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockRejectedValue(
        new Error('Health check failed')
      );
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);

      // Act
      const status = await service.getConnectionStatus();

      // Assert
      expect(status.mongodb).toBe(false);
      expect(status.postgresql).toBe(true);
      expect(status.redis).toBe(true);
      expect(status.qdrant).toBe(true);
    });
  });

  describe('Service Access', () => {
    beforeEach(async () => {
      // Initialize service first
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should provide access to all database services', () => {
      // Act
      const connections = service.getConnections();

      // Assert
      expect(connections.prisma).toBe(prismaService);
      expect(connections.mongodb).toBe(mongodbService);
      expect(connections.redis).toBe(redisService);
      expect(connections.qdrant).toBe(qdrantService);
    });

    it('should provide individual database service access', () => {
      // Act & Assert
      expect(service.getPostgreSQL()).toBe(prismaService);
      expect(service.getMongoDB()).toBe(mongodbService);
      expect(service.getRedis()).toBe(redisService);
      expect(service.getQdrant()).toBe(qdrantService);
    });

    it('should throw error when accessing services before initialization', () => {
      // Arrange - create new uninitialized service
      const uninitializedService = new DatabaseManager(
        module.get(ConfigService),
        prismaService,
        mongodbService,
        redisService,
        qdrantService,
        healthCheckService
      );

      // Act & Assert
      expect(() => uninitializedService.getConnections()).toThrow(
        'Database Manager not initialized'
      );
    });
  });

  describe('Health Check', () => {
    beforeEach(async () => {
      // Initialize service first
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should perform comprehensive health check', async () => {
      // Arrange
      const mockHealthStatus = {
        overall: 'healthy' as const,
        databases: [
          { name: 'PostgreSQL', status: 'healthy' as const, responseTime: 10 },
          { name: 'MongoDB', status: 'healthy' as const, responseTime: 15 },
          { name: 'Redis', status: 'healthy' as const, responseTime: 5 },
          { name: 'Qdrant', status: 'healthy' as const, responseTime: 20 },
        ],
        timestamp: new Date(),
        summary: { total: 4, healthy: 4, unhealthy: 0, unknown: 0 },
      };
      healthCheckService.checkAllDatabases.mockResolvedValue(mockHealthStatus);

      // Act
      const result = await service.performHealthCheck();

      // Assert
      expect(healthCheckService.checkAllDatabases).toHaveBeenCalled();
      expect(result).toEqual(mockHealthStatus);
    });
  });

  describe('Database Cleanup', () => {
    beforeEach(async () => {
      // Initialize service first
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should clean all databases in test environment', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      prismaService.cleanDb.mockResolvedValue([]);
      mongodbService.cleanDb.mockResolvedValue();
      redisService.flushDb.mockResolvedValue();
      qdrantService.cleanDb.mockResolvedValue();

      try {
        // Act
        await service.cleanAllDatabases();

        // Assert
        expect(prismaService.cleanDb).toHaveBeenCalled();
        expect(mongodbService.cleanDb).toHaveBeenCalled();
        expect(redisService.flushDb).toHaveBeenCalled();
        expect(qdrantService.cleanDb).toHaveBeenCalled();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('should prevent database cleanup in production environment', async () => {
      // Arrange
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      try {
        // Act & Assert
        await expect(service.cleanAllDatabases()).rejects.toThrow(
          'Cannot clean databases in production environment'
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('Graceful Shutdown', () => {
    beforeEach(async () => {
      // Initialize service first
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should perform graceful shutdown of all services', async () => {
      // Arrange
      prismaService.onModuleDestroy.mockResolvedValue(undefined);
      mongodbService.onModuleDestroy.mockResolvedValue(undefined);
      redisService.onModuleDestroy.mockResolvedValue(undefined);
      qdrantService.onModuleDestroy.mockResolvedValue(undefined);

      // Act
      await service.gracefulShutdown();

      // Assert
      expect(prismaService.onModuleDestroy).toHaveBeenCalled();
      expect(mongodbService.onModuleDestroy).toHaveBeenCalled();
      expect(redisService.onModuleDestroy).toHaveBeenCalled();
      expect(qdrantService.onModuleDestroy).toHaveBeenCalled();
      expect(service.isReady()).toBe(false);
    });

    it('should handle shutdown errors gracefully', async () => {
      // Arrange
      prismaService.onModuleDestroy.mockRejectedValue(
        new Error('Shutdown error')
      );
      mongodbService.onModuleDestroy.mockResolvedValue(undefined);
      redisService.onModuleDestroy.mockResolvedValue(undefined);
      qdrantService.onModuleDestroy.mockResolvedValue(undefined);

      // Act & Assert
      await expect(service.gracefulShutdown()).rejects.toThrow(
        'Shutdown error'
      );
    });
  });

  describe('Reconnection', () => {
    beforeEach(async () => {
      // Initialize service first
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);
      await service.onModuleInit();
    });

    it('should reconnect all databases successfully', async () => {
      // Arrange
      prismaService.onModuleDestroy.mockResolvedValue(undefined);
      mongodbService.onModuleDestroy.mockResolvedValue(undefined);
      redisService.onModuleDestroy.mockResolvedValue(undefined);
      qdrantService.onModuleDestroy.mockResolvedValue(undefined);

      // Reset for reconnection
      prismaService.healthCheck.mockResolvedValue(true);
      mongodbService.healthCheck.mockResolvedValue(true);
      redisService.healthCheck.mockResolvedValue(true);
      qdrantService.healthCheck.mockResolvedValue(true);

      // Act
      await service.reconnectAll();

      // Assert
      expect(service.isReady()).toBe(true);
      expect(prismaService.onModuleDestroy).toHaveBeenCalled();
      expect(prismaService.healthCheck).toHaveBeenCalledTimes(2); // Init + reconnect
    });
  });

  describe('Configuration Management', () => {
    it('should return current configuration', () => {
      // Act
      const config = service.getConfig();

      // Assert
      expect(config).toHaveProperty('reconnectAttempts');
      expect(config).toHaveProperty('reconnectDelay');
      expect(config).toHaveProperty('connectionTimeout');
      expect(config).toHaveProperty('enableGracefulShutdown');
      expect(config).toHaveProperty('enableHealthMonitoring');
      expect(config).toHaveProperty('healthCheckInterval');
    });

    it('should update configuration', () => {
      // Arrange
      const newConfig = {
        reconnectAttempts: 10,
        healthCheckInterval: 30000,
      };

      // Act
      service.updateConfig(newConfig);
      const updatedConfig = service.getConfig();

      // Assert
      expect(updatedConfig.reconnectAttempts).toBe(10);
      expect(updatedConfig.healthCheckInterval).toBe(30000);
    });
  });
});
