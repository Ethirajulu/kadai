import { RedisService } from '../redis/config/redis.service';
import { faker } from '@faker-js/faker';

export interface RedisTestSession {
  userId: string;
  sessionId: string;
  data: Record<string, any>;
  expiresAt: number;
}

export interface RedisTestCache {
  key: string;
  value: any;
  ttl?: number;
  keyType: string;
}

export interface RedisTestAPIResponse {
  endpoint: string;
  method: string;
  response: any;
  timestamp: number;
}

export class RedisTestDataFactory {
  constructor(private redisService: RedisService) {}

  /**
   * Generate test session data
   */
  generateSession(overrides: Partial<RedisTestSession> = {}): RedisTestSession {
    const userId = faker.string.uuid();
    const sessionId = faker.string.alphanumeric({ length: 32 });
    
    return {
      userId,
      sessionId,
      data: {
        userId,
        sessionId,
        isAuthenticated: faker.datatype.boolean(0.8), // 80% authenticated
        lastActivity: Date.now(),
        userAgent: faker.internet.userAgent(),
        ipAddress: faker.internet.ip(),
        platform: faker.helpers.arrayElement(['web', 'mobile', 'api']),
        permissions: this.generatePermissions(),
        preferences: this.generateUserPreferences(),
        cart: this.generateCartData(),
      },
      expiresAt: Date.now() + (3600 * 1000), // 1 hour from now
      ...overrides,
    };
  }

  /**
   * Generate test cache entry
   */
  generateCacheEntry(keyType: string, overrides: Partial<RedisTestCache> = {}): RedisTestCache {
    const generators = {
      user: () => this.generateUserCache(),
      product: () => this.generateProductCache(),
      api: () => this.generateAPICache(),
      computed: () => this.generateComputedCache(),
      session: () => this.generateSessionCache(),
      order: () => this.generateOrderCache(),
    };

    const generator = generators[keyType as keyof typeof generators] || generators.api;
    
    return {
      key: faker.string.alphanumeric({ length: 16 }),
      value: generator(),
      ttl: this.getTTLForKeyType(keyType),
      keyType,
      ...overrides,
    };
  }

  /**
   * Generate user cache data
   */
  private generateUserCache() {
    return {
      id: faker.string.uuid(),
      email: faker.internet.email(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: faker.helpers.arrayElement(['CUSTOMER', 'SELLER', 'ADMIN']),
      isActive: faker.datatype.boolean(0.9),
      lastLoginAt: faker.date.recent().toISOString(),
      profilePicture: faker.image.avatar(),
      preferences: this.generateUserPreferences(),
    };
  }

  /**
   * Generate product cache data
   */
  private generateProductCache() {
    return {
      id: faker.string.uuid(),
      name: faker.commerce.productName(),
      price: parseFloat(faker.commerce.price()),
      currency: 'INR',
      description: faker.commerce.productDescription(),
      category: faker.commerce.department(),
      inStock: faker.datatype.boolean(0.8),
      stockQuantity: faker.number.int({ min: 0, max: 1000 }),
      images: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => faker.image.url()),
      rating: faker.number.float({ min: 1, max: 5, fractionDigits: 1 }),
      reviewCount: faker.number.int({ min: 0, max: 500 }),
    };
  }

  /**
   * Generate API response cache data
   */
  private generateAPICache() {
    const endpoints = [
      '/api/products',
      '/api/users',
      '/api/orders',
      '/api/analytics',
      '/api/search',
    ];

    return {
      endpoint: faker.helpers.arrayElement(endpoints),
      method: faker.helpers.arrayElement(['GET', 'POST', 'PUT', 'DELETE']),
      statusCode: faker.helpers.arrayElement([200, 201, 400, 404, 500]),
      data: this.generateRandomAPIData(),
      timestamp: Date.now(),
      responseTime: faker.number.int({ min: 10, max: 2000 }),
    };
  }

  /**
   * Generate computed cache data
   */
  private generateComputedCache() {
    return {
      computation: faker.helpers.arrayElement(['user_stats', 'product_recommendations', 'sales_analytics', 'inventory_summary']),
      result: {
        value: faker.number.float({ min: 0, max: 100000, fractionDigits: 2 }),
        computedAt: Date.now(),
        inputs: {
          userId: faker.string.uuid(),
          timeRange: '7d',
          filters: { category: faker.commerce.department() },
        },
        metadata: {
          executionTime: faker.number.int({ min: 100, max: 5000 }),
          cacheHit: faker.datatype.boolean(0.3),
        },
      },
    };
  }

