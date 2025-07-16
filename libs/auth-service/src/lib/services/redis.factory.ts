import { ConfigService } from '@nestjs/config';
import { RedisClient } from './jwt.service';

/**
 * Redis client interface for JWT service
 */
export interface RedisClientConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  lazyConnect?: boolean;
}

/**
 * Mock Redis client for testing
 */
export class MockRedisClient implements RedisClient {
  private store = new Map<string, { value: string; expiry: number }>();

  async setex(key: string, seconds: number, value: string): Promise<string> {
    const expiry = Date.now() + (seconds * 1000);
    this.store.set(key, { value, expiry });
    return 'OK';
  }

  async get(key: string): Promise<string | null> {
    const item = this.store.get(key);
    if (!item) {
      return null;
    }

    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return null;
    }

    return item.value;
  }

  async del(key: string): Promise<number> {
    const existed = this.store.has(key);
    this.store.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    const item = this.store.get(key);
    if (!item) {
      return 0;
    }

    if (Date.now() > item.expiry) {
      this.store.delete(key);
      return 0;
    }

    return 1;
  }

  // Helper methods for testing
  clear(): void {
    this.store.clear();
  }

  size(): number {
    // Clean up expired items first
    const now = Date.now();
    for (const [key, item] of this.store.entries()) {
      if (now > item.expiry) {
        this.store.delete(key);
      }
    }
    return this.store.size;
  }
}

/**
 * Redis client factory for production
 */
export class RedisClientFactory {
  static async create(configService: ConfigService): Promise<RedisClient> {
    const authConfig = configService.get('auth');
    const redisUrl = authConfig.redisUrl;

    // In a real implementation, you would use ioredis or redis package
    // For now, we'll create a mock client for development
    if (process.env.NODE_ENV === 'test' || !redisUrl.includes('redis://')) {
      return new MockRedisClient();
    }

    // Production Redis client implementation would go here
    // Example with ioredis:
    /*
    const Redis = require('ioredis');
    const client = new Redis(redisUrl, {
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });

    await client.connect();
    return client;
    */

    // For now, return mock client
    return new MockRedisClient();
  }

  static createMock(): RedisClient {
    return new MockRedisClient();
  }
}

/**
 * Redis provider for NestJS DI
 */
export const redisProvider = {
  provide: 'REDIS_CLIENT',
  useFactory: async (configService: ConfigService): Promise<RedisClient> => {
    return RedisClientFactory.create(configService);
  },
  inject: [ConfigService],
};

/**
 * Mock Redis provider for testing
 */
export const mockRedisProvider = {
  provide: 'REDIS_CLIENT',
  useFactory: (): RedisClient => {
    return RedisClientFactory.createMock();
  },
};