import { BaseSeeder } from './base-seeder';
import {
  RedisSeedScript,
  SeedOptions,
  SeedResult,
  RedisConnection,
} from '../../types';

export class RedisSeeder extends BaseSeeder implements RedisSeedScript {
  public readonly id = 'redis-seeder';
  public readonly name = 'Redis Database Seeder';
  public readonly version = '1.0.0';
  public readonly description =
    'Seeds Redis database with test cache data, sessions, and rate limits';
  public readonly dependencies: string[] = [];
  public readonly database = 'redis' as const;

  constructor(private connection: RedisConnection, options?: SeedOptions) {
    super(options);
  }

  async execute(options?: SeedOptions): Promise<SeedResult> {
    const validatedOptions = this.validateOptions(options);
    const startTime = Date.now();
    let totalRecords = 0;
    const errors: Error[] = [];

    this.emitEvent({
      type: 'seed_start',
      seedId: this.id,
      database: this.database,
      timestamp: new Date(),
      data: validatedOptions,
    });

    try {
      this.logInfo('Starting Redis seeding', validatedOptions);

      // Clean up if requested
      if (validatedOptions.cleanup) {
        await this.cleanup();
      }

      // Seed user sessions
      const sessionResult = await this.seedUserSessions(
        validatedOptions.userCount || 100
      );
      if (!sessionResult.success) {
        errors.push(...(sessionResult.errors || []));
      }
      totalRecords += sessionResult.recordsCreated;

      // Seed cache entries
      const cacheResult = await this.seedCacheEntries(
        validatedOptions.productCount || 100
      );
      if (!cacheResult.success) {
        errors.push(...(cacheResult.errors || []));
      }
      totalRecords += cacheResult.recordsCreated;

      // Seed rate limits
      const rateLimitResult = await this.seedRateLimits(
        validatedOptions.userCount || 100
      );
      if (!rateLimitResult.success) {
        errors.push(...(rateLimitResult.errors || []));
      }
      totalRecords += rateLimitResult.recordsCreated;

      // Seed API cache
      const apiCacheResult = await this.seedApiCache();
      if (!apiCacheResult.success) {
        errors.push(...(apiCacheResult.errors || []));
      }
      totalRecords += apiCacheResult.recordsCreated;

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.trackPerformance('full_seed', this.database, totalRecords, duration);

      this.emitEvent({
        type: 'seed_complete',
        seedId: this.id,
        database: this.database,
        timestamp: new Date(),
        data: { totalRecords, duration, success },
      });

      this.logInfo('Redis seeding completed', {
        totalRecords,
        duration,
        success,
        errorCount: errors.length,
      });

      return this.createSeedResult(success, totalRecords, duration, errors);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      this.emitEvent({
        type: 'seed_error',
        seedId: this.id,
        database: this.database,
        timestamp: new Date(),
        error: err,
      });

      this.logError('Redis seeding failed', err);

      return this.createSeedResult(
        false,
        totalRecords,
        Date.now() - startTime,
        errors
      );
    }
  }

  async executeCommand(command: string, ...args: unknown[]): Promise<unknown> {
    return await (this.connection.client as any)[command](...args);
  }

