import { Redis } from 'ioredis';
import { RedisTestConfig, RedisConnection } from '../../types';

export class RedisConnectionFactory {
  async createConnection(config: RedisTestConfig): Promise<RedisConnection> {
    const redisConfig = {
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db || 0,
      keyPrefix: config.keyPrefix || 'test:',
      connectTimeout: 2000,
      lazyConnect: true,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      ...config.options,
    };

    const client = new Redis(redisConfig);

    try {
      await client.connect();
      await this.testConnection(client);
      
      return {
        client,
        config,
      };
    } catch (error) {
      client.disconnect();
      throw new Error(`Failed to create Redis connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async testConnection(client: Redis): Promise<void> {
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping failed');
    }
  }

  async closeConnection(connection: RedisConnection): Promise<void> {
    connection.client.disconnect();
  }

  async isHealthy(connection: RedisConnection): Promise<boolean> {
    try {
      const pong = await connection.client.ping();
      return pong === 'PONG';
    } catch {
      return false;
    }
  }

  createTestKeyPrefix(baseName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test:${baseName}:${timestamp}:${random}:`;
  }

  async clearTestData(connection: RedisConnection, pattern?: string): Promise<void> {
    const keyPattern = pattern || `${connection.config.keyPrefix || 'test:'}*`;
    const stream = connection.client.scanStream({
      match: keyPattern,
      count: 100,
    });

    const pipeline = connection.client.pipeline();
    let keysToDelete: string[] = [];

    stream.on('data', (keys: string[]) => {
      keysToDelete.push(...keys);
      
      // Process in batches of 100
      if (keysToDelete.length >= 100) {
        for (const key of keysToDelete) {
          pipeline.del(key);
        }
        keysToDelete = [];
      }
    });

    await new Promise<void>((resolve, reject) => {
      stream.on('end', () => {
        // Delete remaining keys
        if (keysToDelete.length > 0) {
          for (const key of keysToDelete) {
            pipeline.del(key);
          }
        }
        
        pipeline.exec()
          .then(() => resolve())
          .catch(reject);
      });
      
      stream.on('error', reject);
    });
  }

  async setTestData(
    connection: RedisConnection,
    key: string,
    value: string | object,
    ttl?: number
  ): Promise<void> {
    const serializedValue = typeof value === 'string' ? value : JSON.stringify(value);
    const prefixedKey = `${connection.config.keyPrefix || ''}${key}`;
    
    if (ttl) {
      await connection.client.setex(prefixedKey, ttl, serializedValue);
    } else {
      await connection.client.set(prefixedKey, serializedValue);
    }
  }

  async getTestData(connection: RedisConnection, key: string): Promise<string | null> {
    const prefixedKey = `${connection.config.keyPrefix || ''}${key}`;
    return await connection.client.get(prefixedKey);
  }
}