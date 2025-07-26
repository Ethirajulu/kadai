import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import * as os from 'os';
import {
  RateLimitConfig,
  RateLimitOptions,
  RateLimitResult,
  RateLimitStatus,
  SecurityRequest,
  SystemLoad,
  RateLimitRule,
} from '../types/security.types';

@Injectable()
export class RateLimitService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RateLimitService.name);
  private redis!: Redis;
  private config: RateLimitConfig;

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

  async onModuleInit() {
    if (this.config.enabled) {
      await this.initializeRedis();
      this.logger.log('Rate limiting service initialized with Redis backend');
    } else {
      this.logger.log('Rate limiting is disabled');
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      await this.redis.disconnect();
      this.logger.log('Redis connection closed');
    }
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis({
        host: this.config.redis.host,
        port: this.config.redis.port,
        password: this.config.redis.password,
        db: this.config.redis.db || 0,
        keyPrefix: this.config.redis.keyPrefix,
        connectTimeout: this.config.redis.connectTimeout || 10000,
        lazyConnect: this.config.redis.lazyConnect ?? true,
        maxRetriesPerRequest: this.config.redis.maxRetriesPerRequest || 3,
      });

      // Test Redis connection
      await this.redis.ping();
      this.logger.log('Redis connection established successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis', error);
      throw error;
    }
  }

  async checkRateLimit(options: RateLimitOptions): Promise<RateLimitResult> {
    if (!this.config.enabled) {
      return this.createAllowedResult();
    }

    try {
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

      // Check burst protection if enabled
      if (options.checkBurst && adaptiveRule.burst) {
        const burstResult = await this.checkBurstLimit(key, adaptiveRule);
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

      // Check main rate limit
      const windowType = options.windowType || 
        (this.config.slidingWindow.enabled ? 'sliding' : 'fixed');

      const result = windowType === 'sliding' 
        ? await this.checkSlidingWindow(key, adaptiveRule)
        : await this.checkFixedWindow(key, adaptiveRule);

      return {
        ...result,
        windowType,
        adaptiveLimit: adaptiveRule !== rule ? adaptiveRule.requests : undefined,
      };
    } catch (error) {
      this.logger.error('Rate limit check failed', error);
      // Fail-open: allow request when Redis is unavailable
      return {
        ...this.createAllowedResult(),
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  private async checkSlidingWindow(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const result = await this.redis.eval(
      this.slidingWindowScript,
      1,
      key,
      rule.windowMs.toString(),
      rule.requests.toString(),
      now.toString(),
      this.config.slidingWindow.precision.toString()
    ) as [number, number, number];

    const [current, remaining, resetTimeMs] = result;
    
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      resetTime: now + resetTimeMs,
      totalHits: current,
    };
  }

  private async checkFixedWindow(key: string, rule: RateLimitRule): Promise<RateLimitResult> {
    const now = Date.now();
    const result = await this.redis.eval(
      this.fixedWindowScript,
      1,
      key,
      rule.windowMs.toString(),
      rule.requests.toString(),
      now.toString()
    ) as [number, number, number];

    const [current, remaining, resetTimeMs] = result;
    
    return {
      allowed: remaining > 0,
      remaining: Math.max(0, remaining),
      resetTime: now + resetTimeMs,
      totalHits: current,
    };
  }

  private async checkBurstLimit(key: string, rule: RateLimitRule): Promise<{ exceeded: boolean; count: number }> {
    if (!rule.burst) {
      return { exceeded: false, count: 0 };
    }

    const now = Date.now();
    const result = await this.redis.eval(
      this.burstCheckScript,
      1,
      key,
      '60000', // 60 second burst window
      rule.burst.toString(),
      now.toString()
    ) as [boolean, number];

    const [exceeded, count] = result;
    return { exceeded, count };
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

  private async getSystemLoad(): Promise<SystemLoad> {
    try {
      const loadAvg = os.loadavg()[0]; // 1-minute load average
      const cpuCount = os.cpus().length;
      const cpuPercent = Math.min(100, (loadAvg / cpuCount) * 100);

      const totalMem = os.totalmem();
      const freeMem = os.freemem();
      const memoryPercent = ((totalMem - freeMem) / totalMem) * 100;

      return {
        cpu: cpuPercent,
        memory: memoryPercent,
      };
    } catch (error) {
      this.logger.warn('Failed to get system load', error);
      return { cpu: 0, memory: 0 };
    }
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
    if (!this.config.enabled) {
      return this.createDefaultStatus();
    }

    try {
      const key = this.createRateLimitKey(options);
      const rule = this.getRateLimitRule(options);
      
      const current = await this.redis.get(key);
      const ttl = await this.redis.ttl(key);
      
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

  private getDefaultConfig(): RateLimitConfig {
    return {
      enabled: false,
      redis: {
        host: 'localhost',
        port: 6379,
        keyPrefix: 'rate_limit:',
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