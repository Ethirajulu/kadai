import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from './postgresql/config/prisma.service';
import { MongodbService } from './mongodb/config/mongodb.service';
import { RedisService } from './redis/config/redis.service';
import { QdrantService } from './qdrant/config/qdrant.service';

export interface DatabaseHealthStatus {
  name: string;
  status: 'healthy' | 'unhealthy' | 'unknown';
  responseTime: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface OverallHealthStatus {
  overall: 'healthy' | 'unhealthy' | 'degraded';
  databases: DatabaseHealthStatus[];
  timestamp: Date;
  summary: {
    total: number;
    healthy: number;
    unhealthy: number;
    unknown: number;
  };
}

@Injectable()
export class DatabaseHealthCheckService {
  private readonly logger = new Logger(DatabaseHealthCheckService.name);

  constructor(
    private readonly prismaService: PrismaService,
    private readonly mongodbService: MongodbService,
    private readonly redisService: RedisService,
    private readonly qdrantService: QdrantService,
  ) {}

  async checkPostgreSQLHealth(): Promise<DatabaseHealthStatus> {
    const startTime = Date.now();
    try {
      const isHealthy = await this.prismaService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const connectionInfo = await this.prismaService.getConnectionInfo();
        return {
          name: 'PostgreSQL',
          status: 'healthy',
          responseTime,
          details: connectionInfo,
        };
      } else {
        return {
          name: 'PostgreSQL',
          status: 'unhealthy',
          responseTime,
          error: 'Health check failed',
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'PostgreSQL',
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkMongoDBHealth(): Promise<DatabaseHealthStatus> {
    const startTime = Date.now();
    try {
      const isHealthy = await this.mongodbService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const connectionInfo = await this.mongodbService.getConnectionInfo();
        return {
          name: 'MongoDB',
          status: 'healthy',
          responseTime,
          details: connectionInfo,
        };
      } else {
        return {
          name: 'MongoDB',
          status: 'unhealthy',
          responseTime,
          error: 'Health check failed',
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'MongoDB',
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkRedisHealth(): Promise<DatabaseHealthStatus> {
    const startTime = Date.now();
    try {
      const isHealthy = await this.redisService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const stats = await this.redisService.getCacheStats();
        return {
          name: 'Redis',
          status: 'healthy',
          responseTime,
          details: {
            connected: stats.connected,
            keyspace: stats.info.keyspace_hits || 0,
            memory: stats.info.used_memory_human || 'unknown',
          },
        };
      } else {
        return {
          name: 'Redis',
          status: 'unhealthy',
          responseTime,
          error: 'Health check failed',
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'Redis',
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkQdrantHealth(): Promise<DatabaseHealthStatus> {
    const startTime = Date.now();
    try {
      const isHealthy = await this.qdrantService.healthCheck();
      const responseTime = Date.now() - startTime;

      if (isHealthy) {
        const collections = await this.qdrantService.listCollections();
        const versionInfo = await this.qdrantService.getClusterInfo();
        return {
          name: 'Qdrant',
          status: 'healthy',
          responseTime,
          details: {
            collections: collections.length,
            collectionNames: collections,
            version: versionInfo,
          },
        };
      } else {
        return {
          name: 'Qdrant',
          status: 'unhealthy',
          responseTime,
          error: 'Health check failed',
        };
      }
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        name: 'Qdrant',
        status: 'unhealthy',
        responseTime,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async checkAllDatabases(): Promise<OverallHealthStatus> {
    const startTime = Date.now();
    this.logger.log('Starting comprehensive database health check');

    try {
      // Run all health checks in parallel
      const [postgresql, mongodb, redis, qdrant] = await Promise.all([
        this.checkPostgreSQLHealth(),
        this.checkMongoDBHealth(),
        this.checkRedisHealth(),
        this.checkQdrantHealth(),
      ]);

      const databases = [postgresql, mongodb, redis, qdrant];
      const summary = {
        total: databases.length,
        healthy: databases.filter(db => db.status === 'healthy').length,
        unhealthy: databases.filter(db => db.status === 'unhealthy').length,
        unknown: databases.filter(db => db.status === 'unknown').length,
      };

      let overall: 'healthy' | 'unhealthy' | 'degraded';
      if (summary.healthy === summary.total) {
        overall = 'healthy';
      } else if (summary.unhealthy === summary.total) {
        overall = 'unhealthy';
      } else {
        overall = 'degraded';
      }

      const totalTime = Date.now() - startTime;
      this.logger.log(`Database health check completed in ${totalTime}ms. Overall status: ${overall}`);
      
      return {
        overall,
        databases,
        timestamp: new Date(),
        summary,
      };
    } catch (error) {
      this.logger.error('Error during database health check:', error);
      throw error;
    }
  }

  async getHealthSummary(): Promise<{
    status: string;
    checks: Record<string, boolean>;
    timestamp: Date;
  }> {
    const healthStatus = await this.checkAllDatabases();
    
    const checks = healthStatus.databases.reduce((acc, db) => {
      acc[db.name.toLowerCase()] = db.status === 'healthy';
      return acc;
    }, {} as Record<string, boolean>);

    return {
      status: healthStatus.overall,
      checks,
      timestamp: healthStatus.timestamp,
    };
  }
}