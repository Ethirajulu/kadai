import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Injectable()
export class MongodbService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(MongodbService.name);

  constructor(
    @InjectConnection() private readonly connection: Connection,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    this.connection.on('connected', () => {
      this.logger.log('MongoDB connected successfully');
    });

    this.connection.on('error', (error) => {
      this.logger.error('MongoDB connection error:', error);
    });

    this.connection.on('disconnected', () => {
      this.logger.warn('MongoDB disconnected');
    });
  }

  async onModuleDestroy() {
    await this.connection.close();
    this.logger.log('MongoDB connection closed');
  }

  getConnection(): Connection {
    return this.connection;
  }

  async healthCheck(): Promise<boolean> {
    try {
      if (!this.connection.db) return false;
      const adminDb = this.connection.db.admin();
      const result = await adminDb.ping();
      return result.ok === 1;
    } catch (error) {
      this.logger.error('MongoDB health check failed:', error);
      return false;
    }
  }

  async getConnectionInfo(): Promise<{
    connected: boolean;
    readyState: number;
    host: string;
    port: number;
    name: string;
    collections: string[];
  }> {
    try {
      if (!this.connection.db)
        throw new Error('Database connection not available');
      const collections = await this.connection.db.listCollections().toArray();
      return {
        connected: this.connection.readyState === 1,
        readyState: this.connection.readyState,
        host: this.connection.host,
        port: this.connection.port,
        name: this.connection.name,
        collections: collections.map((col) => col.name),
      };
    } catch (error) {
      this.logger.error('Failed to get MongoDB connection info:', error);
      throw error;
    }
  }

  async getServerStatus(): Promise<Record<string, unknown>> {
    try {
      if (!this.connection.db)
        throw new Error('Database connection not available');
      const adminDb = this.connection.db.admin();
      return await adminDb.serverStatus();
    } catch (error) {
      this.logger.error('Failed to get MongoDB server status:', error);
      throw error;
    }
  }

  async cleanDatabase(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean database in production environment');
    }

    try {
      if (!this.connection.db)
        throw new Error('Database connection not available');
      await this.connection.db.dropDatabase();
      this.logger.warn('MongoDB database cleaned');
    } catch (error) {
      this.logger.error('Failed to clean MongoDB database:', error);
      throw error;
    }
  }
}
