import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantService } from './qdrant.service';
import {
  COLLECTION_SCHEMAS,
  COLLECTION_INITIALIZATION_ORDER,
  getCollectionName,
} from '../schemas/collection-schemas';

export interface CollectionStatus {
  name: string;
  exists: boolean;
  vectorsCount?: number;
  status?: string;
  optimizerStatus?: string;
  error?: string;
}

@Injectable()
export class CollectionInitializerService {
  private readonly logger = new Logger(CollectionInitializerService.name);
  private readonly environment: string;

  constructor(
    private readonly qdrantService: QdrantService,
    private readonly configService: ConfigService
  ) {
    this.environment = this.configService.get<string>(
      'NODE_ENV',
      'development'
    );
  }

  async initializeAllCollections(): Promise<void> {
    this.logger.log(
      `Initializing Qdrant collections for environment: ${this.environment}`
    );

    try {
      // Initialize collections in the specified order
      for (const schemaKey of COLLECTION_INITIALIZATION_ORDER) {
        await this.initializeCollection(schemaKey);
      }

      this.logger.log('All collections initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize collections', error);
      throw error;
    }
  }

  async initializeCollection(schemaKey: string): Promise<void> {
    try {
      const schema = COLLECTION_SCHEMAS[schemaKey];
      if (!schema) {
        throw new Error(`Unknown collection schema: ${schemaKey}`);
      }

      const collectionName = getCollectionName(schemaKey, this.environment);

      this.logger.log(`Initializing collection: ${collectionName}`);

      // Create collection with environment-specific name
      const collectionConfig = {
        ...schema,
        name: collectionName,
      };

      const created = await this.qdrantService.createCollection(
        collectionConfig
      );

      if (created) {
        this.logger.log(`Successfully created collection: ${collectionName}`);
      } else {
        this.logger.log(`Collection already exists: ${collectionName}`);
      }
    } catch (error) {
      this.logger.error(`Failed to initialize collection ${schemaKey}`, error);
      throw error;
    }
  }

  async deleteAllCollections(): Promise<void> {
    this.logger.warn(
      `Deleting all collections for environment: ${this.environment}`
    );

    try {
      // Delete collections in reverse order
      const reverseOrder = [...COLLECTION_INITIALIZATION_ORDER].reverse();

      for (const schemaKey of reverseOrder) {
        const collectionName = getCollectionName(schemaKey, this.environment);

        try {
          await this.qdrantService.deleteCollection(collectionName);
          this.logger.log(`Deleted collection: ${collectionName}`);
        } catch (error) {
          this.logger.warn(
            `Failed to delete collection ${collectionName}:`,
            error instanceof Error ? error.message : String(error)
          );
        }
      }

      this.logger.log('All collections deleted successfully');
    } catch (error) {
      this.logger.error('Failed to delete collections', error);
      throw error;
    }
  }

  async recreateAllCollections(): Promise<void> {
    this.logger.log('Recreating all collections');

    await this.deleteAllCollections();
    await this.initializeAllCollections();

    this.logger.log('All collections recreated successfully');
  }

  async getCollectionStatus(): Promise<Record<string, CollectionStatus>> {
    const status: Record<string, CollectionStatus> = {};

    try {
      const existingCollections = await this.qdrantService.listCollections();

      for (const schemaKey of COLLECTION_INITIALIZATION_ORDER) {
        const collectionName = getCollectionName(schemaKey, this.environment);
        const exists = existingCollections.includes(collectionName);

        if (exists) {
          try {
            const info = await this.qdrantService.getCollectionInfo(
              collectionName
            );
            status[schemaKey] = {
              name: collectionName,
              exists: true,
              vectorsCount: info.vectors_count as number,
              status: info.status as string,
              optimizerStatus: info.optimizer_status as string,
            };
          } catch (error) {
            status[schemaKey] = {
              name: collectionName,
              exists: true,
              error: error instanceof Error ? error.message : String(error),
            };
          }
        } else {
          status[schemaKey] = {
            name: collectionName,
            exists: false,
          };
        }
      }

      return status;
    } catch (error) {
      this.logger.error('Failed to get collection status', error);
      throw error;
    }
  }

  async validateCollections(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      const status = await this.getCollectionStatus();

      for (const [schemaKey, collectionStatus] of Object.entries(status)) {
        if (!collectionStatus.exists) {
          errors.push(`Collection missing: ${collectionStatus.name}`);
          continue;
        }

        if (collectionStatus.error) {
          errors.push(
            `Collection error ${collectionStatus.name}: ${collectionStatus.error}`
          );
          continue;
        }

        // Validate collection configuration
        const schema = COLLECTION_SCHEMAS[schemaKey];
        if (schema) {
          try {
            const info = await this.qdrantService.getCollectionInfo(
              collectionStatus.name
            );

            // Check vector size
            const vectorSize = (info as any).config?.params?.vectors?.size;
            if (vectorSize !== schema.vectorSize) {
              errors.push(
                `Vector size mismatch for ${collectionStatus.name}: expected ${schema.vectorSize}, got ${vectorSize}`
              );
            }

            // Check distance metric
            const distance = (info as any).config?.params?.vectors?.distance;
            if (distance !== schema.distance) {
              errors.push(
                `Distance metric mismatch for ${collectionStatus.name}: expected ${schema.distance}, got ${distance}`
              );
            }
          } catch (error) {
            errors.push(
              `Failed to validate collection ${collectionStatus.name}: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
          }
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to validate collections', error);
      return {
        valid: false,
        errors: [
          `Validation failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ],
      };
    }
  }
}
