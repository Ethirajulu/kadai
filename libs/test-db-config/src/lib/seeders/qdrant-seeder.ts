import { BaseSeeder } from './base-seeder';
import {
  QdrantSeedScript,
  SeedOptions,
  SeedResult,
  QdrantConnection,
  VectorTestData,
} from '../../types';
import { VectorDataFactory } from '../factories';

export class QdrantSeeder extends BaseSeeder implements QdrantSeedScript {
  public readonly id = 'qdrant-seeder';
  public readonly name = 'Qdrant Database Seeder';
  public readonly version = '1.0.0';
  public readonly description =
    'Seeds Qdrant database with test vector data for products, conversations, and documents';
  public readonly dependencies: string[] = [];
  public readonly database = 'qdrant' as const;

  private vectorFactory: VectorDataFactory;

  constructor(private connection: QdrantConnection, options?: SeedOptions) {
    super(options);
    this.vectorFactory = new VectorDataFactory();
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
      this.logInfo('Starting Qdrant seeding', validatedOptions);

      // Clean up if requested
      if (validatedOptions.cleanup) {
        await this.cleanup();
      }

      // Create collections
      await this.createCollections();

      // Seed product vectors
      const productVectorResult = await this.seedProductVectors(
        validatedOptions.productCount || 100
      );
      if (!productVectorResult.success) {
        errors.push(...(productVectorResult.errors || []));
      }
      totalRecords += productVectorResult.recordsCreated;

      // Seed conversation vectors
      const conversationVectorResult = await this.seedConversationVectors(
        validatedOptions.messageCount || 1000
      );
      if (!conversationVectorResult.success) {
        errors.push(...(conversationVectorResult.errors || []));
      }
      totalRecords += conversationVectorResult.recordsCreated;

      // Seed document vectors
      const documentVectorResult = await this.seedDocumentVectors(50);
      if (!documentVectorResult.success) {
        errors.push(...(documentVectorResult.errors || []));
      }
      totalRecords += documentVectorResult.recordsCreated;

      // Seed user behavior vectors
      const behaviorVectorResult = await this.seedUserBehaviorVectors(
        validatedOptions.userCount || 100
      );
      if (!behaviorVectorResult.success) {
        errors.push(...(behaviorVectorResult.errors || []));
      }
      totalRecords += behaviorVectorResult.recordsCreated;

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

      this.logInfo('Qdrant seeding completed', {
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

      this.logError('Qdrant seeding failed', err);

      return this.createSeedResult(
        false,
        totalRecords,
        Date.now() - startTime,
        errors
      );
    }
  }

  async executeVectorOperation(
    collection: string,
    operation: unknown
  ): Promise<unknown> {
    return await (this.connection.client as any)[(operation as any).method](
      collection,
      (operation as any).data
    );
  }

  async executeBulkUpsert(
    collection: string,
    vectors: VectorTestData[]
  ): Promise<SeedResult> {
    if (vectors.length === 0) {
      return this.createSeedResult(true, 0, 0);
    }

    const startTime = Date.now();
    const errors: Error[] = [];
    let recordsCreated = 0;

    try {
      // Process in batches for better performance
      const batchSize = 100; // Smaller batches for vector operations
      const batches = this.chunkArray(vectors, batchSize);

      for (const batch of batches) {
        const { error } = await this.executeWithErrorHandling(
          () => this.upsertVectorBatch(collection, batch),
          `bulk upsert ${collection}`
        );

        if (error) {
          errors.push(error);
        } else {
          recordsCreated += batch.length;
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.trackPerformance(
        `bulk_upsert_${collection}`,
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

  private async upsertVectorBatch(
    collection: string,
    vectors: VectorTestData[]
  ): Promise<void> {
    const points = vectors.map((vector) => ({
      id: vector.id,
      vector: vector.vector,
      payload: vector.payload || {},
    }));

    await this.connection.client.upsert(collection, {
      wait: true,
      points,
    });
  }

  private async createCollections(): Promise<void> {
    this.logInfo('Creating Qdrant collections');

    const collections = [
      {
        name: 'products',
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
        payloadSchema: {
          text: { type: 'text' },
          category: { type: 'keyword' },
          productId: { type: 'keyword' },
          sellerId: { type: 'keyword' },
          price: { type: 'float' },
          tags: { type: 'keyword' },
        },
      },
      {
        name: 'conversations',
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
        payloadSchema: {
          text: { type: 'text' },
          category: { type: 'keyword' },
          sessionId: { type: 'keyword' },
          userId: { type: 'keyword' },
          platform: { type: 'keyword' },
          intent: { type: 'keyword' },
        },
      },
      {
        name: 'documents',
        vectors: {
          size: 1536,
          distance: 'Cosine',
        },
        payloadSchema: {
          text: { type: 'text' },
          category: { type: 'keyword' },
          documentId: { type: 'keyword' },
          title: { type: 'text' },
          documentType: { type: 'keyword' },
          tags: { type: 'keyword' },
        },
      },
      {
        name: 'user_behavior',
        vectors: {
          size: 512,
          distance: 'Euclid',
        },
        payloadSchema: {
          text: { type: 'text' },
          category: { type: 'keyword' },
          userId: { type: 'keyword' },
          behaviorType: { type: 'keyword' },
        },
      },
    ];

    for (const collection of collections) {
      try {
        // Check if collection exists
        const existingCollections =
          await this.connection.client.getCollections();
        const exists = existingCollections.collections.some(
          (c) => c.name === collection.name
        );

        if (!exists) {
          await this.connection.client.createCollection(collection.name, {
            vectors: collection.vectors as any,
          });

          // Create payload index for better search performance
          for (const [field, schema] of Object.entries(
            collection.payloadSchema
          )) {
            await this.connection.client.createPayloadIndex(collection.name, {
              field_name: field,
              field_schema: schema,
            });
          }

          this.logInfo(`Created collection: ${collection.name}`);
        } else {
          this.logInfo(`Collection ${collection.name} already exists`);
        }
      } catch (error) {
        this.logError(`Failed to create collection ${collection.name}`, error);
        throw error;
      }
    }
  }

  private async seedProductVectors(productCount: number): Promise<SeedResult> {
    this.logInfo(`Seeding ${productCount} product vectors`);

    const vectors = this.vectorFactory
      .generateVectors(productCount, 1536, {
        payload: {
          category: 'product',
        },
      })
      .map((_) => this.vectorFactory.generateProductVector());

    return await this.executeBulkUpsert('products', vectors);
  }

  private async seedConversationVectors(
    messageCount: number
  ): Promise<SeedResult> {
    this.logInfo(`Seeding ${messageCount} conversation vectors`);

    const vectors = this.vectorFactory
      .generateVectors(messageCount, 1536, {
        payload: {
          category: 'conversation',
        },
      })
      .map((_) => this.vectorFactory.generateConversationVector());

    return await this.executeBulkUpsert('conversations', vectors);
  }

  private async seedDocumentVectors(
    documentCount: number
  ): Promise<SeedResult> {
    this.logInfo(`Seeding ${documentCount} document vectors`);

    const vectors = this.vectorFactory
      .generateVectors(documentCount, 1536, {
        payload: {
          category: 'document',
        },
      })
      .map((_) => this.vectorFactory.generateDocumentVector());

    return await this.executeBulkUpsert('documents', vectors);
  }

  private async seedUserBehaviorVectors(
    userCount: number
  ): Promise<SeedResult> {
    this.logInfo(`Seeding ${userCount} user behavior vectors`);

    const vectors = this.vectorFactory
      .generateVectors(userCount, 512, {
        payload: {
          category: 'user_behavior',
        },
      })
      .map((_) => this.vectorFactory.generateUserBehaviorVector());

    return await this.executeBulkUpsert('user_behavior', vectors);
  }

  private async cleanup(): Promise<void> {
    this.logInfo('Cleaning up Qdrant database');

    const collections = [
      'products',
      'conversations',
      'documents',
      'user_behavior',
    ];

    for (const collectionName of collections) {
      try {
        await this.connection.client.deleteCollection(collectionName);
        this.logInfo(`Deleted collection: ${collectionName}`);
      } catch {
        // Collection might not exist, which is okay
        this.logWarn(`Could not delete collection ${collectionName}`);
      }
    }

    this.logInfo('Qdrant cleanup completed');
  }

  override async rollback(): Promise<SeedResult> {
    const startTime = Date.now();

    try {
      await this.cleanup();
      const duration = Date.now() - startTime;

      this.logInfo('Qdrant rollback completed', { duration });

      return this.createSeedResult(true, 0, duration);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.logError('Qdrant rollback failed', err);

      return this.createSeedResult(false, 0, duration, [err]);
    }
  }

  override async validate(): Promise<boolean> {
    try {
      const collections = [
        'products',
        'conversations',
        'documents',
        'user_behavior',
      ];

      for (const collectionName of collections) {
        try {
          const info = await this.connection.client.getCollection(
            collectionName
          );

          if (info.points_count === 0) {
            this.logWarn(`Collection ${collectionName} is empty`);
          } else {
            this.logInfo(
              `Collection ${collectionName} has ${info.points_count} vectors`
            );
          }
        } catch {
          this.logWarn(`Collection ${collectionName} does not exist`);
        }
      }

      return true;
    } catch (error) {
      this.logError('Qdrant validation failed', error);
      return false;
    }
  }
}
