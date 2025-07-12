import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './postgresql/config/prisma.service';
import { MongodbService } from './mongodb/config/mongodb.service';
import { RedisService } from './redis/config/redis.service';
import { QdrantService } from './qdrant/config/qdrant.service';
import { DatabaseHealthCheckService, OverallHealthStatus } from './health-check.service';

export interface DatabaseManagerConfig {
  reconnectAttempts: number;
  reconnectDelay: number;
  connectionTimeout: number;
  enableGracefulShutdown: boolean;
  enableHealthMonitoring: boolean;
  healthCheckInterval: number; // in milliseconds
}

export interface ConnectionStatus {
  postgresql: boolean;
  mongodb: boolean;
  redis: boolean;
  qdrant: boolean;
}

export interface DatabaseConnections {
  prisma: PrismaService;
  mongodb: MongodbService;
  redis: RedisService;
  qdrant: QdrantService;
}

@Injectable()
export class DatabaseManager implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseManager.name);
  private isInitialized = false;
  private isShuttingDown = false;
  private healthCheckInterval?: NodeJS.Timeout;
  private readonly config: DatabaseManagerConfig;

  constructor(
    private readonly configService: ConfigService,
    private readonly prismaService: PrismaService,
    private readonly mongodbService: MongodbService,
    private readonly redisService: RedisService,
    private readonly qdrantService: QdrantService,
    private readonly healthCheckService: DatabaseHealthCheckService,
  ) {
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 2000,
      connectionTimeout: 30000,
      enableGracefulShutdown: true,
      enableHealthMonitoring: true,
      healthCheckInterval: 60000, // 1 minute
    };
  }

  async onModuleInit(): Promise<void> {
    this.logger.log('Initializing Database Manager...');
    
    try {
      await this.initializeConnections();
      this.isInitialized = true;
      
      if (this.config.enableHealthMonitoring) {
        this.startHealthMonitoring();
      }
      
      this.logger.log('Database Manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize Database Manager:', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.config.enableGracefulShutdown) {
      await this.gracefulShutdown();
    }
  }

  /**
   * Initialize all database connections with retry logic
   */
  private async initializeConnections(): Promise<void> {
    const connections = [
      { name: 'PostgreSQL', service: this.prismaService },
      { name: 'MongoDB', service: this.mongodbService },
      { name: 'Redis', service: this.redisService },
      { name: 'Qdrant', service: this.qdrantService },
    ];

    const promises = connections.map(async ({ name, service }) => {
      try {
        // Services should already be initialized through their own onModuleInit
        // We just verify they are working
        await this.verifyConnection(name, service);
        this.logger.log(`${name} connection verified`);
      } catch (error) {
        this.logger.error(`Failed to verify ${name} connection:`, error);
        
        if (this.config.reconnectAttempts > 0) {
          await this.retryConnection(name, service);
        } else {
          throw error;
        }
      }
    });

    await Promise.all(promises);
    this.logger.log('All database connections initialized');
  }

  /**
   * Verify a database connection is working
   */
  private async verifyConnection(name: string, service: any): Promise<void> {
    if (service.healthCheck) {
      const isHealthy = await service.healthCheck();
      if (!isHealthy) {
        throw new Error(`${name} health check failed`);
      }
    } else {
      throw new Error(`${name} service does not implement health check`);
    }
  }

  /**
   * Retry connection with exponential backoff
   */
  private async retryConnection(name: string, service: any): Promise<void> {
    let attempts = 0;
    const maxAttempts = this.config.reconnectAttempts;

    while (attempts < maxAttempts) {
      attempts++;
      const delay = this.config.reconnectDelay * Math.pow(2, attempts - 1);
      
      this.logger.warn(`Retrying ${name} connection (attempt ${attempts}/${maxAttempts}) in ${delay}ms`);
      
      await this.sleep(delay);
      
      try {
        await this.verifyConnection(name, service);
        this.logger.log(`${name} connection restored after ${attempts} attempts`);
        return;
      } catch (error) {
        if (attempts === maxAttempts) {
          this.logger.error(`Failed to restore ${name} connection after ${maxAttempts} attempts:`, error);
          throw error;
        }
      }
    }
  }

  /**
   * Get current connection status for all databases
   */
  async getConnectionStatus(): Promise<ConnectionStatus> {
    const [postgresql, mongodb, redis, qdrant] = await Promise.all([
      this.prismaService.healthCheck().catch(() => false),
      this.mongodbService.healthCheck().catch(() => false),
      this.redisService.healthCheck().catch(() => false),
      this.qdrantService.healthCheck().catch(() => false),
    ]);

    return {
      postgresql,
      mongodb,
      redis,
      qdrant,
    };
  }

  /**
   * Get all database service instances
   */
  getConnections(): DatabaseConnections {
    if (!this.isInitialized) {
      throw new Error('Database Manager not initialized');
    }

    return {
      prisma: this.prismaService,
      mongodb: this.mongodbService,
      redis: this.redisService,
      qdrant: this.qdrantService,
    };
  }

  /**
   * Get PostgreSQL service
   */
  getPostgreSQL(): PrismaService {
    return this.getConnections().prisma;
  }

  /**
   * Get MongoDB service
   */
  getMongoDB(): MongodbService {
    return this.getConnections().mongodb;
  }

  /**
   * Get Redis service
   */
  getRedis(): RedisService {
    return this.getConnections().redis;
  }

  /**
   * Get Qdrant service
   */
  getQdrant(): QdrantService {
    return this.getConnections().qdrant;
  }

  /**
   * Perform comprehensive health check on all databases
   */
  async performHealthCheck(): Promise<OverallHealthStatus> {
    return await this.healthCheckService.checkAllDatabases();
  }

  /**
   * Start periodic health monitoring
   */
  private startHealthMonitoring(): void {
    this.logger.log(`Starting health monitoring with ${this.config.healthCheckInterval}ms interval`);
    
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthStatus = await this.performHealthCheck();
        
        if (healthStatus.overall !== 'healthy') {
          this.logger.warn(`Database health status: ${healthStatus.overall}`, {
            summary: healthStatus.summary,
            unhealthyDatabases: healthStatus.databases
              .filter(db => db.status !== 'healthy')
              .map(db => ({ name: db.name, status: db.status, error: db.error })),
          });
        } else {
          this.logger.debug('All databases healthy');
        }
      } catch (error) {
        this.logger.error('Health monitoring error:', error);
      }
    }, this.config.healthCheckInterval);
  }

  /**
   * Stop health monitoring
   */
  private stopHealthMonitoring(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = undefined;
      this.logger.log('Health monitoring stopped');
    }
  }

  /**
   * Graceful shutdown of all database connections
   */
  async gracefulShutdown(): Promise<void> {
    if (this.isShuttingDown) {
      this.logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.logger.log('Starting graceful database shutdown...');

    try {
      // Stop health monitoring
      this.stopHealthMonitoring();

      // Wait for ongoing operations to complete (simple timeout)
      await this.sleep(1000);

      // Close connections in reverse order of dependency
      const shutdownPromises = [
        this.qdrantService.onModuleDestroy?.(),
        this.redisService.onModuleDestroy?.(),
        this.mongodbService.onModuleDestroy?.(),
        this.prismaService.onModuleDestroy?.(),
      ].filter(Boolean);

      await Promise.all(shutdownPromises);
      
      this.logger.log('Database graceful shutdown completed');
    } catch (error) {
      this.logger.error('Error during graceful shutdown:', error);
      throw error;
    } finally {
      this.isInitialized = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Force reconnect all databases
   */
  async reconnectAll(): Promise<void> {
    this.logger.log('Force reconnecting all databases...');
    
    try {
      await this.gracefulShutdown();
      await this.initializeConnections();
      
      if (this.config.enableHealthMonitoring) {
        this.startHealthMonitoring();
      }
      
      this.isInitialized = true;
      this.logger.log('All databases reconnected successfully');
    } catch (error) {
      this.logger.error('Failed to reconnect databases:', error);
      throw error;
    }
  }

  /**
   * Check if the manager is ready to serve requests
   */
  isReady(): boolean {
    return this.isInitialized && !this.isShuttingDown;
  }

  /**
   * Get database manager configuration
   */
  getConfig(): DatabaseManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration (requires restart to take effect)
   */
  updateConfig(newConfig: Partial<DatabaseManagerConfig>): void {
    Object.assign(this.config, newConfig);
    this.logger.log('Database manager configuration updated');
  }

  /**
   * Clean all databases (test environments only)
   */
  async cleanAllDatabases(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean databases in production environment');
    }

    this.logger.warn('Cleaning all databases...');

    try {
      const promises = [];

      // Clean PostgreSQL
      if (this.prismaService.cleanDb) {
        promises.push(this.prismaService.cleanDb());
      }

      // Clean MongoDB
      if (this.mongodbService.cleanDb) {
        promises.push(this.mongodbService.cleanDb());
      }

      // Clean Redis
      if (this.redisService.flushDb) {
        promises.push(this.redisService.flushDb());
      }

      // Clean Qdrant
      if (this.qdrantService.cleanDb) {
        promises.push(this.qdrantService.cleanDb());
      }

      await Promise.all(promises);
      this.logger.warn('All databases cleaned');
    } catch (error) {
      this.logger.error('Error cleaning databases:', error);
      throw error;
    }
  }

  /**
   * Utility method for delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}