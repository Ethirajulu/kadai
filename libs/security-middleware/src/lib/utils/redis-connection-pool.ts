/**
 * Redis Connection Pool Manager with circuit breaker integration
 * Provides connection pooling, health checks, and graceful degradation
 */

import Redis, { RedisOptions } from 'ioredis';
import { Logger } from '@nestjs/common';
import { RedisCircuitBreaker, CircuitBreakerState } from './redis-circuit-breaker';

export interface PoolConfig extends RedisOptions {
  poolSize?: number;
  healthCheckInterval?: number;
  retryDelayOnFailover?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnClusterDown?: number;
  enableOfflineQueue?: boolean;
  circuitBreaker?: {
    failureThreshold?: number;
    recoveryTimeout?: number;
    monitoringWindow?: number;
    expectedFailureRate?: number;
  };
}

export interface ConnectionHealth {
  isHealthy: boolean;
  responseTime: number;
  lastCheck: number;
  error?: string;
}

export class RedisConnectionPool {
  private readonly logger = new Logger(RedisConnectionPool.name);
  private connections: Redis[] = [];
  private healthStatus: Map<number, ConnectionHealth> = new Map();
  private circuitBreaker: RedisCircuitBreaker;
  private healthCheckTimer?: NodeJS.Timeout;
  private config: any;
  private isShuttingDown = false;
  private connectionIndex = 0;

  constructor(config: PoolConfig) {
    this.config = {
      poolSize: config.poolSize ?? 3,
      healthCheckInterval: config.healthCheckInterval ?? 30000, // 30 seconds
      retryDelayOnFailover: config.retryDelayOnFailover ?? 100,
      maxRetriesPerRequest: config.maxRetriesPerRequest ?? 3,
      retryDelayOnClusterDown: config.retryDelayOnClusterDown ?? 300,
      enableOfflineQueue: config.enableOfflineQueue ?? false,
      circuitBreaker: {
        failureThreshold: config.circuitBreaker?.failureThreshold ?? 5,
        recoveryTimeout: config.circuitBreaker?.recoveryTimeout ?? 60000,
        monitoringWindow: config.circuitBreaker?.monitoringWindow ?? 300000,
        expectedFailureRate: config.circuitBreaker?.expectedFailureRate ?? 0.5,
      },
      ...config,
    };

    this.circuitBreaker = new RedisCircuitBreaker('RedisPool', this.config.circuitBreaker);
  }

  /**
   * Initialize the connection pool
   */
  async initialize(): Promise<void> {
    try {
      this.logger.log(`Initializing Redis connection pool with ${this.config.poolSize} connections`);

      // Create connections
      for (let i = 0; i < this.config.poolSize; i++) {
        await this.createConnection(i);
      }

      // Start health check monitoring
      this.startHealthCheck();

      this.logger.log('Redis connection pool initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Redis connection pool', error);
      throw error;
    }
  }

  /**
   * Create a single Redis connection
   */
  private async createConnection(index: number): Promise<void> {
    const connectionConfig: RedisOptions = {
      host: this.config.host,
      port: this.config.port,
      password: this.config.password,
      db: this.config.db,
      keyPrefix: this.config.keyPrefix,
      connectTimeout: this.config.connectTimeout,
      maxRetriesPerRequest: this.config.maxRetriesPerRequest,
      enableOfflineQueue: this.config.enableOfflineQueue,
      lazyConnect: true,
    };

    const redis = new Redis(connectionConfig);

    // Setup event handlers
    redis.on('connect', () => {
      this.logger.debug(`Redis connection ${index} established`);
      this.updateConnectionHealth(index, { isHealthy: true, responseTime: 0, lastCheck: Date.now() });
    });

    redis.on('error', (error) => {
      this.logger.error(`Redis connection ${index} error:`, error);
      this.updateConnectionHealth(index, {
        isHealthy: false,
        responseTime: 0,
        lastCheck: Date.now(),
        error: error.message,
      });
    });

    redis.on('close', () => {
      this.logger.warn(`Redis connection ${index} closed`);
      this.updateConnectionHealth(index, {
        isHealthy: false,
        responseTime: 0,
        lastCheck: Date.now(),
        error: 'Connection closed',
      });
    });

    redis.on('reconnecting', () => {
      this.logger.debug(`Redis connection ${index} reconnecting`);
    });

    // Test connection
    try {
      await redis.connect();
      await redis.ping();
      this.connections[index] = redis;
      this.updateConnectionHealth(index, { isHealthy: true, responseTime: 0, lastCheck: Date.now() });
    } catch (error) {
      this.logger.error(`Failed to connect Redis connection ${index}:`, error);
      this.updateConnectionHealth(index, {
        isHealthy: false,
        responseTime: 0,
        lastCheck: Date.now(),
        error: error instanceof Error ? error.message : 'Connection failed',
      });
      throw error;
    }
  }

