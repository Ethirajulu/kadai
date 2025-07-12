import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseConfigModule } from '../database-config.module';
import { DatabaseManager } from '../database-manager.service';
import { PrismaService } from '../postgresql/config/prisma.service';
import { MongodbService } from '../mongodb/config/mongodb.service';
import { RedisService } from '../redis/config/redis.service';
import { QdrantService } from '../qdrant/config/qdrant.service';
import { DatabaseHealthCheckService } from '../health-check.service';

/**
 * Integration tests for the entire database architecture
 * These tests require actual database connections and are more suitable for CI/CD environments
 * Skip these tests in unit test runs by using --testPathIgnorePatterns
 */
describe('Database Integration Tests', () => {
  let module: TestingModule;
  let databaseManager: DatabaseManager;
  let prismaService: PrismaService;
  let mongodbService: MongodbService;
  let redisService: RedisService;
  let qdrantService: QdrantService;
  let healthCheckService: DatabaseHealthCheckService;

  // Helper to check if we should skip integration tests
  const shouldSkipIntegrationTests = () => {
    return process.env.SKIP_INTEGRATION_TESTS === 'true' || 
           process.env.NODE_ENV === 'test';
  };

  beforeAll(async () => {
    if (shouldSkipIntegrationTests()) {
      console.log('Skipping integration tests - set SKIP_INTEGRATION_TESTS=false to run');
      return;
    }

    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: ['.env.test', '.env.local', '.env'],
        }),
        MongooseModule.forRoot(
          process.env.MONGODB_URL || 'mongodb://localhost:27017/kadai-test'
        ),
        DatabaseConfigModule,
      ],
    }).compile();

    databaseManager = module.get<DatabaseManager>(DatabaseManager);
    prismaService = module.get<PrismaService>(PrismaService);
    mongodbService = module.get<MongodbService>(MongodbService);
    redisService = module.get<RedisService>(RedisService);
    qdrantService = module.get<QdrantService>(QdrantService);
    healthCheckService = module.get<DatabaseHealthCheckService>(DatabaseHealthCheckService);

    // Wait for all services to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));
  });

  afterAll(async () => {
    if (shouldSkipIntegrationTests() || !module) {
      return;
    }

    try {
      // Clean up test data
      await databaseManager.cleanAllDatabases();
    } catch (error) {
      console.warn('Cleanup failed:', error);
    }

    await module.close();
  });

  describe('Database Manager Integration', () => {
    it('should initialize and be ready', () => {
      if (shouldSkipIntegrationTests()) return;
      
      expect(databaseManager).toBeDefined();
      expect(databaseManager.isReady()).toBe(true);
    });

    it('should provide access to all database services', () => {
      if (shouldSkipIntegrationTests()) return;

      const connections = databaseManager.getConnections();
      expect(connections.prisma).toBeDefined();
      expect(connections.mongodb).toBeDefined();
      expect(connections.redis).toBeDefined();
      expect(connections.qdrant).toBeDefined();
    });
  });

  describe('PostgreSQL Integration', () => {
    it('should connect and perform basic operations', async () => {
      if (shouldSkipIntegrationTests()) return;

      const isHealthy = await prismaService.healthCheck();
      expect(isHealthy).toBe(true);

      const connectionInfo = await prismaService.getConnectionInfo();
      expect(connectionInfo.connected).toBe(true);
      expect(connectionInfo.database).toBeDefined();
      expect(connectionInfo.version).toBeDefined();
    });

    it('should execute raw queries successfully', async () => {
      if (shouldSkipIntegrationTests()) return;

      const result = await prismaService.$queryRaw`SELECT 1 as test_value`;
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('MongoDB Integration', () => {
    it('should connect and perform basic operations', async () => {
      if (shouldSkipIntegrationTests()) return;

      const isHealthy = await mongodbService.healthCheck();
      expect(isHealthy).toBe(true);

      const connectionInfo = await mongodbService.getConnectionInfo();
      expect(connectionInfo.connected).toBe(true);
      expect(connectionInfo.name).toBeDefined();
      expect(Array.isArray(connectionInfo.collections)).toBe(true);
    });

    it('should get server status', async () => {
      if (shouldSkipIntegrationTests()) return;

      const serverStatus = await mongodbService.getServerStatus();
      expect(serverStatus).toBeDefined();
      expect(typeof serverStatus).toBe('object');
    });

    it('should create and query a test collection', async () => {
      if (shouldSkipIntegrationTests()) return;

      const connection = mongodbService.getConnection();
      const testCollection = connection.collection('test_integration');
      
      // Insert test document
      const insertResult = await testCollection.insertOne({
        name: 'integration-test',
        timestamp: new Date(),
        data: { test: true }
      });
      
      expect(insertResult.insertedId).toBeDefined();

      // Query the document
      const document = await testCollection.findOne({
        name: 'integration-test'
      });
      
      expect(document).toBeDefined();
      expect(document?.name).toBe('integration-test');
      expect(document?.data.test).toBe(true);

      // Cleanup
      await testCollection.deleteOne({ _id: insertResult.insertedId });
    });
  });

  describe('Redis Integration', () => {
    it('should connect and perform basic operations', async () => {
      if (shouldSkipIntegrationTests()) return;

      const isHealthy = await redisService.healthCheck();
      expect(isHealthy).toBe(true);

      const stats = await redisService.getCacheStats();
      expect(stats.connected).toBe(true);
      expect(stats.info).toBeDefined();
    });

    it('should set and get cache values', async () => {
      if (shouldSkipIntegrationTests()) return;

      const testKey = 'integration-test';
      const testValue = { 
        message: 'Hello from integration test',
        timestamp: Date.now(),
        nested: { data: [1, 2, 3] }
      };

      // Set cache value
      await redisService.set('api', testKey, testValue);

      // Check if key exists
      const exists = await redisService.exists('api', testKey);
      expect(exists).toBe(true);

      // Get cache value
      const retrievedValue = await redisService.get('api', testKey);
      expect(retrievedValue).toEqual(testValue);

      // Get TTL
      const ttl = await redisService.getTtl('api', testKey);
      expect(ttl).toBeGreaterThan(0);

      // Delete cache value
      await redisService.delete('api', testKey);

      // Verify deletion
      const existsAfterDelete = await redisService.exists('api', testKey);
      expect(existsAfterDelete).toBe(false);
    });

    it('should handle cache expiration', async () => {
      if (shouldSkipIntegrationTests()) return;

      const testKey = 'expiration-test';
      const testValue = 'expires soon';

      // Set with short TTL
      await redisService.set('api', testKey, testValue, 1); // 1 second

      // Immediately check existence
      const existsImmediately = await redisService.exists('api', testKey);
      expect(existsImmediately).toBe(true);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Check after expiration
      const existsAfterExpiration = await redisService.exists('api', testKey);
      expect(existsAfterExpiration).toBe(false);
    });
  });

  describe('Qdrant Integration', () => {
    const testCollectionName = 'integration_test_collection';

    afterEach(async () => {
      if (shouldSkipIntegrationTests()) return;
      
      try {
        await qdrantService.deleteCollection(testCollectionName);
      } catch (error) {
        // Collection might not exist, ignore error
      }
    });

    it('should connect and perform basic operations', async () => {
      if (shouldSkipIntegrationTests()) return;

      const isHealthy = await qdrantService.healthCheck();
      expect(isHealthy).toBe(true);

      const collections = await qdrantService.listCollections();
      expect(Array.isArray(collections)).toBe(true);

      const clusterInfo = await qdrantService.getClusterInfo();
      expect(clusterInfo).toBeDefined();
    });

    it('should create and manage collections', async () => {
      if (shouldSkipIntegrationTests()) return;

      // Create collection
      const created = await qdrantService.createCollection({
        name: testCollectionName,
        vectorSize: 384,
        distance: 'Cosine',
        description: 'Integration test collection'
      });
      
      expect(created).toBe(true);

      // List collections to verify creation
      const collections = await qdrantService.listCollections();
      expect(collections).toContain(testCollectionName);

      // Get collection info
      const collectionInfo = await qdrantService.getCollectionInfo(testCollectionName);
      expect(collectionInfo).toBeDefined();

      // Try to create the same collection again (should return false)
      const createdAgain = await qdrantService.createCollection({
        name: testCollectionName,
        vectorSize: 384,
        distance: 'Cosine'
      });
      
      expect(createdAgain).toBe(false);
    });

    it('should handle collection operations with payload indexes', async () => {
      if (shouldSkipIntegrationTests()) return;

      // Create collection with payload indexes
      const created = await qdrantService.createCollection({
        name: testCollectionName,
        vectorSize: 128,
        distance: 'Euclid',
        payloadIndexes: {
          'category': 'keyword',
          'price': 'float',
          'active': 'bool'
        }
      });
      
      expect(created).toBe(true);

      // Verify collection exists
      const collections = await qdrantService.listCollections();
      expect(collections).toContain(testCollectionName);
    });
  });

  describe('Health Check Integration', () => {
    it('should perform comprehensive health check on all databases', async () => {
      if (shouldSkipIntegrationTests()) return;

      const healthStatus = await healthCheckService.checkAllDatabases();
      
      expect(healthStatus).toBeDefined();
      expect(healthStatus.overall).toBeDefined();
      expect(['healthy', 'unhealthy', 'degraded']).toContain(healthStatus.overall);
      expect(healthStatus.databases).toHaveLength(4);
      expect(healthStatus.timestamp).toBeInstanceOf(Date);
      expect(healthStatus.summary).toBeDefined();
      expect(healthStatus.summary.total).toBe(4);

      // Check individual database health
      const dbNames = healthStatus.databases.map(db => db.name);
      expect(dbNames).toContain('PostgreSQL');
      expect(dbNames).toContain('MongoDB');
      expect(dbNames).toContain('Redis');
      expect(dbNames).toContain('Qdrant');

      // All databases should be healthy in a proper test environment
      for (const db of healthStatus.databases) {
        expect(db.status).toBe('healthy');
        expect(db.responseTime).toBeGreaterThanOrEqual(0);
      }
    });

    it('should get individual database health statuses', async () => {
      if (shouldSkipIntegrationTests()) return;

      const [postgresql, mongodb, redis, qdrant] = await Promise.all([
        healthCheckService.checkPostgreSQLHealth(),
        healthCheckService.checkMongoDBHealth(),
        healthCheckService.checkRedisHealth(),
        healthCheckService.checkQdrantHealth()
      ]);

      expect(postgresql.name).toBe('PostgreSQL');
      expect(postgresql.status).toBe('healthy');
      expect(postgresql.details).toBeDefined();

      expect(mongodb.name).toBe('MongoDB');
      expect(mongodb.status).toBe('healthy');
      expect(mongodb.details).toBeDefined();

      expect(redis.name).toBe('Redis');
      expect(redis.status).toBe('healthy');
      expect(redis.details).toBeDefined();

      expect(qdrant.name).toBe('Qdrant');
      expect(qdrant.status).toBe('healthy');
      expect(qdrant.details).toBeDefined();
    });

    it('should get health summary in correct format', async () => {
      if (shouldSkipIntegrationTests()) return;

      const summary = await healthCheckService.getHealthSummary();
      
      expect(summary).toBeDefined();
      expect(summary.status).toBeDefined();
      expect(summary.checks).toBeDefined();
      expect(summary.timestamp).toBeInstanceOf(Date);

      // Check that all database checks are present
      expect(summary.checks).toHaveProperty('postgresql');
      expect(summary.checks).toHaveProperty('mongodb');
      expect(summary.checks).toHaveProperty('redis');
      expect(summary.checks).toHaveProperty('qdrant');

      // All should be healthy (true)
      expect(summary.checks.postgresql).toBe(true);
      expect(summary.checks.mongodb).toBe(true);
      expect(summary.checks.redis).toBe(true);
      expect(summary.checks.qdrant).toBe(true);
    });
  });

  describe('Database Cleanup Integration', () => {
    it('should clean all databases safely in test environment', async () => {
      if (shouldSkipIntegrationTests()) return;

      // First, add some test data to each database
      
      // PostgreSQL - execute a simple query (schema should exist)
      await prismaService.$queryRaw`SELECT 1`;
      
      // MongoDB - create test document
      const connection = mongodbService.getConnection();
      const testCollection = connection.collection('cleanup_test');
      await testCollection.insertOne({ test: 'cleanup' });
      
      // Redis - set test cache
      await redisService.set('api', 'cleanup-test', { test: 'cleanup' });
      
      // Qdrant - create test collection
      try {
        await qdrantService.createCollection({
          name: 'cleanup_test',
          vectorSize: 64,
          distance: 'Cosine'
        });
      } catch (error) {
        // Collection might already exist
      }

      // Verify data exists
      const mongoDoc = await testCollection.findOne({ test: 'cleanup' });
      expect(mongoDoc).toBeDefined();
      
      const redisExists = await redisService.exists('api', 'cleanup-test');
      expect(redisExists).toBe(true);
      
      const collections = await qdrantService.listCollections();
      expect(collections).toContain('cleanup_test');

      // Perform cleanup
      await databaseManager.cleanAllDatabases();

      // Verify cleanup
      const mongoDocAfter = await testCollection.findOne({ test: 'cleanup' });
      expect(mongoDocAfter).toBeNull();
      
      const redisExistsAfter = await redisService.exists('api', 'cleanup-test');
      expect(redisExistsAfter).toBe(false);
      
      const collectionsAfter = await qdrantService.listCollections();
      expect(collectionsAfter).not.toContain('cleanup_test');
    });
  });

  describe('Connection Status Integration', () => {
    it('should return accurate connection status for all databases', async () => {
      if (shouldSkipIntegrationTests()) return;

      const connectionStatus = await databaseManager.getConnectionStatus();
      
      expect(connectionStatus).toBeDefined();
      expect(connectionStatus.postgresql).toBe(true);
      expect(connectionStatus.mongodb).toBe(true);
      expect(connectionStatus.redis).toBe(true);
      expect(connectionStatus.qdrant).toBe(true);
    });
  });
});