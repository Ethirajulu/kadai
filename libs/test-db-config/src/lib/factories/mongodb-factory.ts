import { MongoClient } from 'mongodb';
import { MongoDBTestConfig, MongoDBConnection } from '../../types';

export class MongoDBConnectionFactory {
  async createConnection(
    config: MongoDBTestConfig
  ): Promise<MongoDBConnection> {
    // Construct URI from config if not provided
    const uri = this.buildConnectionUri(config);

    const client = new MongoClient(uri, {
      connectTimeoutMS: config.timeout || 2000,
      serverSelectionTimeoutMS: config.serverSelectionTimeoutMS || 2000,
      maxPoolSize: config.maxPoolSize || 10,
      minPoolSize: config.minPoolSize || 1,
    });

    try {
      await client.connect();
      await this.testConnection(client);

      const database = client.db(config.database);

      return {
        client,
        database,
        config,
      };
    } catch (error) {
      await client.close();
      throw new Error(
        `Failed to create MongoDB connection: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private buildConnectionUri(config: MongoDBTestConfig): string {
    // If already a full URI, use it
    if (
      config.host &&
      (config.host.startsWith('mongodb://') ||
        config.host.startsWith('mongodb+srv://'))
    ) {
      return config.host;
    }

    // Build URI from components
    const auth =
      config.username && config.password
        ? `${config.username}:${config.password}@`
        : '';
    const host = config.host || 'localhost';
    const port = config.port ? `:${config.port}` : ':27017';
    const database = config.database || '';
    const authSource = config.authSource
      ? `?authSource=${config.authSource}`
      : '';

    return `mongodb://${auth}${host}${port}/${database}${authSource}`;
  }

  private async testConnection(client: MongoClient): Promise<void> {
    await client.db('admin').admin().ping();
  }

  async closeConnection(connection: MongoDBConnection): Promise<void> {
    await connection.client.close();
  }

  async isHealthy(connection: MongoDBConnection): Promise<boolean> {
    try {
      await connection.client.db('admin').admin().ping();
      return true;
    } catch {
      return false;
    }
  }

  createTestDatabaseName(baseName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test_${baseName}_${timestamp}_${random}`;
  }

  createTestCollectionName(baseName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test_${baseName}_${timestamp}_${random}`;
  }

  async createIndexes(
    connection: MongoDBConnection,
    collectionName: string
  ): Promise<void> {
    const collection = connection.database.collection(collectionName);

    // Create common indexes for test data
    await collection.createIndex({ createdAt: 1 });
    await collection.createIndex({ updatedAt: 1 });

    // Create specific indexes based on collection type
    if (collectionName.includes('user')) {
      await collection.createIndex({ email: 1 }, { unique: true });
      await collection.createIndex({ username: 1 }, { unique: true });
    } else if (collectionName.includes('session')) {
      await collection.createIndex({ sessionId: 1 });
      await collection.createIndex({ userId: 1 });
      await collection.createIndex({ timestamp: 1 });
    } else if (collectionName.includes('message')) {
      await collection.createIndex({ sessionId: 1 });
      await collection.createIndex({ userId: 1 });
      await collection.createIndex({ timestamp: 1 });
    }
  }
}
