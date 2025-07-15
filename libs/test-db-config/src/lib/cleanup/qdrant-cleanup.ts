import {
  QdrantCleanupStrategy,
  CleanupResult,
  CleanupOptions,
  CleanupVerificationResult,
  CleanupPerformanceMetrics,
  CleanupIssue,
  CleanupError,
} from '../../types/cleanup';
import { QdrantConnection } from '../../types/database';

export class QdrantCleanup implements QdrantCleanupStrategy {
  public readonly database = 'qdrant' as const;
  private performanceMetrics: CleanupPerformanceMetrics | null = null;

  constructor(private connection: QdrantConnection) {}

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
      const collectionsResponse = await this.connection.client.getCollections();
      const collections = collectionsResponse.collections || [];
      
      if (collections.length === 0) {
        warnings.push('No collections found to clean');
      }

      // Filter test-related collections or clean all if not preserving schema
      const targetCollections = collections.filter(col => {
        const name = col.name;
        // Clean test collections or all collections based on options
        return !mergedOptions.preserveSchema || 
               name.includes('test') || 
               name.includes('temp') ||
               ['products', 'conversations', 'documents', 'user_behavior'].includes(name);
      });

      for (const collection of targetCollections) {
        try {
          // Get collection info to count vectors
          const collectionInfo = await this.connection.client.getCollection(collection.name);
          const vectorCount = collectionInfo.points_count || 0;

          if (vectorCount > 0) {
            if (mergedOptions.preserveSchema) {
              // Clear vectors but keep collection structure
              await this.clearVectorsFromCollection(collection.name, mergedOptions.batchSize!);
            } else {
              // Delete entire collection
              await this.connection.client.deleteCollection(collection.name);
            }
            
            recordsRemoved += vectorCount;
            collectionsAffected.push(collection.name);
          }
        } catch (error) {
          const cleanupError = new CleanupError(
            `Failed to clean collection ${collection.name}: ${error}`,
            this.database,
            `cleanup_collection_${collection.name}`,
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
        `Qdrant cleanup failed: ${error}`,
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
      const collectionsResponse = await this.connection.client.getCollections();
      const collections = collectionsResponse.collections || [];
      checkedCollections = collections.length;

      for (const collection of collections) {
        try {
          const collectionInfo = await this.connection.client.getCollection(collection.name);
          const vectorCount = collectionInfo.points_count || 0;

          if (vectorCount > 0) {
            // Check if this is a test collection that should be empty
            const isTestCollection = collection.name.includes('test') || 
                                   collection.name.includes('temp') ||
                                   ['products', 'conversations', 'documents', 'user_behavior'].includes(collection.name);

            if (isTestCollection) {
              issues.push({
                type: 'data_remaining',
                severity: 'warning',
                location: `collection: ${collection.name}`,
                description: `Collection ${collection.name} contains ${vectorCount} vectors`,
                suggestion: 'Run cleanup again or check collection configuration',
              });
            }
          }

          // Check collection size and performance implications
          if (vectorCount > 100000) {
            issues.push({
              type: 'performance_degradation',
              severity: 'info',
              location: `collection: ${collection.name}`,
              description: `Large collection ${collection.name} with ${vectorCount} vectors`,
              suggestion: 'Consider optimizing collection or using batch operations',
            });
          }
        } catch (error) {
          issues.push({
            type: 'connection_issue',
            severity: 'warning',
            location: `collection: ${collection.name}`,
            description: `Failed to check collection ${collection.name}: ${error}`,
          });
        }
      }

      // Check overall cluster health (if available)
      try {
        // Note: cluster() method may not be available in all Qdrant client versions
        // Skip cluster check for now as it's not essential for cleanup verification
      } catch (error) {
        // Cluster info might not be available in all setups
      }

      return {
        isClean: issues.filter(i => i.severity === 'critical' || i.severity === 'warning').length === 0,
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
        location: 'qdrant connection',
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
    // Reset is the same as cleanup for Qdrant
    return this.cleanup(options);
  }

  async deleteCollections(collections?: string[], options?: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    let recordsRemoved = 0;
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];

    try {
      // If no collections specified, get all collections
      let targetCollections = collections;
      if (!targetCollections) {
        const collectionsResponse = await this.connection.client.getCollections();
        targetCollections = (collectionsResponse.collections || []).map(col => col.name);
      }

      for (const collectionName of targetCollections) {
        try {
          // Get collection info before deletion
          const collectionInfo = await this.connection.client.getCollection(collectionName);
          const vectorCount = collectionInfo.points_count || 0;
          
          // Delete the collection
          await this.connection.client.deleteCollection(collectionName);
          
          recordsRemoved += vectorCount;
          collectionsAffected.push(collectionName);
        } catch (error) {
          // Collection might not exist, which is ok for cleanup
          if (!(error as any).message?.includes('Not found') && (error as any).status !== 404) {
            errors.push(new CleanupError(
              `Failed to delete collection ${collectionName}: ${error}`,
              this.database,
              `delete_collection_${collectionName}`,
              error as Error
            ));
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
        errors: [new CleanupError(
          `Delete collections failed: ${error}`,
          this.database,
          'delete_collections',
          error as Error
        )],
      };
    }
  }

  async clearVectors(): Promise<CleanupResult> {
    const startTime = Date.now();
    let recordsRemoved = 0;
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];

    try {
      const collectionsResponse = await this.connection.client.getCollections();
      const collections = collectionsResponse.collections || [];

      for (const collection of collections) {
        try {
          const collectionInfo = await this.connection.client.getCollection(collection.name);
          const vectorCount = collectionInfo.points_count || 0;

          if (vectorCount > 0) {
            await this.clearVectorsFromCollection(collection.name, 1000);
            recordsRemoved += vectorCount;
            collectionsAffected.push(collection.name);
          }
        } catch (error) {
          errors.push(new CleanupError(
            `Failed to clear vectors from collection ${collection.name}: ${error}`,
            this.database,
            `clear_vectors_${collection.name}`,
            error as Error
          ));
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
        errors: [new CleanupError(
          `Clear vectors failed: ${error}`,
          this.database,
          'clear_vectors',
          error as Error
        )],
      };
    }
  }

  async resetCollectionIndexes(): Promise<CleanupResult> {
    const startTime = Date.now();
    const collectionsAffected: string[] = [];
    const errors: Error[] = [];
    const warnings: string[] = [];

    try {
      const collectionsResponse = await this.connection.client.getCollections();
      const collections = collectionsResponse.collections || [];

      for (const collection of collections) {
        try {
          // For Qdrant, we don't typically "reset" indexes as they're part of the collection schema
          // Instead, we can recreate the collection with the same configuration
          const collectionInfo = await this.connection.client.getCollection(collection.name);
          
          // This is a complex operation that would require backing up the collection config
          // and recreating it. For now, we'll just log a warning.
          warnings.push(`Index reset not implemented for collection ${collection.name}`);
          collectionsAffected.push(collection.name);
        } catch (error) {
          errors.push(new CleanupError(
            `Failed to reset indexes for collection ${collection.name}: ${error}`,
            this.database,
            `reset_indexes_${collection.name}`,
            error as Error
          ));
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
        errors: [new CleanupError(
          `Reset collection indexes failed: ${error}`,
          this.database,
          'reset_collection_indexes',
          error as Error
        )],
      };
    }
  }

  getPerformanceMetrics(): CleanupPerformanceMetrics | null {
    return this.performanceMetrics;
  }

  private async clearVectorsFromCollection(collectionName: string, batchSize: number): Promise<void> {
    // Get all point IDs in batches and delete them
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      try {
        // Use scroll to get point IDs
        const scrollResult = await this.connection.client.scroll(collectionName, {
          limit: batchSize,
          offset,
          with_payload: false,
          with_vector: false,
        });

        const points = scrollResult.points || [];
        
        if (points.length === 0) {
          hasMore = false;
          break;
        }

        // Extract point IDs
        const pointIds = points.map(point => point.id);

        // Delete points
        await this.connection.client.delete(collectionName, {
          points: pointIds,
        });

        offset += batchSize;

        // If we got fewer points than requested, we're done
        if (points.length < batchSize) {
          hasMore = false;
        }
      } catch (error) {
        // If scroll fails, try alternative approach
        try {
          // Clear all points by using a filter that matches everything
          await this.connection.client.delete(collectionName, {
            filter: {},
          });
          hasMore = false;
        } catch (fallbackError) {
          throw new Error(`Failed to clear vectors: ${error}, fallback also failed: ${fallbackError}`);
        }
      }
    }
  }
}