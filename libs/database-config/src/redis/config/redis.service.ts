import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis, { Cluster } from 'ioredis';

export interface CacheKeyConfig {
  prefix: string;
  ttl: number; // in seconds
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  cluster?: boolean;
  clusterNodes?: string[];
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  connectTimeout?: number;
  commandTimeout?: number;
  keyPrefix?: string;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client!: Redis | Cluster;
  private readonly config: RedisConfig;

  // Cache key configurations with TTL strategies
  private readonly cacheKeys: Record<string, CacheKeyConfig> = {
    session: { prefix: 'session:', ttl: 3600 }, // 1 hour
    api: { prefix: 'api:', ttl: 300 }, // 5 minutes
    computed: { prefix: 'computed:', ttl: 1800 }, // 30 minutes
    user: { prefix: 'user:', ttl: 900 }, // 15 minutes
    product: { prefix: 'product:', ttl: 600 }, // 10 minutes
    order: { prefix: 'order:', ttl: 300 }, // 5 minutes
  };

  constructor(private configService: ConfigService) {
    this.config = {
      host: this.configService.get<string>('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get<string>('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      cluster: this.configService.get<boolean>('REDIS_CLUSTER', false),
      clusterNodes: this.configService.get<string>('REDIS_CLUSTER_NODES', '')
        .split(',')
        .filter(node => node.trim())
        .map(node => node.trim()),
      retryDelayOnFailover: this.configService.get<number>('REDIS_RETRY_DELAY', 100),
      maxRetriesPerRequest: this.configService.get<number>('REDIS_MAX_RETRIES', 3),
      connectTimeout: this.configService.get<number>('REDIS_CONNECT_TIMEOUT', 10000),
      commandTimeout: this.configService.get<number>('REDIS_COMMAND_TIMEOUT', 5000),
      keyPrefix: this.configService.get<string>('REDIS_KEY_PREFIX', 'kadai:'),
    };
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private async connect(): Promise<void> {
    try {
      if (this.config.cluster && this.config.clusterNodes && this.config.clusterNodes.length > 0) {
        this.client = new Cluster(this.config.clusterNodes, {
          redisOptions: {
            password: this.config.password,
            connectTimeout: this.config.connectTimeout,
            commandTimeout: this.config.commandTimeout,
            keyPrefix: this.config.keyPrefix,
            maxRetriesPerRequest: this.config.maxRetriesPerRequest,
          },
        });
      } else {
        this.client = new Redis({
          host: this.config.host,
          port: this.config.port,
          password: this.config.password,
          db: this.config.db,
          connectTimeout: this.config.connectTimeout,
          commandTimeout: this.config.commandTimeout,
          keyPrefix: this.config.keyPrefix,
          maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        });
      }

      this.client.on('connect', () => {
        this.logger.log('Redis connected successfully');
      });

      this.client.on('error', (error) => {
        this.logger.error('Redis connection error:', error);
      });

      this.client.on('ready', () => {
        this.logger.log('Redis is ready to receive commands');
      });

      await this.client.ping();
      this.logger.log('Redis ping successful');
    } catch (error) {
      this.logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  private async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.logger.log('Redis disconnected');
    }
  }

  // Cache operations with key naming conventions
  async set(keyType: string, key: string, value: unknown, customTtl?: number): Promise<void> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullKey = `${cacheConfig.prefix}${key}`;
    const ttl = customTtl || cacheConfig.ttl;
    const serializedValue = JSON.stringify(value);

    await this.client.setex(fullKey, ttl, serializedValue);
  }

  async get<T>(keyType: string, key: string): Promise<T | null> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullKey = `${cacheConfig.prefix}${key}`;
    const value = await this.client.get(fullKey);

    if (!value) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch (error) {
      this.logger.error(`Failed to parse cached value for key ${fullKey}:`, error);
      return null;
    }
  }

  async delete(keyType: string, key: string): Promise<void> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullKey = `${cacheConfig.prefix}${key}`;
    await this.client.del(fullKey);
  }

  async deletePattern(keyType: string, pattern: string): Promise<void> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullPattern = `${cacheConfig.prefix}${pattern}`;
    const keys = await this.client.keys(fullPattern);
    
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async exists(keyType: string, key: string): Promise<boolean> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullKey = `${cacheConfig.prefix}${key}`;
    const result = await this.client.exists(fullKey);
    return result === 1;
  }

  async expire(keyType: string, key: string, ttl: number): Promise<void> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullKey = `${cacheConfig.prefix}${key}`;
    await this.client.expire(fullKey, ttl);
  }

  async getTtl(keyType: string, key: string): Promise<number> {
    const cacheConfig = this.cacheKeys[keyType];
    if (!cacheConfig) {
      throw new Error(`Unknown cache key type: ${keyType}`);
    }

    const fullKey = `${cacheConfig.prefix}${key}`;
    return await this.client.ttl(fullKey);
  }

  // Direct Redis client access for advanced operations
  getClient(): Redis | Cluster {
    return this.client;
  }

  // Cache invalidation patterns
  async invalidateUserCache(userId: string): Promise<void> {
    await this.deletePattern('user', `${userId}:*`);
    await this.deletePattern('session', `${userId}:*`);
  }

  async invalidateProductCache(productId: string): Promise<void> {
    await this.deletePattern('product', `${productId}:*`);
    await this.deletePattern('computed', `product:${productId}:*`);
  }

  async invalidateOrderCache(orderId: string): Promise<void> {
    await this.deletePattern('order', `${orderId}:*`);
  }

  async flushAll(): Promise<void> {
    await this.client.flushall();
    this.logger.warn('All Redis cache has been flushed');
  }

  async flushDb(): Promise<void> {
    await this.client.flushdb();
    this.logger.warn('Current Redis database has been flushed');
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      this.logger.error('Redis health check failed:', error);
      return false;
    }
  }

  // Get Redis info
  async getInfo(): Promise<string> {
    return await this.client.info();
  }

  // Get cache statistics
  async getCacheStats(): Promise<{
    connected: boolean;
    info: Record<string, string>;
  }> {
    const info = await this.getInfo();
    const stats = {
      connected: await this.healthCheck(),
      info: info.split('\r\n').reduce((acc, line) => {
        const [key, value] = line.split(':');
        if (key && value) {
          acc[key] = value;
        }
        return acc;
      }, {} as Record<string, string>),
    };
    return stats;
  }
}