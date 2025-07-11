/* cSpell:ignore hnsw */
import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface QdrantCollectionConfig {
  name: string;
  vectorSize: number;
  distance: 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan';
  payloadIndexes?: Record<string, string>; // field name -> field type
  description?: string;
}

export type QdrantCollectionInfo = Record<string, unknown>;
export type QdrantCreateCollectionRequest = Record<string, unknown>;
export type QdrantPayloadIndexRequest = Record<string, unknown>;

export interface QdrantConnectionConfig {
  host: string;
  port: number;
  https?: boolean;
  apiKey?: string;
  timeout?: number;
  retryAttempts?: number;
}

@Injectable()
export class QdrantService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QdrantService.name);
  private client!: QdrantClient;
  private connectionConfig: QdrantConnectionConfig;

  constructor(private configService: ConfigService) {
    this.connectionConfig = this.getConnectionConfig();
  }

  async onModuleInit() {
    await this.connect();
  }

  async onModuleDestroy() {
    await this.disconnect();
  }

  private getConnectionConfig(): QdrantConnectionConfig {
    const host = this.configService.get<string>('QDRANT_HOST', 'localhost');
    const port = this.configService.get<number>('QDRANT_PORT', 6333);
    const https = this.configService.get<boolean>('QDRANT_HTTPS', false);
    const apiKey = this.configService.get<string>('QDRANT_API_KEY');
    const timeout = this.configService.get<number>('QDRANT_TIMEOUT', 30000);
    const retryAttempts = this.configService.get<number>(
      'QDRANT_RETRY_ATTEMPTS',
      3
    );

    return {
      host,
      port,
      https,
      apiKey,
      timeout,
      retryAttempts,
    };
  }

  private async connect(): Promise<void> {
    try {
      const { host, port, https, apiKey, timeout } = this.connectionConfig;

      this.client = new QdrantClient({
        host,
        port,
        https,
        apiKey,
        timeout,
      });

      // Test connection
      await this.client.getCollections();

      this.logger.log(
        `Connected to Qdrant at ${https ? 'https' : 'http'}://${host}:${port}`
      );
    } catch (error) {
      this.logger.error('Failed to connect to Qdrant', error);
      throw new Error(
        `Qdrant connection failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  private async disconnect(): Promise<void> {
    if (this.client) {
      this.logger.log('Disconnecting from Qdrant');
      // Qdrant client doesn't have explicit disconnect method
      // Connection cleanup happens automatically
    }
  }

  getClient(): QdrantClient {
    if (!this.client) {
      throw new Error('Qdrant client not initialized');
    }
    return this.client;
  }

  async createCollection(config: QdrantCollectionConfig): Promise<boolean> {
    try {
      const { name, vectorSize, distance, payloadIndexes } = config;

      // Check if collection already exists
      const collections = await this.client.getCollections();
      const existingCollection = collections.collections.find(
        (col) => col.name === name
      );

      if (existingCollection) {
        this.logger.warn(`Collection '${name}' already exists`);
        return false;
      }

      // Create collection using the simplified API
      await this.client.createCollection(name, {
        vectors: {
          size: vectorSize,
          distance,
        },
      });

      // Create payload indexes if specified
      if (payloadIndexes) {
        await this.createPayloadIndexes(name, payloadIndexes);
      }

      this.logger.log(
        `Created collection '${name}' with vector size ${vectorSize} and distance ${distance}`
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to create collection '${config.name}'`, error);
      throw error;
    }
  }

  async createPayloadIndexes(
    collectionName: string,
    indexes: Record<string, string>
  ): Promise<void> {
    try {
      for (const [fieldName, fieldType] of Object.entries(indexes)) {
        await this.client.createPayloadIndex(collectionName, {
          field_name: fieldName,
          field_schema: fieldType as 'keyword' | 'integer' | 'float' | 'geo' | 'text' | 'bool' | 'datetime' | 'uuid',
        });
        this.logger.log(
          `Created index for field '${fieldName}' in collection '${collectionName}'`
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to create payload indexes for collection '${collectionName}'`,
        error
      );
      throw error;
    }
  }

  async getCollectionInfo(collectionName: string): Promise<QdrantCollectionInfo> {
    try {
      return await this.client.getCollection(collectionName);
    } catch (error) {
      this.logger.error(
        `Failed to get collection info for '${collectionName}'`,
        error
      );
      throw error;
    }
  }

  async deleteCollection(collectionName: string): Promise<boolean> {
    try {
      await this.client.deleteCollection(collectionName);
      this.logger.log(`Deleted collection '${collectionName}'`);
      return true;
    } catch (error) {
      this.logger.error(
        `Failed to delete collection '${collectionName}'`,
        error
      );
      throw error;
    }
  }

  async listCollections(): Promise<string[]> {
    try {
      const collections = await this.client.getCollections();
      return collections.collections.map((col) => col.name);
    } catch (error) {
      this.logger.error('Failed to list collections', error);
      throw error;
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch (error) {
      this.logger.error('Qdrant health check failed', error);
      return false;
    }
  }

  async getClusterInfo(): Promise<Record<string, unknown>> {
    try {
      // Use version info as cluster info since cluster_status is not available in this client version
      return await this.client.versionInfo();
    } catch (error) {
      this.logger.error('Failed to get cluster info', error);
      throw error;
    }
  }
}
