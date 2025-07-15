import {
  MongoDBCleanupStrategy,
  CleanupResult,
  CleanupOptions,
  CleanupVerificationResult,
  CleanupPerformanceMetrics,
  CleanupIssue,
  CleanupError,
} from '../../types/cleanup';
import { MongoDBConnection } from '../../types/database';

export class MongoDBCleanup implements MongoDBCleanupStrategy {
  public readonly database = 'mongodb' as const;
  private performanceMetrics: CleanupPerformanceMetrics | null = null;

  constructor(private connection: MongoDBConnection) {}

  async cleanup(options?: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    const connectionStartTime = Date.now();

    const mergedOptions = {
      preserveSchema: true,
      batchSize: 1000,
      retryAttempts: 3,
      ...options,
    };

    let recordsRemoved = 0;
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];
    const warnings: string[] = [];

    try {
      const connectionTime = Date.now() - connectionStartTime;
      const queryStartTime = Date.now();

      // Get all collections
      const collections = await this.connection.database
        .listCollections()
        .toArray();

      if (collections.length === 0) {
        warnings.push('No collections found to clean');
      }

      // Filter out system collections
      const userCollections = collections.filter(
        (col) =>
          !col.name.startsWith('system.') &&
          col.name !== 'admin' &&
          col.name !== 'local' &&
          col.name !== 'config'
      );

      for (const collectionInfo of userCollections) {
        try {
          const collection = this.connection.database.collection(
            collectionInfo.name
          );

          // Count documents before deletion
          const documentCount = await collection.countDocuments();

          if (documentCount > 0) {
            if (
              mergedOptions.batchSize &&
              documentCount > mergedOptions.batchSize
            ) {
              // Use batched deletion for large collections
              const deleted = await this.batchedDelete(
                collection,
                mergedOptions.batchSize
              );
              recordsRemoved += deleted;
            } else {
              // Drop and recreate collection for smaller collections (faster)
              await collection.deleteMany({});
              recordsRemoved += documentCount;
            }

            collectionsAffected.push(collectionInfo.name);
          }
        } catch (error) {
          const cleanupError = new CleanupError(
            `Failed to clean collection ${collectionInfo.name}: ${error}`,
            this.database,
            `cleanup_collection_${collectionInfo.name}`,
            error as Error
          );
          errors.push(cleanupError);
        }
      }

      const queryExecutionTime = Date.now() - queryStartTime;
      const totalDuration = Date.now() - startTime;

      // Calculate performance metrics
      this.performanceMetrics = {
        connectionTime,
        queryExecutionTime,
        totalCleanupTime: totalDuration,
        memoryUsed: process.memoryUsage().heapUsed,
        cpuUsage: process.cpuUsage().user,
        operationsPerSecond: recordsRemoved / (totalDuration / 1000) || 0,
        peakMemoryUsage: process.memoryUsage().heapUsed,
      };

      return {
        success: errors.length === 0,
        database: this.database,
        duration: totalDuration,
        recordsRemoved,
        collectionsAffected,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        performanceMetrics: this.performanceMetrics,
      };
    } catch (error) {
      const cleanupError = new CleanupError(
        `MongoDB cleanup failed: ${error}`,
        this.database,
        'cleanup',
        error as Error
      );

      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        collectionsAffected,
        errors: [cleanupError],
      };
    }
  }

  async verify(options?: CleanupOptions): Promise<CleanupVerificationResult> {
    const startTime = Date.now();
    const issues: CleanupIssue[] = [];
    let checkedCollections = 0;

    try {
      // Get all collections
      const collections = await this.connection.database
        .listCollections()
        .toArray();

      // Filter out system collections
      const userCollections = collections.filter(
        (col) =>
          !col.name.startsWith('system.') &&
          col.name !== 'admin' &&
          col.name !== 'local' &&
          col.name !== 'config'
      );

      checkedCollections = userCollections.length;

      for (const collectionInfo of userCollections) {
        const collection = this.connection.database.collection(
          collectionInfo.name
        );
        const documentCount = await collection.countDocuments();

        if (documentCount > 0) {
          issues.push({
            type: 'data_remaining',
            severity: 'warning',
            location: `collection: ${collectionInfo.name}`,
            description: `Collection ${collectionInfo.name} contains ${documentCount} documents`,
            suggestion: 'Run cleanup again or check for collection constraints',
          });
        }
      }

      // Check database stats
      const dbStats = await this.connection.database.stats();
      if (dbStats.dataSize > 1024 * 1024) {
        // More than 1MB
        issues.push({
          type: 'performance_degradation',
          severity: 'info',
          location: 'database storage',
          description: `Database size is ${Math.round(
            dbStats.dataSize / 1024 / 1024
          )}MB`,
          suggestion: 'Consider running compactDatabase() to reclaim space',
        });
      }

      return {
        isClean:
          issues.filter(
            (i) => i.severity === 'critical' || i.severity === 'warning'
          ).length === 0,
        database: this.database,
        issues,
        verificationTime: Date.now() - startTime,
        checkedItems: {
          collections: checkedCollections,
        },
      };
    } catch (error) {
      issues.push({
        type: 'connection_issue',
        severity: 'critical',
        location: 'database connection',
        description: `Verification failed: ${error}`,
      });

      return {
        isClean: false,
        database: this.database,
        issues,
        verificationTime: Date.now() - startTime,
        checkedItems: {
          collections: checkedCollections,
        },
      };
    }
  }

  async reset(options?: CleanupOptions): Promise<CleanupResult> {
    // Reset is the same as cleanup for MongoDB
    return this.cleanup(options);
  }

  async dropCollections(
    collections?: string[],
    options?: CleanupOptions
  ): Promise<CleanupResult> {
    const startTime = Date.now();
    let recordsRemoved = 0;
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];

    try {
      // If no collections specified, get all user collections
      let targetCollections = collections;
      if (!targetCollections) {
        const allCollections = await this.connection.database
          .listCollections()
          .toArray();
        targetCollections = allCollections
          .filter((col) => !col.name.startsWith('system.'))
          .map((col) => col.name);
      }

      for (const collectionName of targetCollections) {
        try {
          const collection =
            this.connection.database.collection(collectionName);

          // Count documents before dropping
          const documentCount = await collection.countDocuments();

          // Drop the collection
          await collection.drop();

          recordsRemoved += documentCount;
          collectionsAffected.push(collectionName);
        } catch (error) {
          // Collection might not exist, which is ok
          if ((error as any).code !== 26) {
            // NamespaceNotFound
            errors.push(
              new CleanupError(
                `Failed to drop collection ${collectionName}: ${error}`,
                this.database,
                `drop_collection_${collectionName}`,
                error as Error
              )
            );
          }
        }
      }

      return {
        success: errors.length === 0,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        collectionsAffected,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        collectionsAffected,
        errors: [
          new CleanupError(
            `Drop collections failed: ${error}`,
            this.database,
            'drop_collections',
            error as Error
          ),
        ],
      };
    }
  }

  async clearIndexes(): Promise<CleanupResult> {
    const startTime = Date.now();
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];

    try {
      const collections = await this.connection.database
        .listCollections()
        .toArray();

      for (const collectionInfo of collections) {
        if (!collectionInfo.name.startsWith('system.')) {
          try {
            const collection = this.connection.database.collection(
              collectionInfo.name
            );

            // Drop all indexes except the default _id index
            await collection.dropIndexes();
            collectionsAffected.push(collectionInfo.name);
          } catch (error) {
            errors.push(
              new CleanupError(
                `Failed to clear indexes for collection ${collectionInfo.name}: ${error}`,
                this.database,
                `clear_indexes_${collectionInfo.name}`,
                error as Error
              )
            );
          }
        }
      }

      return {
        success: errors.length === 0,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        collectionsAffected,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        collectionsAffected,
        errors: [
          new CleanupError(
            `Clear indexes failed: ${error}`,
            this.database,
            'clear_indexes',
            error as Error
          ),
        ],
      };
    }
  }

  async compactDatabase(): Promise<CleanupResult> {
    const startTime = Date.now();
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];
    const warnings: string[] = [];

    try {
      const collections = await this.connection.database
        .listCollections()
        .toArray();

      for (const collectionInfo of collections) {
        if (!collectionInfo.name.startsWith('system.')) {
          try {
            // Run compact command on each collection
            await this.connection.database.command({
              compact: collectionInfo.name,
              force: true,
            });
            collectionsAffected.push(collectionInfo.name);
          } catch (error) {
            // Compact might not be available in all MongoDB versions
            warnings.push(
              `Compact failed for collection ${collectionInfo.name}: ${error}`
            );
          }
        }
      }

      return {
        success: errors.length === 0,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        collectionsAffected,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        collectionsAffected,
        errors: [
          new CleanupError(
            `Compact database failed: ${error}`,
            this.database,
            'compact_database',
            error as Error
          ),
        ],
      };
    }
  }

  getPerformanceMetrics(): CleanupPerformanceMetrics | null {
    return this.performanceMetrics;
  }

  private async batchedDelete(
    collection: any,
    batchSize: number
  ): Promise<number> {
    let totalDeleted = 0;
    let deletedCount = 0;

    do {
      // Find documents to delete
      const docs = await collection.find({}).limit(batchSize).toArray();
      if (docs.length === 0) break;

      // Extract IDs
      const ids = docs.map((doc: any) => doc._id);

      // Delete by IDs
      const result = await collection.deleteMany({ _id: { $in: ids } });
      deletedCount = result.deletedCount;
      totalDeleted += deletedCount;
    } while (deletedCount > 0);

    return totalDeleted;
  }
}