  /**
   * Get a healthy Redis connection
   */
  async getConnection(): Promise<Redis> {
    if (this.isShuttingDown) {
      throw new Error('Connection pool is shutting down');
    }

    // Check circuit breaker
    if (!this.circuitBreaker.isAvailable()) {
      throw new Error(`Redis circuit breaker is ${this.circuitBreaker.getState()}`);
    }

    // Find a healthy connection using round-robin
    let attempts = 0;

    while (attempts < this.config.poolSize) {
      const index = (this.connectionIndex + attempts) % this.config.poolSize;
      const connection = this.connections[index];
      const health = this.healthStatus.get(index);

      if (connection && health?.isHealthy) {
        this.connectionIndex = (index + 1) % this.config.poolSize;
        return connection;
      }

      attempts++;
    }

    throw new Error('No healthy Redis connections available');
  }

  /**
   * Execute Redis operation with circuit breaker protection
   */
  async execute<T>(operation: (redis: Redis) => Promise<T>, fallback?: () => T): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      const redis = await this.getConnection();
      return operation(redis);
    }, fallback);
  }

  /**
   * Update connection health status
   */
  private updateConnectionHealth(index: number, health: ConnectionHealth): void {
    this.healthStatus.set(index, health);
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    if (this.healthCheckTimer) {
      return;
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);

    this.logger.debug(`Health check started with ${this.config.healthCheckInterval}ms interval`);
  }

  /**
   * Perform health check on all connections
   */
  private async performHealthCheck(): Promise<void> {
    if (this.isShuttingDown) {
      return;
    }

    const healthChecks = this.connections.map(async (connection, index) => {
      if (!connection) {
        return;
      }

      const startTime = Date.now();
      try {
        await connection.ping();
        const responseTime = Date.now() - startTime;
        
        this.updateConnectionHealth(index, {
          isHealthy: true,
          responseTime,
          lastCheck: Date.now(),
        });
      } catch (error) {
        this.updateConnectionHealth(index, {
          isHealthy: false,
          responseTime: 0,
          lastCheck: Date.now(),
          error: error instanceof Error ? error.message : 'Health check failed',
        });

        // Attempt to reconnect if connection is broken
        this.attemptReconnection(index).catch((reconnectError) => {
          this.logger.error(`Failed to reconnect Redis connection ${index}:`, reconnectError);
        });
      }
    });

    await Promise.allSettled(healthChecks);
  }

  /**
   * Attempt to reconnect a failed connection
   */
  private async attemptReconnection(index: number): Promise<void> {
    const connection = this.connections[index];
    if (!connection) {
      return;
    }

    try {
      await connection.disconnect();
      await this.createConnection(index);
      this.logger.log(`Successfully reconnected Redis connection ${index}`);
    } catch (error) {
      this.logger.error(`Failed to reconnect Redis connection ${index}:`, error);
      throw error;
    }
  }

  /**
   * Get pool health status
   */
  getPoolHealth(): {
    totalConnections: number;
    healthyConnections: number;
    circuitBreakerState: CircuitBreakerState;
    connections: ConnectionHealth[];
  } {
    const connections = Array.from(this.healthStatus.values());
    const healthyConnections = connections.filter(conn => conn.isHealthy).length;

    return {
      totalConnections: this.config.poolSize,
      healthyConnections,
      circuitBreakerState: this.circuitBreaker.getState(),
      connections,
    };
  }

  /**
   * Check if pool is healthy
   */
  isHealthy(): boolean {
    const health = this.getPoolHealth();
    return health.healthyConnections > 0 && 
           health.circuitBreakerState !== CircuitBreakerState.OPEN;
  }

  /**
   * Gracefully shutdown the connection pool
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    // Close all connections
    const shutdownPromises = this.connections.map(async (connection, index) => {
      if (connection) {
        try {
          await connection.disconnect();
          this.logger.debug(`Redis connection ${index} disconnected`);
        } catch (error) {
          this.logger.error(`Error disconnecting Redis connection ${index}:`, error);
        }
      }
    });

    await Promise.allSettled(shutdownPromises);
    this.connections = [];
    this.healthStatus.clear();

    this.logger.log('Redis connection pool shutdown completed');
  }
}