import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DatabaseManager } from '../database-manager.service';
import { PostgreSQLTestDataFactory } from './postgresql-factory';
import { MongoDBTestDataFactory } from './mongodb-factory';
import { RedisTestDataFactory } from './redis-factory';
import { QdrantTestDataFactory } from './qdrant-factory';

export interface TestDataSummary {
  postgresql: {
    users: number;
    products: number;
    orders: number;
    payments: number;
  };
  mongodb: {
    sessions: number;
    messages: number;
    analytics: number;
  };
  redis: {
    sessions: number;
    userCache: number;
    productCache: number;
    apiCache: number;
  };
  qdrant: {
    collections: string[];
    productEmbeddings: number;
    imageEmbeddings: number;
    textEmbeddings: number;
    userPreferences: number;
  };
}

export interface TestScenario {
  name: string;
  description: string;
  databases: ('postgresql' | 'mongodb' | 'redis' | 'qdrant')[];
  scenario: string;
}

@Injectable()
export class TestDataManager {
  private postgresqlFactory!: PostgreSQLTestDataFactory;
  private mongodbFactory!: MongoDBTestDataFactory;
  private redisFactory!: RedisTestDataFactory;
  private qdrantFactory!: QdrantTestDataFactory;

  constructor(
    private databaseManager: DatabaseManager,
    private configService: ConfigService
  ) {
    this.initializeFactories();
  }

  private initializeFactories(): void {
    const connections = this.databaseManager.getConnections();
    
    this.postgresqlFactory = new PostgreSQLTestDataFactory(connections.prisma, this.configService);
    this.mongodbFactory = new MongoDBTestDataFactory(connections.mongodb, this.configService);
    this.redisFactory = new RedisTestDataFactory(connections.redis, this.configService);
    this.qdrantFactory = new QdrantTestDataFactory(connections.qdrant, this.configService);
  }

  /**
   * Get all test data factories
   */
  getFactories() {
    return {
      postgresql: this.postgresqlFactory,
      mongodb: this.mongodbFactory,
      redis: this.redisFactory,
      qdrant: this.qdrantFactory,
    };
  }