  /**
   * Generate session cache data
   */
  private generateSessionCache() {
    return {
      sessionId: faker.string.alphanumeric({ length: 32 }),
      userId: faker.string.uuid(),
      createdAt: Date.now(),
      lastActivity: Date.now(),
      isActive: faker.datatype.boolean(0.7),
      data: {
        cart: this.generateCartData(),
        recentlyViewed: Array.from({ length: 5 }, () => faker.string.uuid()),
        searchHistory: Array.from({ length: 3 }, () => faker.commerce.productName()),
      },
    };
  }

  /**
   * Generate order cache data
   */
  private generateOrderCache() {
    return {
      id: faker.string.uuid(),
      orderNumber: `ORD-${faker.string.alphanumeric({ length: 8 }).toUpperCase()}`,
      userId: faker.string.uuid(),
      status: faker.helpers.arrayElement(['pending', 'confirmed', 'processing', 'shipped', 'delivered']),
      total: parseFloat(faker.commerce.price({ min: 100, max: 5000 })),
      currency: 'INR',
      items: Array.from({ length: faker.number.int({ min: 1, max: 5 }) }, () => ({
        productId: faker.string.uuid(),
        quantity: faker.number.int({ min: 1, max: 10 }),
        price: parseFloat(faker.commerce.price()),
      })),
      createdAt: faker.date.recent().toISOString(),
    };
  }

  /**
   * Generate user preferences
   */
  private generateUserPreferences() {
    return {
      language: faker.helpers.arrayElement(['en', 'hi', 'ta', 'te', 'bn']),
      currency: 'INR',
      timezone: faker.location.timeZone(),
      notifications: {
        email: faker.datatype.boolean(0.8),
        sms: faker.datatype.boolean(0.6),
        push: faker.datatype.boolean(0.9),
      },
      theme: faker.helpers.arrayElement(['light', 'dark', 'auto']),
      region: faker.location.state(),
    };
  }

  /**
   * Generate user permissions
   */
  private generatePermissions() {
    const allPermissions = ['read:products', 'write:products', 'read:orders', 'write:orders', 'admin:users'];
    const permissionCount = faker.number.int({ min: 1, max: allPermissions.length });
    return faker.helpers.arrayElements(allPermissions, permissionCount);
  }

