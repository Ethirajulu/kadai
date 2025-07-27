import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as os from 'os';
import {
  RateLimitConfig,
  RateLimitOptions,
  RateLimitResult,
  RateLimitStatus,
  SecurityRequest,
  SystemLoad,
  RateLimitRule,
  ValidatedRedisResponse,
  BurstCheckResponse,
} from '../types/security.types';
import { RedisConnectionPool, PoolConfig } from '../utils/redis-connection-pool';

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private connectionPool?: RedisConnectionPool;
  private config: RateLimitConfig;
  private isInitialized = false;

  // Lua scripts for atomic operations
  private readonly slidingWindowScript = `
    local key = KEYS[1]
    local window = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])
    local precision = tonumber(ARGV[4])

    -- Clean old entries
    redis.call('ZREMRANGEBYSCORE', key, 0, now - window)
    
    -- Count current entries
    local current = redis.call('ZCARD', key)
    
    if current < limit then
      -- Add current request
      redis.call('ZADD', key, now, now .. ':' .. math.random())
      redis.call('EXPIRE', key, math.ceil(window / 1000))
      return {current + 1, limit - current - 1, window}
    else
      -- Get oldest entry time for reset calculation
      local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
      local resetTime = oldest[2] and (oldest[2] + window) or (now + window)
      return {current, 0, resetTime - now}
    end
  `;

  private readonly fixedWindowScript = `
    local key = KEYS[1]
    local window = tonumber(ARGV[1])
    local limit = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    local windowStart = math.floor(now / window) * window
    local windowKey = key .. ':' .. windowStart
    
    local current = redis.call('GET', windowKey)
    current = current and tonumber(current) or 0
    
    if current < limit then
      local newCount = redis.call('INCR', windowKey)
      redis.call('EXPIRE', windowKey, math.ceil(window / 1000))
      return {newCount, limit - newCount, window - (now % window)}
    else
      return {current, 0, window - (now % window)}
    end
  `;

  private readonly burstCheckScript = `
    local key = KEYS[1]
    local burstWindow = tonumber(ARGV[1])
    local burstLimit = tonumber(ARGV[2])
    local now = tonumber(ARGV[3])

    -- Clean old entries (last 60 seconds for burst)
    redis.call('ZREMRANGEBYSCORE', key .. ':burst', 0, now - burstWindow)
    
    -- Count current burst entries
    local burstCount = redis.call('ZCARD', key .. ':burst')
    
    if burstCount < burstLimit then
      -- Add current request to burst tracking
      redis.call('ZADD', key .. ':burst', now, now .. ':' .. math.random())
      redis.call('EXPIRE', key .. ':burst', math.ceil(burstWindow / 1000))
      return {false, burstCount + 1}
    else
      return {true, burstCount}
    end
  `;

  constructor(private configService: ConfigService) {
    this.config = this.configService.get<RateLimitConfig>('security.rateLimit') || this.getDefaultConfig();
  }

  /**
   * Validates Redis response data for sliding/fixed window operations
   * @param result Raw Redis response
   * @returns Validated response or throws error
   */
  private validateRedisResponse(result: unknown): ValidatedRedisResponse {
    if (!Array.isArray(result) || result.length !== 3) {
      throw new Error(`Invalid Redis response format: expected array of length 3, got ${typeof result}`);
    }

    const [current, remaining, resetTimeMs] = result;

    if (typeof current !== 'number' || !Number.isInteger(current) || current < 0) {
      throw new Error(`Invalid current count: expected non-negative integer, got ${current}`);
    }

    if (typeof remaining !== 'number' || !Number.isInteger(remaining)) {
      throw new Error(`Invalid remaining count: expected integer, got ${remaining}`);
    }

    if (typeof resetTimeMs !== 'number' || !Number.isInteger(resetTimeMs) || resetTimeMs < 0) {
      throw new Error(`Invalid reset time: expected non-negative integer, got ${resetTimeMs}`);
    }

    return { current, remaining, resetTimeMs };
  }

  /**
   * Validates Redis burst check response
   * @param result Raw Redis response
   * @returns Validated burst response or throws error
   */
  private validateBurstResponse(result: unknown): BurstCheckResponse {
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error(`Invalid Redis burst response format: expected array of length 2, got ${typeof result}`);
    }

    const [exceeded, count] = result;

    if (typeof exceeded !== 'boolean') {
      throw new Error(`Invalid burst exceeded flag: expected boolean, got ${typeof exceeded}`);
    }

    if (typeof count !== 'number' || !Number.isInteger(count) || count < 0) {
      throw new Error(`Invalid burst count: expected non-negative integer, got ${count}`);
    }

    return { exceeded, count };
  }

  /**
   * Safely gets system load with proper error handling
   * @returns System load metrics or safe defaults on failure
   */
  private async getSystemLoad(): Promise<SystemLoad> {
    try {
      const loadAvg = os.loadavg()[0]; // 1-minute load average
      const cpuCount = os.cpus().length;
      
      if (cpuCount === 0) {
        throw new Error('No CPU cores detected');
      }

      const cpuPercent = Math.min(100, Math.max(0, (loadAvg / cpuCount) * 100));

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      
      if (totalMem === 0) {
        throw new Error('Invalid total memory detected');
      }

      const memoryPercent = Math.min(100, Math.max(0, ((totalMem - freeMem) / totalMem) * 100));

      return {
        cpu: Number.isFinite(cpuPercent) ? cpuPercent : 0,
        memory: Number.isFinite(memoryPercent) ? memoryPercent : 0,
      };
    } catch (error) {
      this.logger.warn('Failed to get system load, using safe defaults', error);
      // Return safe defaults instead of masking failures with zeros
      return { cpu: 50, memory: 50 }; // Conservative estimates to trigger adaptive limiting
    }
  }

  async onModuleInit() {
    if (this.config.enabled) {
      await this.initializeRedisPool();
      this.logger.log('Rate limiting service initialized with Redis connection pool');
    } else {
      this.logger.log('Rate limiting is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.connectionPool) {
      try {
        await this.connectionPool.shutdown();
        this.logger.log('Redis connection pool closed');
      } catch (error) {
        this.logger.error('Error shutting down Redis connection pool', error);
        // Don't throw error during shutdown
      }
    }
  }

  private async initializeRedisPool(): Promise<void> {
    try {
      const poolConfig: PoolConfig = {
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db || 0,
        keyPrefix: this.config.redis.keyPrefix,
        connectTimeout: this.config.redis.connectTimeout || 10000,
        lazyConnect: this.config.redis.lazyConnect ?? true,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest || 3,
        retryDelayOnFailover: this.config.redis.retryDelayOnFailover || 100,
        poolSize: this.config.redis.poolSize || 3,
        healthCheckInterval: this.config.redis.healthCheckInterval || 30000,
        enableOfflineQueue: this.config.redis.enableOfflineQueue ?? false,
        circuitBreaker: {
          failureThreshold: this.config.redis.circuitBreaker?.failureThreshold || 5,
          recoveryTimeout: this.config.redis.circuitBreaker?.recoveryTimeout || 60000,
          monitoringWindow: this.config.redis.circuitBreaker?.monitoringWindow || 300000,
        },
      };

      this.connectionPool = new RedisConnectionPool(poolConfig);
      await this.connectionPool.initialize();
      this.isInitialized = true;
      this.logger.log('Redis connection pool established successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection pool', error);
      throw error;
    }
  }

  async checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    if (!this.config.enabled || !this.isInitialized) {
      return this.createAllowedResult();
    }

    // Check if request should be skipped
    if (this.isWhitelisted(options.request)) {
      return this.createAllowedResult();
    }

    // Get appropriate rate limit rule
    const rule = this.getRateLimitRule(options);
    
    // Apply adaptive limiting if enabled
    const adaptiveRule = this.config.adaptive.enabled 
      ? await this.applyAdaptiveLimiting(rule) 
      : rule;

    // Generate rate limit key
    const key = this.createRateLimitKey(options);

    try {
      // Check burst protection if enabled
      if (options.checkBurst && adaptiveRule.burst) {
        const burstResult = await this.checkBurstLimitWithFallback(key, adaptiveRule);
        if (burstResult.exceeded) {
          return {
            allowed: false,
            remaining: 0,
            resetTime: Date.now() + 60000, // 1 minute
            totalHits: burstResult.count,
            burstExceeded: true,
          };
        }
      }

      // Check main rate limit with circuit breaker protection
      const windowType = options.windowType || 
        (this.config.slidingWindow.enabled ? 'sliding' : 'fixed');

      const result = windowType === 'sliding' 
        ? await this.checkSlidingWindowWithFallback(key, adaptiveRule)
        : await this.checkFixedWindowWithFallback(key, adaptiveRule);

      return {
        ...result,
        windowType,
        adaptiveLimit: adaptiveRule !== rule ? adaptiveRule.requests : undefined,
      };
    } catch (error) {
      this.logger.error('Rate limit check failed', error);
      // Graceful degradation: allow request when Redis is unavailable
      return this.createGracefulDegradationResult(error);
    }
  }

  private async checkSlidingWindowWithFallback(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    if (!this.connectionPool) {
      return this.createAllowedResult();
    }

    const now = Date.now();
    
    return this.connectionPool.execute(
      async (redis) => {
        const rawResult = await redis.eval(
          this.slidingWindowScript,
          1,
          key,
          rule.windowMs.toString(),
          rule.requests.toString(),
          now.toString(),
          this.config.slidingWindow.precision.toString()
        );

        const { current, remaining, resetTimeMs } = this.validateRedisResponse(rawResult);
        
        return {
          allowed: remaining > 0,
          remaining: Math.max(0, remaining),
          resetTime: now + resetTimeMs,
          totalHits: current,
        };
      },
      () => {
        this.logger.warn(`Sliding window check failed for key ${key}, using fallback`);
        return this.createAllowedResult();
      }
    );
  }

  private async checkFixedWindowWithFallback(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    if (!this.connectionPool) {
      return this.createAllowedResult();
    }

    const now = Date.now();
    
    return this.connectionPool.execute(
      async (redis) => {
        const rawResult = await redis.eval(
          this.fixedWindowScript,
          1,
          key,
          rule.windowMs.toString(),
          rule.requests.toString(),
          now.toString()
        );

        const { current, remaining, resetTimeMs } = this.validateRedisResponse(rawResult);
        
        return {
          allowed: remaining > 0,
          remaining: Math.max(0, remaining),
          resetTime: now + resetTimeMs,
          totalHits: current,
        };
      },
      () => {
        this.logger.warn(`Fixed window check failed for key ${key}, using fallback`);
        return this.createAllowedResult();
      }
    );
  }

  private async checkBurstLimitWithFallback(key: string, rule: RateLimitRule): Promise<{ exceeded: boolean; count: number }> {
    if (!rule.burst || !this.connectionPool) {
      return { exceeded: false, count: 0 };
    }

    const now = Date.now();
    
    return this.connectionPool.execute(
      async (redis) => {
        const rawResult = await redis.eval(
          this.burstCheckScript,
          1,
          key,
          '60000', // 60 second burst window
          rule.burst!.toString(),
          now.toString()
        );

        const { exceeded, count } = this.validateBurstResponse(rawResult);
        return { exceeded, count };
      },
      () => {
        this.logger.warn(`Burst limit check failed for key ${key}, using fallback (allow)`);
        return { exceeded: false, count: 0 };
      }
    );
  }

  private async applyAdaptiveLimiting(rule: RateLimitRule): Promise<RateLimitRule> {
    const systemLoad = await this.getSystemLoad();
    const isOverloaded = 
      systemLoad.cpu > this.config.adaptive.cpuThreshold ||
      systemLoad.memory > this.config.adaptive.memoryThreshold;

    if (isOverloaded) {
      const reducedLimit = Math.floor(rule.requests * this.config.adaptive.loadFactor);
      return {
        ...rule,
        requests: Math.max(1, reducedLimit), // Ensure at least 1 request is allowed
      };
    }

    return rule;
  }


  createRateLimitKey(options: RateLimitOptions): string {
    const { request, isAuthenticated } = options;
    
    if (isAuthenticated && request.user?.id) {
      // For authenticated users, use user ID
      return `user:${request.user.id}:${request.method}:${this.hashPath(request.path)}`;
    } else {
      // For anonymous users, use IP + User-Agent combination
      const ip = this.getClientIP(request);
      const userAgent = request.headers['user-agent'] || 'unknown';
      const userAgentHash = this.hashString(userAgent);
      return `ip:${ip}:${userAgentHash}:${request.method}:${this.hashPath(request.path)}`;
    }
  }

  isWhitelisted(request: SecurityRequest): boolean {
    const ip = this.getClientIP(request);
    const userAgent = request.headers['user-agent'] || '';
    
    // Check IP whitelist
    if (this.config.whitelist.ips.includes(ip)) {
      return true;
    }

    // Check path whitelist
    if (this.config.whitelist.skipPaths.some(path => request.path.startsWith(path))) {
      return true;
    }

    // Check user agent whitelist
    if (this.config.whitelist.skipUserAgents?.some(agent => userAgent.includes(agent))) {
      return true;
    }

    return false;
  }

  async getRateLimitStatus(options: RateLimitOptions): Promise<RateLimitStatus> {
    if (!this.config.enabled || !this.isInitialized || !this.connectionPool) {
      return this.createDefaultStatus();
    }

    try {
      const key = this.createRateLimitKey(options);
      const rule = this.getRateLimitRule(options);
      
      const result = await this.connectionPool.execute(
        async (redis) => {
          const current = await redis.get(key);
          const ttl = await redis.ttl(key);
          
          const currentCount = current ? parseInt(current, 10) : 0;
          const resetTime = Date.now() + (ttl > 0 ? ttl * 1000 : rule.windowMs);
          
          return {
            current: currentCount,
            limit: rule.requests,
            remaining: Math.max(0, rule.requests - currentCount),
            resetTime,
            isAdaptive: this.config.adaptive.enabled,
            systemLoad: this.config.adaptive.enabled ? await this.getSystemLoad() : undefined,
          };
        },
        () => this.createDefaultStatus()
      );
      
      return result;
    } catch (error) {
      this.logger.error('Failed to get rate limit status', error);
      return this.createDefaultStatus();
    }
  }

  private getRateLimitRule(options: RateLimitOptions): RateLimitRule {
    // Check for custom limit
    if (options.customLimit) {
      return options.customLimit;
    }

    // Check for endpoint-specific limits
    const endpointKey = `${options.request.method}:${options.request.path}`;
    if (this.config.customLimits?.[endpointKey]) {
      return this.config.customLimits[endpointKey];
    }

    // Check for wildcard endpoint limits
    for (const [pattern, rule] of Object.entries(this.config.customLimits || {})) {
      if (this.matchesPattern(endpointKey, pattern)) {
        return rule;
      }
    }

    // Use default limits based on authentication status
    return options.isAuthenticated 
      ? this.config.defaultLimits.authenticated
      : this.config.defaultLimits.anonymous;
  }

  private matchesPattern(endpoint: string, pattern: string): boolean {
    // Convert pattern to regex (simple implementation)
    const regexPattern = pattern
      .replace(/\*/g, '[^/]*')
      .replace(/\*\*/g, '.*');
    
    const regex = new RegExp(`^${regexPattern}$`);
    return regex.test(endpoint);
  }

  private getClientIP(request: SecurityRequest): string {
    return (
      (request.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      (request.headers['x-real-ip'] as string) ||
      request.connection?.remoteAddress ||
      request.socket?.remoteAddress ||
      request.ip ||
      '127.0.0.1'
    );
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private hashPath(path: string): string {
    // Simple path normalization and hashing
    const normalizedPath = path.toLowerCase().replace(/\/+$/, '') || '/';
    return this.hashString(normalizedPath);
  }

  private createAllowedResult(): RateLimitResult {
    return {
      allowed: true,
      remaining: Number.MAX_SAFE_INTEGER,
      resetTime: Date.now() + 3600000, // 1 hour
      totalHits: 0,
    };
  }

  private createDefaultStatus(): RateLimitStatus {
    return {
      current: 0,
      limit: Number.MAX_SAFE_INTEGER,
      remaining: Number.MAX_SAFE_INTEGER,
      resetTime: Date.now() + 3600000,
    };
  }

  /**
   * Create graceful degradation result when Redis is unavailable
   */
  private createGracefulDegradationResult(error: unknown): RateLimitResult {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Log the degradation
    this.logger.warn('Rate limiting degraded - allowing request due to Redis unavailability', {
      error: errorMessage,
      circuitBreakerState: this.connectionPool?.getPoolHealth().circuitBreakerState,
    });

    return {
      ...this.createAllowedResult(),
      error: `Service degraded: ${errorMessage}`,
    };
  }

  /**
   * Get Redis connection pool health status
   */
  getRedisHealth(): {
    isHealthy: boolean;
    poolHealth?: any;
    circuitBreakerState?: string;
  } {
    if (!this.connectionPool) {
      return {
        isHealthy: false,
        circuitBreakerState: 'NOT_INITIALIZED',
      };
    }

    const poolHealth = this.connectionPool.getPoolHealth();
    
    return {
      isHealthy: this.connectionPool.isHealthy(),
      poolHealth,
      circuitBreakerState: poolHealth.circuitBreakerState,
    };
  }

  /**
   * Get service health status including Redis connectivity
   */
  getServiceHealth(): {
    isHealthy: boolean;
    enabled: boolean;
    initialized: boolean;
    redisHealth: any;
  } {
    const redisHealth = this.getRedisHealth();
    
    return {
      isHealthy: this.config.enabled ? this.isInitialized && redisHealth.isHealthy : true,
      enabled: this.config.enabled,
      initialized: this.isInitialized,
      redisHealth,
    };
  }

  private getDefaultConfig(): RateLimitConfig {
    return {
      enabled: false,
      redis: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'rate_limit:',
        connectTimeout: 10000,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        retryDelayOnFailover: 100,
        poolSize: 3,
        healthCheckInterval: 30000,
        enableOfflineQueue: false,
        circuitBreaker: {
          enabled: true,
          failureThreshold: 5,
          recoveryTimeout: 60000,
          monitoringWindow: 300000,
          expectedFailureRate: 0.5,
        },
      },
      defaultLimits: {
        anonymous: {
          requests: 100,
          windowMs: 15 * 60 * 1000, // 15 minutes
          message: 'Too many requests',
        },
        authenticated: {
          requests: 200,
          windowMs: 15 * 60 * 1000, // 15 minutes
          message: 'Too many requests',
        },
      },
      slidingWindow: {
        enabled: false,
        precision: 60,
      },
      adaptive: {
        enabled: false,
        cpuThreshold: 80,
        memoryThreshold: 85,
        loadFactor: 0.5,
      },
      whitelist: {
        ips: ['127.0.0.1', '::1'],
        skipPaths: ['/health', '/metrics'],
      },
      headers: {
        includeHeaders: true,
      },
    };
  }
}