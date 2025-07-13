import {
  DatabaseConnections,
  TestDatabaseConfig,
  PostgreSQLTestConfig,
  MongoDBTestConfig,
  RedisTestConfig,
  QdrantTestConfig,
  PostgreSQLConnection,
  MongoDBConnection,
  RedisConnection,
  QdrantConnection,
} from '../types';
import { PostgreSQLConnectionFactory } from './factories/postgresql-factory';
import { MongoDBConnectionFactory } from './factories/mongodb-factory';
import { RedisConnectionFactory } from './factories/redis-factory';
import { QdrantConnectionFactory } from './factories/qdrant-factory';

export class TestDatabaseManager {
  private connections: DatabaseConnections = {};
  private config: TestDatabaseConfig;
  private isInitialized = false;

  constructor(config: TestDatabaseConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      const connectionPromises: Promise<void>[] = [];

      if (this.config.postgresql) {
        connectionPromises.push(
          this.initializePostgreSQL(this.config.postgresql)
        );
      }

      if (this.config.mongodb) {
        connectionPromises.push(this.initializeMongoDB(this.config.mongodb));
      }

      if (this.config.redis) {
        connectionPromises.push(this.initializeRedis(this.config.redis));
      }

      if (this.config.qdrant) {
        connectionPromises.push(this.initializeQdrant(this.config.qdrant));
      }

      await Promise.all(connectionPromises);
      this.isInitialized = true;
    } catch (error) {
      await this.cleanup();
      throw new Error(
        `Failed to initialize test databases: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private async initializePostgreSQL(
    config: PostgreSQLTestConfig
  ): Promise<void> {
    const factory = new PostgreSQLConnectionFactory();
    this.connections.postgresql = await factory.createConnection(config);
  }

  private async initializeMongoDB(config: MongoDBTestConfig): Promise<void> {
    const factory = new MongoDBConnectionFactory();
    this.connections.mongodb = await factory.createConnection(config);
  }

  private async initializeRedis(config: RedisTestConfig): Promise<void> {
    const factory = new RedisConnectionFactory();
    this.connections.redis = await factory.createConnection(config);
  }

  private async initializeQdrant(config: QdrantTestConfig): Promise<void> {
    const factory = new QdrantConnectionFactory();
    this.connections.qdrant = await factory.createConnection(config);
  }

  getPostgreSQLConnection(): PostgreSQLConnection | undefined {
    return this.connections.postgresql;
  }

  getMongoDBConnection(): MongoDBConnection | undefined {
    return this.connections.mongodb;
  }

  getRedisConnection(): RedisConnection | undefined {
    return this.connections.redis;
  }

  getQdrantConnection(): QdrantConnection | undefined {
    return this.connections.qdrant;
  }

  getAllConnections(): DatabaseConnections {
    return { ...this.connections };
  }

  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const healthStatus: { [key: string]: boolean } = {};

    const checks: Promise<void>[] = [];

    if (this.connections.postgresql) {
      checks.push(
        this.checkPostgreSQLHealth().then(
          (healthy) => void (healthStatus.postgresql = healthy)
        )
      );
    }

    if (this.connections.mongodb) {
      checks.push(
        this.checkMongoDBHealth().then(
          (healthy) => void (healthStatus.mongodb = healthy)
        )
      );
    }

    if (this.connections.redis) {
      checks.push(
        this.checkRedisHealth().then(
          (healthy) => void (healthStatus.redis = healthy)
        )
      );
    }

    if (this.connections.qdrant) {
      checks.push(
        this.checkQdrantHealth().then(
          (healthy) => void (healthStatus.qdrant = healthy)
        )
      );
    }

    await Promise.all(checks);
    return healthStatus;
  }

  private async checkPostgreSQLHealth(): Promise<boolean> {
    try {
      const result = await this.connections.postgresql?.pool.query('SELECT 1');
      return result?.rows.length === 1;
    } catch {
      return false;
    }
  }

  private async checkMongoDBHealth(): Promise<boolean> {
    try {
      await this.connections.mongodb?.client.db('admin').admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  private async checkRedisHealth(): Promise<boolean> {
    try {
      const pong = await this.connections.redis?.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  private async checkQdrantHealth(): Promise<boolean> {
    try {
      await this.connections.qdrant?.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<void>[] = [];

    if (this.connections.postgresql) {
      cleanupPromises.push(this.cleanupPostgreSQL());
    }

    if (this.connections.mongodb) {
      cleanupPromises.push(this.cleanupMongoDB());
    }

    if (this.connections.redis) {
      cleanupPromises.push(this.cleanupRedis());
    }

    if (this.connections.qdrant) {
      cleanupPromises.push(this.cleanupQdrant());
    }

    await Promise.allSettled(cleanupPromises);
    this.connections = {};
    this.isInitialized = false;
  }

  private async cleanupPostgreSQL(): Promise<void> {
    try {
      await this.connections.postgresql?.pool.end();
      this.connections.postgresql = undefined;
    } catch (error) {
      console.warn('Error cleaning up PostgreSQL connection:', error);
    }
  }

  private async cleanupMongoDB(): Promise<void> {
    try {
      await this.connections.mongodb?.client.close();
      this.connections.mongodb = undefined;
    } catch (error) {
      console.warn('Error cleaning up MongoDB connection:', error);
    }
  }

  private async cleanupRedis(): Promise<void> {
    try {
      this.connections.redis?.client.disconnect();
      this.connections.redis = undefined;
    } catch (error) {
      console.warn('Error cleaning up Redis connection:', error);
    }
  }

  private async cleanupQdrant(): Promise<void> {
    try {
      // Qdrant client doesn't require explicit cleanup
      this.connections.qdrant = undefined;
    } catch (error) {
      console.warn('Error cleaning up Qdrant connection:', error);
    }
  }

  isConnected(): boolean {
    return this.isInitialized;
  }
}