  /**
   * Generate cart data
   */
  private generateCartData() {
    const itemCount = faker.number.int({ min: 0, max: 10 });
    const items = Array.from({ length: itemCount }, () => ({
      productId: faker.string.uuid(),
      quantity: faker.number.int({ min: 1, max: 5 }),
      price: parseFloat(faker.commerce.price()),
      addedAt: faker.date.recent().toISOString(),
    }));

    return {
      items,
      total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0),
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      updatedAt: Date.now(),
    };
  }

  /**
   * Generate random API data
   */
  private generateRandomAPIData() {
    const dataTypes = ['list', 'object', 'pagination', 'error'];
    const type = faker.helpers.arrayElement(dataTypes);

    switch (type) {
      case 'list':
        return Array.from({ length: faker.number.int({ min: 1, max: 20 }) }, () => ({
          id: faker.string.uuid(),
          name: faker.commerce.productName(),
          value: faker.number.float({ min: 0, max: 1000 }),
        }));
      
      case 'object':
        return {
          id: faker.string.uuid(),
          data: faker.lorem.paragraphs(),
          metadata: { timestamp: Date.now() },
        };
      
      case 'pagination':
        return {
          data: Array.from({ length: 10 }, () => ({ id: faker.string.uuid() })),
          pagination: {
            page: faker.number.int({ min: 1, max: 10 }),
            limit: 10,
            total: faker.number.int({ min: 50, max: 1000 }),
          },
        };
      
      case 'error':
        return {
          error: faker.helpers.arrayElement(['ValidationError', 'NotFoundError', 'ServerError']),
          message: faker.lorem.sentence(),
          code: faker.number.int({ min: 1000, max: 9999 }),
        };
      
      default:
        return { data: faker.lorem.words() };
    }
  }

  /**
   * Get appropriate TTL for key type
   */
  private getTTLForKeyType(keyType: string): number {
    const ttlMap = {
      session: 3600, // 1 hour
      user: 900, // 15 minutes
      product: 600, // 10 minutes
      api: 300, // 5 minutes
      computed: 1800, // 30 minutes
      order: 300, // 5 minutes
    };

    return ttlMap[keyType as keyof typeof ttlMap] || 300;
  }

  /**
   * Seed Redis with test data
   */
  async seedCompleteDataset(): Promise<{
    sessions: RedisTestSession[];
    userCache: RedisTestCache[];
    productCache: RedisTestCache[];
    apiCache: RedisTestCache[];
  }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot seed test data in production environment');
    }

    const results = {
      sessions: [] as RedisTestSession[],
      userCache: [] as RedisTestCache[],
      productCache: [] as RedisTestCache[],
      apiCache: [] as RedisTestCache[],
    };

    try {
      // Generate and store sessions
      for (let i = 0; i < 10; i++) {
        const session = this.generateSession();
        await this.redisService.set('session', `${session.userId}:${session.sessionId}`, session.data);
        results.sessions.push(session);
      }

      // Generate and store user cache
      for (let i = 0; i < 20; i++) {
        const userCache = this.generateCacheEntry('user');
        await this.redisService.set('user', userCache.key, userCache.value, userCache.ttl);
        results.userCache.push(userCache);
      }

      // Generate and store product cache
      for (let i = 0; i < 50; i++) {
        const productCache = this.generateCacheEntry('product');
        await this.redisService.set('product', productCache.key, productCache.value, productCache.ttl);
        results.productCache.push(productCache);
      }

      // Generate and store API cache
      for (let i = 0; i < 30; i++) {
        const apiCache = this.generateCacheEntry('api');
        await this.redisService.set('api', apiCache.key, apiCache.value, apiCache.ttl);
        results.apiCache.push(apiCache);
      }

      console.log('Redis test data seeding completed:', {
        sessions: results.sessions.length,
        userCache: results.userCache.length,
        productCache: results.productCache.length,
        apiCache: results.apiCache.length,
      });

      return results;
    } catch (error) {
      console.error('Failed to seed Redis test data:', error);
      throw error;
    }
  }

  /**
   * Generate test data for specific scenarios
   */
  generateScenarioData(scenario: 'high-traffic' | 'session-cleanup' | 'cache-warming' | 'user-activity') {
    switch (scenario) {
      case 'high-traffic':
        return {
          apiCache: Array.from({ length: 1000 }, () => this.generateCacheEntry('api')),
          sessions: Array.from({ length: 500 }, () => this.generateSession()),
        };
      
      case 'session-cleanup': {
        const now = Date.now();
        return {
          expiredSessions: Array.from({ length: 50 }, () => 
            this.generateSession({ expiresAt: now - (3600 * 1000) }) // Expired 1 hour ago
          ),
          activeSessions: Array.from({ length: 20 }, () => 
            this.generateSession({ expiresAt: now + (3600 * 1000) }) // Expires in 1 hour
          ),
        };
      }
      
      case 'cache-warming':
        return {
          popularProducts: Array.from({ length: 100 }, () => this.generateCacheEntry('product')),
          userProfiles: Array.from({ length: 200 }, () => this.generateCacheEntry('user')),
          computedData: Array.from({ length: 50 }, () => this.generateCacheEntry('computed')),
        };
      
      case 'user-activity': {
        const userId = faker.string.uuid();
        return {
          userSession: this.generateSession({ userId }),
          userCache: this.generateCacheEntry('user', { key: userId }),
          recentOrders: Array.from({ length: 5 }, () => this.generateCacheEntry('order')),
        };
      }
      
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * Clean all test data from Redis
   */
  async cleanAllTestData(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    await this.redisService.flushDb();
  }

  /**
   * Clean specific key patterns
   */
  async cleanKeyPatterns(patterns: { keyType: string; pattern: string }[]): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    for (const { keyType, pattern } of patterns) {
      await this.redisService.deletePattern(keyType, pattern);
      console.log(`Cleaned pattern: ${keyType}:${pattern}`);
    }
  }

  /**
   * Simulate cache performance scenarios
   */
  async simulateCacheScenarios(): Promise<{
    hitRate: number;
    missRate: number;
    operations: number;
  }> {
    let hits = 0;
    let misses = 0;
    const operations = 100;

    for (let i = 0; i < operations; i++) {
      const key = faker.string.alphanumeric({ length: 8 });
      const keyType = faker.helpers.arrayElement(['user', 'product', 'api']);
      
      // Simulate cache hit/miss
      if (faker.datatype.boolean(0.7)) { // 70% cache hit rate
        const value = this.generateCacheEntry(keyType).value;
        await this.redisService.set(keyType, key, value);
        hits++;
      } else {
        // Simulate cache miss
        const result = await this.redisService.get(keyType, key);
        if (!result) misses++;
      }
    }

    return {
      hitRate: hits / operations,
      missRate: misses / operations,
      operations,
    };
  }
}