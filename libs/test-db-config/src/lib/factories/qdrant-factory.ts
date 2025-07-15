import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantTestConfig, QdrantConnection } from '../../types';

export class QdrantConnectionFactory {
  async createConnection(config: QdrantTestConfig): Promise<QdrantConnection> {
    // Build URL from host and port if needed
    const host = config.host || 'localhost';
    const port = config.port || 6333;
    const url = host.startsWith('http') ? host : `http://${host}:${port}`;

    const clientConfig: Record<string, unknown> = {
      url,
      timeout: config.timeout || 5000,
    };

    if (config.apiKey) {
      clientConfig.apiKey = config.apiKey;
    }

    const client = new QdrantClient(clientConfig);

    try {
      await this.testConnection(client);

      return {
        client,
        config,
      };
    } catch (error) {
      throw new Error(
        `Failed to create Qdrant connection: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private async testConnection(client: QdrantClient): Promise<void> {
    await client.getCollections();
  }

  async closeConnection(connection: QdrantConnection): Promise<void> {
    // Qdrant client doesn't require explicit cleanup
    // Connection will be closed when the client is garbage collected
  }

  async isHealthy(connection: QdrantConnection): Promise<boolean> {
    try {
      await connection.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }

  createTestCollectionName(baseName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    const prefix = 'test_';
    return `${prefix}${baseName}_${timestamp}_${random}`;
  }

  async createTestCollection(
    connection: QdrantConnection,
    collectionName: string,
    vectorSize = 1536,
    distance: 'Cosine' | 'Euclid' | 'Dot' = 'Cosine'
  ): Promise<void> {
    await connection.client.createCollection(collectionName, {
      vectors: {
        size: vectorSize,
        distance: distance,
      },
    });
  }

  async deleteTestCollection(
    connection: QdrantConnection,
    collectionName: string
  ): Promise<void> {
    try {
      await connection.client.deleteCollection(collectionName);
    } catch (error) {
      // Collection might not exist, which is fine for cleanup
      console.warn(`Could not delete collection ${collectionName}:`, error);
    }
  }

  async clearTestCollection(
    connection: QdrantConnection,
    collectionName: string
  ): Promise<void> {
    try {
      // Delete all points in the collection
      await connection.client.delete(collectionName, {
        filter: {
          must: [
            {
              key: 'test_data',
              match: { value: true },
            },
          ],
        },
      });
    } catch (error) {
      console.warn(`Could not clear collection ${collectionName}:`, error);
    }
  }

  async insertTestVectors(
    connection: QdrantConnection,
    collectionName: string,
    vectors: Array<{
      id: string | number;
      vector: number[];
      payload?: Record<string, any>;
    }>
  ): Promise<void> {
    const points = vectors.map((vector) => ({
      id: vector.id,
      vector: vector.vector,
      payload: {
        ...vector.payload,
        test_data: true, // Mark as test data for easy cleanup
      },
    }));

    await connection.client.upsert(collectionName, {
      wait: true,
      points,
    });
  }

  async searchTestVectors(
    connection: QdrantConnection,
    collectionName: string,
    queryVector: number[],
    limit = 10,
    filter?: Record<string, any>
  ): Promise<any> {
    return await connection.client.search(collectionName, {
      vector: queryVector,
      limit,
      filter,
      with_payload: true,
      with_vector: false,
    });
  }

  async getCollectionInfo(
    connection: QdrantConnection,
    collectionName: string
  ): Promise<any> {
    return await connection.client.getCollection(collectionName);
  }
}