  /**
   * Seed all databases with comprehensive test data
   */
  async seedCompleteTestDataset(): Promise<TestDataSummary> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot seed test data in production environment');
    }

    console.log('Starting comprehensive test data seeding...');

    try {
      // Seed all databases in parallel
      const [postgresqlResult, mongodbResult, redisResult, qdrantResult] = await Promise.all([
        this.postgresqlFactory.seedCompleteDataset().catch(error => {
          console.warn('PostgreSQL seeding failed:', error);
          return { users: [], sellers: [], products: [], orders: [], payments: [] };
        }),
        this.mongodbFactory.seedCompleteDataset(),
        this.redisFactory.seedCompleteDataset(),
        this.qdrantFactory.seedCompleteDataset(),
      ]);

      const summary: TestDataSummary = {
        postgresql: {
          users: postgresqlResult.users.length,
          products: postgresqlResult.products.length,
          orders: postgresqlResult.orders.length,
          payments: postgresqlResult.payments.length,
        },
        mongodb: {
          sessions: mongodbResult.sessions.length,
          messages: mongodbResult.messages.length,
          analytics: mongodbResult.analytics.length,
        },
        redis: {
          sessions: redisResult.sessions.length,
          userCache: redisResult.userCache.length,
          productCache: redisResult.productCache.length,
          apiCache: redisResult.apiCache.length,
        },
        qdrant: {
          collections: qdrantResult.collections,
          productEmbeddings: qdrantResult.productEmbeddings,
          imageEmbeddings: qdrantResult.imageEmbeddings,
          textEmbeddings: qdrantResult.textEmbeddings,
          userPreferences: qdrantResult.userPreferences,
        },
      };

      console.log('Test data seeding completed successfully:', summary);
      return summary;
    } catch (error) {
      console.error('Failed to seed test data:', error);
      throw error;
    }
  }

  /**
   * Clean all test data from all databases
   */
  async cleanAllTestData(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    console.log('Cleaning all test data...');

    try {
      await this.databaseManager.cleanAllDatabases();
      console.log('All test data cleaned successfully');
    } catch (error) {
      console.error('Failed to clean test data:', error);
      throw error;
    }
  }

  /**
   * Set up test data for specific scenarios
   */
  async setupTestScenario(scenario: TestScenario): Promise<any> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot setup test scenarios in production environment');
    }

    console.log(`Setting up test scenario: ${scenario.name}`);

    const results: any = {};

    try {
      // Clean existing data first
      await this.cleanAllTestData();

      // Set up data for each database
      for (const database of scenario.databases) {
        switch (database) {
          case 'postgresql':
            results.postgresql = this.postgresqlFactory.generateScenarioData(scenario.scenario as any);
            break;
          case 'mongodb':
            results.mongodb = this.mongodbFactory.generateScenarioData(scenario.scenario as any);
            break;
          case 'redis':
            results.redis = await this.seedRedisScenario(scenario.scenario);
            break;
          case 'qdrant':
            results.qdrant = await this.seedQdrantScenario(scenario.scenario);
            break;
        }
      }

      console.log(`Test scenario '${scenario.name}' setup completed`);
      return results;
    } catch (error) {
      console.error(`Failed to setup test scenario '${scenario.name}':`, error);
      throw error;
    }
  }

  /**
   * Seed Redis with scenario-specific data
   */
  private async seedRedisScenario(scenario: string): Promise<any> {
    const scenarioData = this.redisFactory.generateScenarioData(scenario as any);
    
    // Seed the generated data into Redis
    const connections = this.databaseManager.getConnections();
    
    if ('sessions' in scenarioData && scenarioData.sessions) {
      for (const session of scenarioData.sessions) {
        await connections.redis.set('session', `${session.userId}:${session.sessionId}`, session.data);
      }
    }

    if ('apiCache' in scenarioData && scenarioData.apiCache) {
      for (const cache of scenarioData.apiCache) {
        await connections.redis.set('api', cache.key, cache.value, cache.ttl);
      }
    }

    return scenarioData;
  }

  /**
   * Seed Qdrant with scenario-specific data
   */
  private async seedQdrantScenario(scenario: string): Promise<any> {
    const scenarioData = this.qdrantFactory.generateScenarioData(scenario as any);
    const qdrantService = this.databaseManager.getQdrant();
    
    if ('collection' in scenarioData && 'embeddings' in scenarioData) {
      // Create collection
      await qdrantService.createCollection(scenarioData.collection);
      
      // Add embeddings
      const client = qdrantService.getClient();
      await client.upsert(scenarioData.collection.name, {
        wait: true,
        points: scenarioData.embeddings.map((embedding: any) => ({
          id: embedding.id,
          vector: embedding.vector,
          payload: embedding.payload,
        })),
      });
    }

    return scenarioData;
  }

  /**
   * Get predefined test scenarios
   */
  getPredefinedScenarios(): TestScenario[] {
    return [
      {
        name: 'E-commerce Checkout Flow',
        description: 'Complete e-commerce flow with products, cart, orders, and payments',
        databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
        scenario: 'active-orders',
      },
      {
        name: 'New User Registration',
        description: 'New user with empty cart and product recommendations',
        databases: ['postgresql', 'redis', 'qdrant'],
        scenario: 'empty-cart',
      },
      {
        name: 'High Traffic Load',
        description: 'Simulate high traffic with many concurrent sessions and cache hits',
        databases: ['mongodb', 'redis'],
        scenario: 'high-traffic',
      },
      {
        name: 'Product Search and Discovery',
        description: 'Product catalog with semantic search capabilities',
        databases: ['postgresql', 'qdrant'],
        scenario: 'product-search',
      },
      {
        name: 'Chat Bot Interactions',
        description: 'Active chat sessions with message history and analytics',
        databases: ['mongodb', 'redis'],
        scenario: 'active-chat',
      },
      {
        name: 'Multilingual Content',
        description: 'Content in multiple Indian languages with translations',
        databases: ['mongodb', 'qdrant'],
        scenario: 'multilingual',
      },
      {
        name: 'Seller Onboarding',
        description: 'New seller with initial product setup',
        databases: ['postgresql', 'redis'],
        scenario: 'new-seller',
      },
      {
        name: 'Analytics and Reporting',
        description: 'Historical data for analytics and reporting features',
        databases: ['mongodb', 'redis'],
        scenario: 'analytics-spike',
      },
    ];
  }

  /**
   * Validate test data integrity across databases
   */
  async validateTestDataIntegrity(): Promise<{
    isValid: boolean;
    issues: string[];
    summary: any;
  }> {
    const issues: string[] = [];
    const summary: any = {};

    try {
      // Check PostgreSQL
      try {
        const pgHealthy = await this.databaseManager.getPostgreSQL().healthCheck();
        summary.postgresql = { healthy: pgHealthy };
        if (!pgHealthy) issues.push('PostgreSQL is not healthy');
      } catch (error) {
        issues.push(`PostgreSQL validation failed: ${error}`);
      }

      // Check MongoDB
      try {
        const mongoHealthy = await this.databaseManager.getMongoDB().healthCheck();
        const connectionInfo = await this.databaseManager.getMongoDB().getConnectionInfo();
        summary.mongodb = { healthy: mongoHealthy, collections: connectionInfo.collections };
        if (!mongoHealthy) issues.push('MongoDB is not healthy');
      } catch (error) {
        issues.push(`MongoDB validation failed: ${error}`);
      }

      // Check Redis
      try {
        const redisHealthy = await this.databaseManager.getRedis().healthCheck();
        const stats = await this.databaseManager.getRedis().getCacheStats();
        summary.redis = { healthy: redisHealthy, connected: stats.connected };
        if (!redisHealthy) issues.push('Redis is not healthy');
      } catch (error) {
        issues.push(`Redis validation failed: ${error}`);
      }

      // Check Qdrant
      try {
        const qdrantHealthy = await this.databaseManager.getQdrant().healthCheck();
        const collections = await this.databaseManager.getQdrant().listCollections();
        summary.qdrant = { healthy: qdrantHealthy, collections };
        if (!qdrantHealthy) issues.push('Qdrant is not healthy');
      } catch (error) {
        issues.push(`Qdrant validation failed: ${error}`);
      }

      return {
        isValid: issues.length === 0,
        issues,
        summary,
      };
    } catch (error) {
      issues.push(`Validation process failed: ${error}`);
      return {
        isValid: false,
        issues,
        summary,
      };
    }
  }

  /**
   * Generate performance test data
   */
  async generatePerformanceTestData(scale: 'small' | 'medium' | 'large' = 'medium'): Promise<TestDataSummary> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot generate performance test data in production environment');
    }

    const scales = {
      small: { factor: 1 },
      medium: { factor: 10 },
      large: { factor: 100 },
    };

    const factor = scales[scale].factor;

    console.log(`Generating ${scale} scale performance test data (factor: ${factor})...`);

    // Clean existing data
    await this.cleanAllTestData();

    // Generate scaled data
    const results = await Promise.all([
      this.generatePostgreSQLPerformanceData(factor),
      this.generateMongoDBPerformanceData(factor),
      this.generateRedisPerformanceData(factor),
      this.generateQdrantPerformanceData(factor),
    ]);

    const summary: TestDataSummary = {
      postgresql: results[0],
      mongodb: results[1],
      redis: results[2],
      qdrant: results[3],
    };

    console.log(`Performance test data generation completed:`, summary);
    return summary;
  }

  private async generatePostgreSQLPerformanceData(factor: number) {
    // Note: This would require the actual Prisma schema to implement
    console.log(`Generating PostgreSQL performance data with factor ${factor}`);
    return { users: 0, products: 0, orders: 0, payments: 0 };
  }

  private async generateMongoDBPerformanceData(factor: number) {
    const connection = this.databaseManager.getMongoDB().getConnection();
    
    // Generate sessions
    const sessions = this.mongodbFactory.generateChatSessions(100 * factor);
    await connection.collection('chat_sessions').insertMany(sessions);
    
    // Generate messages
    const messages = sessions.flatMap(session => 
      this.mongodbFactory.generateConversation(session._id?.toString() || 'temp', 5)
    );
    await connection.collection('messages').insertMany(messages);
    
    // Generate analytics
    const analytics = this.mongodbFactory.generateAnalyticsEvents(500 * factor);
    await connection.collection('analytics_events').insertMany(analytics);

    return {
      sessions: sessions.length,
      messages: messages.length,
      analytics: analytics.length,
    };
  }

  private async generateRedisPerformanceData(factor: number) {
    const redis = this.databaseManager.getRedis();
    let sessionCount = 0, cacheCount = 0;

    // Generate sessions
    for (let i = 0; i < 200 * factor; i++) {
      const session = this.redisFactory.generateSession();
      await redis.set('session', `${session.userId}:${session.sessionId}`, session.data);
      sessionCount++;
    }

    // Generate cache entries
    const keyTypes = ['user', 'product', 'api'];
    for (const keyType of keyTypes) {
      for (let i = 0; i < 300 * factor; i++) {
        const cache = this.redisFactory.generateCacheEntry(keyType);
        await redis.set(keyType, cache.key, cache.value, cache.ttl);
        cacheCount++;
      }
    }

    return {
      sessions: sessionCount,
      userCache: 300 * factor,
      productCache: 300 * factor,
      apiCache: 300 * factor,
    };
  }

  private async generateQdrantPerformanceData(factor: number) {
    const qdrant = this.databaseManager.getQdrant();
    const client = qdrant.getClient();
    const collections: string[] = [];

    // Create and populate product collection
    const productCollection = `perf_products_${factor}`;
    await qdrant.createCollection({
      name: productCollection,
      vectorSize: 1536,
      distance: 'Cosine',
    });
    collections.push(productCollection);

    const productEmbeddings = this.qdrantFactory.generateProductEmbeddings(1000 * factor);
    await client.upsert(productCollection, {
      wait: true,
      points: productEmbeddings.map(embedding => ({
        id: embedding.id,
        vector: embedding.vector,
        payload: embedding.payload,
      })),
    });

    return {
      collections,
      productEmbeddings: productEmbeddings.length,
      imageEmbeddings: 0,
      textEmbeddings: 0,
      userPreferences: 0,
    };
  }
}