  async setBatch(keyValuePairs: Record<string, unknown>): Promise<SeedResult> {
    if (Object.keys(keyValuePairs).length === 0) {
      return this.createSeedResult(true, 0, 0);
    }

    const startTime = Date.now();
    const errors: Error[] = [];
    let recordsCreated = 0;

    try {
      const pipeline = this.connection.client.pipeline();

      // Add all operations to pipeline
      for (const [key, value] of Object.entries(keyValuePairs)) {
        const serializedValue =
          typeof value === 'string' ? value : JSON.stringify(value);
        pipeline.set(key, serializedValue);
      }

      // Execute pipeline
      const results = await pipeline.exec();

      if (results) {
        for (const [error] of results) {
          if (error) {
            errors.push(error);
          } else {
            recordsCreated++;
          }
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.trackPerformance(
        'batch_set',
        this.database,
        recordsCreated,
        duration
      );

      return this.createSeedResult(success, recordsCreated, duration, errors);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      return this.createSeedResult(
        false,
        recordsCreated,
        Date.now() - startTime,
        errors
      );
    }
  }

  private async seedUserSessions(userCount: number): Promise<SeedResult> {
    this.logInfo(`Seeding ${userCount} user sessions`);

    const faker = require('@faker-js/faker').faker;
    const sessions: Record<string, unknown> = {};

    for (let i = 0; i < userCount; i++) {
      const userId = faker.string.uuid();
      const sessionId = faker.string.uuid();
      const sessionKey = `session:${sessionId}`;

      sessions[sessionKey] = {
        userId,
        sessionId,
        data: {
          isAuthenticated: true,
          loginTime: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
          userAgent: faker.internet.userAgent(),
          ipAddress: faker.internet.ip(),
          preferences: {
            language: faker.helpers.arrayElement(['en', 'hi', 'ta', 'te']),
            currency: 'INR',
            theme: faker.helpers.arrayElement(['light', 'dark']),
          },
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      };

      // Also set with TTL
      const ttl = 24 * 60 * 60; // 24 hours in seconds
      await this.connection.client.setex(
        sessionKey,
        ttl,
        JSON.stringify(sessions[sessionKey])
      );
    }

    return this.createSeedResult(true, userCount, 0);
  }

  private async seedCacheEntries(productCount: number): Promise<SeedResult> {
    this.logInfo(`Seeding ${productCount} cache entries`);

    const faker = require('@faker-js/faker').faker;
    const cacheEntries: Record<string, unknown> = {};

    for (let i = 0; i < productCount; i++) {
      const productId = faker.string.uuid();
      const cacheKey = `product:${productId}`;

      cacheEntries[cacheKey] = {
        id: productId,
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        price: faker.commerce.price(),
        category: faker.helpers.arrayElement([
          'Electronics',
          'Clothing',
          'Books',
          'Home',
        ]),
        stock: faker.number.int({ min: 0, max: 1000 }),
        isActive: faker.datatype.boolean({ probability: 0.8 }),
        cachedAt: new Date().toISOString(),
      };

      // Set with TTL (1 hour)
      const ttl = 60 * 60; // 1 hour in seconds
      await this.connection.client.setex(
        cacheKey,
        ttl,
        JSON.stringify(cacheEntries[cacheKey])
      );

      // Also cache some product lists
      if (i % 10 === 0) {
        const listKey = `products:category:${(
          cacheEntries[cacheKey] as any
        ).category.toLowerCase()}`;
        const existingList = await this.connection.client.get(listKey);
        const productList = existingList ? JSON.parse(existingList) : [];
        productList.push(productId);

        await this.connection.client.setex(
          listKey,
          ttl,
          JSON.stringify(productList)
        );
      }
    }

    return this.createSeedResult(true, productCount, 0);
  }

  private async seedRateLimits(userCount: number): Promise<SeedResult> {
    this.logInfo(`Seeding ${userCount} rate limit entries`);

    const faker = require('@faker-js/faker').faker;
    const rateLimits: Record<string, unknown> = {};

    for (let i = 0; i < userCount; i++) {
      const userId = faker.string.uuid();
      const ipAddress = faker.internet.ip();

      // API rate limits per user
      const userRateLimitKey = `rate_limit:user:${userId}`;
      rateLimits[userRateLimitKey] = {
        count: faker.number.int({ min: 0, max: 100 }),
        resetTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1 hour from now
        limit: 1000,
      };

      // IP rate limits
      const ipRateLimitKey = `rate_limit:ip:${ipAddress}`;
      rateLimits[ipRateLimitKey] = {
        count: faker.number.int({ min: 0, max: 50 }),
        resetTime: new Date(Date.now() + 15 * 60 * 1000).toISOString(), // 15 minutes from now
        limit: 100,
      };

      // Set with TTL
      await this.connection.client.setex(
        userRateLimitKey,
        3600,
        JSON.stringify(rateLimits[userRateLimitKey])
      );
      await this.connection.client.setex(
        ipRateLimitKey,
        900,
        JSON.stringify(rateLimits[ipRateLimitKey])
      );
    }

    return this.createSeedResult(true, userCount * 2, 0);
  }

  private async seedApiCache(): Promise<SeedResult> {
    this.logInfo('Seeding API cache entries');

    const faker = require('@faker-js/faker').faker;
    const apiCacheEntries: Record<string, unknown> = {};

    // Common API endpoints cache
    const endpoints = [
      '/api/products/featured',
      '/api/categories',
      '/api/sellers/verified',
      '/api/orders/statistics',
      '/api/products/trending',
    ];

    for (const endpoint of endpoints) {
      const cacheKey = `api:${endpoint.replace(/\//g, ':')}`;

      apiCacheEntries[cacheKey] = {
        endpoint,
        data: this.generateMockApiResponse(endpoint),
        cachedAt: new Date().toISOString(),
        hits: faker.number.int({ min: 10, max: 1000 }),
      };

      // Set with TTL (30 minutes)
      const ttl = 30 * 60; // 30 minutes in seconds
      await this.connection.client.setex(
        cacheKey,
        ttl,
        JSON.stringify(apiCacheEntries[cacheKey])
      );
    }

    // Seed some search query cache
    const searchQueries = [
      'laptop',
      'mobile',
      'book',
      'clothing',
      'electronics',
    ];
    for (const query of searchQueries) {
      const searchKey = `search:${query}`;
      const searchResults = {
        query,
        results: Array.from(
          { length: faker.number.int({ min: 5, max: 20 }) },
          () => ({
            id: faker.string.uuid(),
            title: faker.commerce.productName(),
            price: faker.commerce.price(),
            relevance: faker.number.float({
              min: 0.1,
              max: 1.0,
              fractionDigits: 2,
            }),
          })
        ),
        totalCount: faker.number.int({ min: 50, max: 500 }),
        searchedAt: new Date().toISOString(),
      };

      const ttl = 15 * 60; // 15 minutes
      await this.connection.client.setex(
        searchKey,
        ttl,
        JSON.stringify(searchResults)
      );
    }

    return this.createSeedResult(
      true,
      endpoints.length + searchQueries.length,
      0
    );
  }

  private generateMockApiResponse(endpoint: string): unknown {
    const faker = require('@faker-js/faker').faker;

    switch (endpoint) {
      case '/api/products/featured':
        return Array.from({ length: 10 }, () => ({
          id: faker.string.uuid(),
          name: faker.commerce.productName(),
          price: faker.commerce.price(),
          image: faker.image.urlPicsumPhotos(),
          featured: true,
        }));

      case '/api/categories':
        return [
          'Electronics',
          'Clothing',
          'Books',
          'Home & Garden',
          'Sports',
          'Beauty',
        ].map((name) => ({
          id: faker.string.uuid(),
          name,
          productCount: faker.number.int({ min: 10, max: 1000 }),
        }));

      case '/api/sellers/verified':
        return Array.from({ length: 5 }, () => ({
          id: faker.string.uuid(),
          businessName: faker.company.name(),
          isVerified: true,
          rating: faker.number.float({ min: 3.5, max: 5.0, fractionDigits: 1 }),
          productCount: faker.number.int({ min: 10, max: 500 }),
        }));

      case '/api/orders/statistics':
        return {
          totalOrders: faker.number.int({ min: 1000, max: 10000 }),
          completedOrders: faker.number.int({ min: 800, max: 9000 }),
          pendingOrders: faker.number.int({ min: 10, max: 100 }),
          revenue: faker.number.float({
            min: 10000,
            max: 100000,
            fractionDigits: 2,
          }),
          averageOrderValue: faker.number.float({
            min: 500,
            max: 5000,
            fractionDigits: 2,
          }),
        };

      case '/api/products/trending':
        return Array.from({ length: 8 }, () => ({
          id: faker.string.uuid(),
          name: faker.commerce.productName(),
          price: faker.commerce.price(),
          viewCount: faker.number.int({ min: 100, max: 5000 }),
          orderCount: faker.number.int({ min: 10, max: 500 }),
        }));

      default:
        return {
          message: 'Mock API response',
          timestamp: new Date().toISOString(),
        };
    }
  }

  private async cleanup(): Promise<void> {
    this.logInfo('Cleaning up Redis database');

    const keyPatterns = [
      'session:*',
      'product:*',
      'rate_limit:*',
      'api:*',
      'search:*',
      'products:*',
    ];

    for (const pattern of keyPatterns) {
      const keys = await this.connection.client.keys(pattern);
      if (keys.length > 0) {
        await this.connection.client.del(...keys);
      }
    }

    this.logInfo('Redis cleanup completed');
  }

  override async rollback(): Promise<SeedResult> {
    const startTime = Date.now();

    try {
      await this.cleanup();
      const duration = Date.now() - startTime;

      this.logInfo('Redis rollback completed', { duration });

      return this.createSeedResult(true, 0, duration);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.logError('Redis rollback failed', err);

      return this.createSeedResult(false, 0, duration, [err]);
    }
  }

  override async validate(): Promise<boolean> {
    try {
      const keyPatterns = [
        'session:*',
        'product:*',
        'rate_limit:*',
        'api:*',
        'search:*',
      ];

      for (const pattern of keyPatterns) {
        const keys = await this.connection.client.keys(pattern);

        if (keys.length === 0) {
          this.logWarn(`No keys found for pattern ${pattern}`);
        } else {
          this.logInfo(`Found ${keys.length} keys for pattern ${pattern}`);
        }
      }

      return true;
    } catch (error) {
      this.logError('Redis validation failed', error);
      return false;
    }
  }
}
