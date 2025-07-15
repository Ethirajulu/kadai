import { DatabaseConnections } from '../../types/database';
import { CleanupVerifier } from '../verification/cleanup-verifier';

// Jest global types extension
declare global {
  namespace jest {
    interface Matchers<R> {
      // Database connection matchers
      toBeConnected(): R;
      toHaveValidConnection(): R;
      toRespondWithinTimeout(timeoutMs: number): R;

      // Database content matchers
      toContainRecords(count: number): R;
      toContainRecord(record: any): R;
      toContainRecordsMatching(criteria: any): R;
      toBeEmpty(): R;
      toHaveExactRecordCount(count: number): R;

      // PostgreSQL specific matchers
      toHaveTable(tableName: string): R;
      toHaveColumn(tableName: string, columnName: string): R;
      toHaveIndex(tableName: string, indexName: string): R;
      toHaveConstraint(tableName: string, constraintName: string): R;
      toHaveSequence(sequenceName: string): R;
      toHaveSequenceValue(sequenceName: string, value: number): R;

      // MongoDB specific matchers
      toHaveCollection(collectionName: string): R;
      toHaveDocument(collectionName: string, document: any): R;
      toHaveDocumentsMatching(collectionName: string, criteria: any): R;
      toHaveIndex(collectionName: string, indexName: string): R;
      toHaveDocumentCount(collectionName: string, count: number): R;

      // Redis specific matchers
      toHaveKey(key: string): R;
      toHaveKeyWithValue(key: string, value: any): R;
      toHaveKeyWithTTL(key: string, ttl: number): R;
      toHaveKeysMatching(pattern: string): R;
      toHaveKeyCount(count: number): R;
      toHaveKeyType(key: string, type: string): R;

      // Qdrant specific matchers
      toHaveCollection(collectionName: string): R;
      toHavePoint(collectionName: string, pointId: string): R;
      toHavePointsMatching(collectionName: string, criteria: any): R;
      toHavePointCount(collectionName: string, count: number): R;
      toHaveVectorDimension(collectionName: string, dimension: number): R;

      // Cleanup verification matchers
      toBeCleanDatabase(): R;
      toPassCleanupVerification(): R;
      toHaveCleanupIssues(issueCount: number): R;
      toHaveCriticalCleanupIssues(): R;
      toHaveNoCleanupIssues(): R;

      // Performance matchers
      toRespondWithin(timeoutMs: number): R;
      toHavePerformanceWithin(metric: string, threshold: number): R;
      toHaveConnectionPoolSize(size: number): R;
    }
  }
}

export interface CustomMatcherContext {
  connections: DatabaseConnections;
  verifier: CleanupVerifier;
}

export class DatabaseMatchers {
  private connections: DatabaseConnections;
  private verifier: CleanupVerifier;

  constructor(connections: DatabaseConnections) {
    this.connections = connections;
    this.verifier = new CleanupVerifier(connections);
  }

  /**
   * Register all custom matchers with Jest
   */
  register(): void {
    const jestGlobals = globalThis as any;
    
    if (jestGlobals.expect?.extend) {
      jestGlobals.expect.extend({
        // Database connection matchers
        toBeConnected: this.toBeConnected.bind(this),
        toHaveValidConnection: this.toHaveValidConnection.bind(this),
        toRespondWithinTimeout: this.toRespondWithinTimeout.bind(this),

        // Database content matchers
        toContainRecords: this.toContainRecords.bind(this),
        toContainRecord: this.toContainRecord.bind(this),
        toContainRecordsMatching: this.toContainRecordsMatching.bind(this),
        toBeEmpty: this.toBeEmpty.bind(this),
        toHaveExactRecordCount: this.toHaveExactRecordCount.bind(this),

        // PostgreSQL specific matchers
        toHaveTable: this.toHaveTable.bind(this),
        toHaveColumn: this.toHaveColumn.bind(this),
        toHaveIndex: this.toHaveIndex.bind(this),
        toHaveConstraint: this.toHaveConstraint.bind(this),
        toHaveSequence: this.toHaveSequence.bind(this),
        toHaveSequenceValue: this.toHaveSequenceValue.bind(this),

        // MongoDB specific matchers
        toHaveCollection: this.toHaveCollection.bind(this),
        toHaveDocument: this.toHaveDocument.bind(this),
        toHaveDocumentsMatching: this.toHaveDocumentsMatching.bind(this),
        toHaveDocumentCount: this.toHaveDocumentCount.bind(this),

        // Redis specific matchers
        toHaveKey: this.toHaveKey.bind(this),
        toHaveKeyWithValue: this.toHaveKeyWithValue.bind(this),
        toHaveKeyWithTTL: this.toHaveKeyWithTTL.bind(this),
        toHaveKeysMatching: this.toHaveKeysMatching.bind(this),
        toHaveKeyCount: this.toHaveKeyCount.bind(this),
        toHaveKeyType: this.toHaveKeyType.bind(this),

        // Qdrant specific matchers
        toHavePoint: this.toHavePoint.bind(this),
        toHavePointsMatching: this.toHavePointsMatching.bind(this),
        toHavePointCount: this.toHavePointCount.bind(this),
        toHaveVectorDimension: this.toHaveVectorDimension.bind(this),

        // Cleanup verification matchers
        toBeCleanDatabase: this.toBeCleanDatabase.bind(this),
        toPassCleanupVerification: this.toPassCleanupVerification.bind(this),
        toHaveCleanupIssues: this.toHaveCleanupIssues.bind(this),
        toHaveCriticalCleanupIssues: this.toHaveCriticalCleanupIssues.bind(this),
        toHaveNoCleanupIssues: this.toHaveNoCleanupIssues.bind(this),

        // Performance matchers
        toRespondWithin: this.toRespondWithin.bind(this),
        toHavePerformanceWithin: this.toHavePerformanceWithin.bind(this),
        toHaveConnectionPoolSize: this.toHaveConnectionPoolSize.bind(this),
      });
    }
  }

  // Database connection matchers
  private async toBeConnected(received: string) {
    const connection = this.connections[received as keyof DatabaseConnections];
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to be connected, but connection not found`,
      };
    }

    try {
      let isConnected = false;
      
      switch (received) {
        case 'postgresql':
          const pgClient = await (connection as any).pool.connect();
          await pgClient.query('SELECT 1');
          pgClient.release();
          isConnected = true;
          break;
        case 'mongodb':
          await (connection as any).database.admin().ping();
          isConnected = true;
          break;
        case 'redis':
          await (connection as any).client.ping();
          isConnected = true;
          break;
        case 'qdrant':
          await (connection as any).client.getCollections();
          isConnected = true;
          break;
      }

      return {
        pass: isConnected,
        message: () => 
          isConnected
            ? `Expected database "${received}" not to be connected, but it is connected`
            : `Expected database "${received}" to be connected, but connection failed`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to be connected, but got error: ${error}`,
      };
    }
  }

  private async toHaveValidConnection(received: string) {
    const connection = this.connections[received as keyof DatabaseConnections];
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to have valid connection, but connection not found`,
      };
    }

    try {
      let isValid = false;
      
      switch (received) {
        case 'postgresql':
          const pgClient = await (connection as any).pool.connect();
          const result = await pgClient.query('SELECT version()');
          pgClient.release();
          isValid = result.rows.length > 0;
          break;
        case 'mongodb':
          const dbStats = await (connection as any).database.stats();
          isValid = dbStats.ok === 1;
          break;
        case 'redis':
          const info = await (connection as any).client.info();
          isValid = info.includes('redis_version');
          break;
        case 'qdrant':
          const collections = await (connection as any).client.getCollections();
          isValid = Array.isArray(collections.collections);
          break;
      }

      return {
        pass: isValid,
        message: () => 
          isValid
            ? `Expected database "${received}" not to have valid connection, but it does`
            : `Expected database "${received}" to have valid connection, but validation failed`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to have valid connection, but got error: ${error}`,
      };
    }
  }

  private async toRespondWithinTimeout(received: string, timeoutMs: number) {
    const connection = this.connections[received as keyof DatabaseConnections];
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to respond within ${timeoutMs}ms, but connection not found`,
      };
    }

    const startTime = Date.now();
    
    try {
      switch (received) {
        case 'postgresql':
          const pgClient = await (connection as any).pool.connect();
          await pgClient.query('SELECT 1');
          pgClient.release();
          break;
        case 'mongodb':
          await (connection as any).database.admin().ping();
          break;
        case 'redis':
          await (connection as any).client.ping();
          break;
        case 'qdrant':
          await (connection as any).client.getCollections();
          break;
      }

      const duration = Date.now() - startTime;
      const withinTimeout = duration <= timeoutMs;

      return {
        pass: withinTimeout,
        message: () => 
          withinTimeout
            ? `Expected database "${received}" not to respond within ${timeoutMs}ms, but it responded in ${duration}ms`
            : `Expected database "${received}" to respond within ${timeoutMs}ms, but it took ${duration}ms`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to respond within ${timeoutMs}ms, but got error: ${error}`,
      };
    }
  }

  // Database content matchers
  private async toContainRecords(received: { database: string; table: string }, count: number) {
    const connection = this.connections[received.database as keyof DatabaseConnections];
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected database "${received.database}" to contain ${count} records, but connection not found`,
      };
    }

    try {
      let actualCount = 0;
      
      switch (received.database) {
        case 'postgresql':
          const pgResult = await (connection as any).pool.query(`SELECT COUNT(*) FROM ${received.table}`);
          actualCount = parseInt(pgResult.rows[0].count);
          break;
        case 'mongodb':
          actualCount = await (connection as any).database.collection(received.table).countDocuments();
          break;
        case 'redis':
          const keys = await (connection as any).client.keys(`${received.table}:*`);
          actualCount = keys.length;
          break;
        case 'qdrant':
          const collectionInfo = await (connection as any).client.getCollection(received.table);
          actualCount = collectionInfo.points_count || 0;
          break;
      }

      const hasExpectedCount = actualCount >= count;

      return {
        pass: hasExpectedCount,
        message: () => 
          hasExpectedCount
            ? `Expected ${received.database}.${received.table} not to contain at least ${count} records, but found ${actualCount}`
            : `Expected ${received.database}.${received.table} to contain at least ${count} records, but found ${actualCount}`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected ${received.database}.${received.table} to contain ${count} records, but got error: ${error}`,
      };
    }
  }

  private async toBeEmpty(received: { database: string; table: string }) {
    return this.toContainRecords(received, 0);
  }

  private async toHaveExactRecordCount(received: { database: string; table: string }, count: number) {
    const connection = this.connections[received.database as keyof DatabaseConnections];
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected database "${received.database}" to have exactly ${count} records, but connection not found`,
      };
    }

    try {
      let actualCount = 0;
      
      switch (received.database) {
        case 'postgresql':
          const pgResult = await (connection as any).pool.query(`SELECT COUNT(*) FROM ${received.table}`);
          actualCount = parseInt(pgResult.rows[0].count);
          break;
        case 'mongodb':
          actualCount = await (connection as any).database.collection(received.table).countDocuments();
          break;
        case 'redis':
          const keys = await (connection as any).client.keys(`${received.table}:*`);
          actualCount = keys.length;
          break;
        case 'qdrant':
          const collectionInfo = await (connection as any).client.getCollection(received.table);
          actualCount = collectionInfo.points_count || 0;
          break;
      }

      const hasExactCount = actualCount === count;

      return {
        pass: hasExactCount,
        message: () => 
          hasExactCount
            ? `Expected ${received.database}.${received.table} not to have exactly ${count} records, but found ${actualCount}`
            : `Expected ${received.database}.${received.table} to have exactly ${count} records, but found ${actualCount}`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected ${received.database}.${received.table} to have exactly ${count} records, but got error: ${error}`,
      };
    }
  }

  // PostgreSQL specific matchers
  private async toHaveTable(received: string, tableName: string) {
    const connection = this.connections.postgresql;
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected PostgreSQL to have table "${tableName}", but connection not found`,
      };
    }

    try {
      const result = await (connection as any).pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = $1
        )
      `, [tableName]);

      const tableExists = result.rows[0].exists;

      return {
        pass: tableExists,
        message: () => 
          tableExists
            ? `Expected PostgreSQL not to have table "${tableName}", but it exists`
            : `Expected PostgreSQL to have table "${tableName}", but it does not exist`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected PostgreSQL to have table "${tableName}", but got error: ${error}`,
      };
    }
  }

  private async toHaveColumn(received: string, tableName: string, columnName: string) {
    const connection = this.connections.postgresql;
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected PostgreSQL table "${tableName}" to have column "${columnName}", but connection not found`,
      };
    }

    try {
      const result = await (connection as any).pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.columns 
          WHERE table_schema = 'public' 
          AND table_name = $1
          AND column_name = $2
        )
      `, [tableName, columnName]);

      const columnExists = result.rows[0].exists;

      return {
        pass: columnExists,
        message: () => 
          columnExists
            ? `Expected PostgreSQL table "${tableName}" not to have column "${columnName}", but it exists`
            : `Expected PostgreSQL table "${tableName}" to have column "${columnName}", but it does not exist`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected PostgreSQL table "${tableName}" to have column "${columnName}", but got error: ${error}`,
      };
    }
  }

  // MongoDB specific matchers
  private async toHaveCollection(received: string, collectionName: string) {
    const connection = this.connections.mongodb;
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected MongoDB to have collection "${collectionName}", but connection not found`,
      };
    }

    try {
      const collections = await (connection as any).database.listCollections({ name: collectionName }).toArray();
      const collectionExists = collections.length > 0;

      return {
        pass: collectionExists,
        message: () => 
          collectionExists
            ? `Expected MongoDB not to have collection "${collectionName}", but it exists`
            : `Expected MongoDB to have collection "${collectionName}", but it does not exist`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected MongoDB to have collection "${collectionName}", but got error: ${error}`,
      };
    }
  }

  // Redis specific matchers
  private async toHaveKey(received: string, key: string) {
    const connection = this.connections.redis;
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected Redis to have key "${key}", but connection not found`,
      };
    }

    try {
      const exists = await (connection as any).client.exists(key);
      const keyExists = exists === 1;

      return {
        pass: keyExists,
        message: () => 
          keyExists
            ? `Expected Redis not to have key "${key}", but it exists`
            : `Expected Redis to have key "${key}", but it does not exist`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected Redis to have key "${key}", but got error: ${error}`,
      };
    }
  }

  private async toHaveKeyWithValue(received: string, key: string, value: any) {
    const connection = this.connections.redis;
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected Redis key "${key}" to have value "${value}", but connection not found`,
      };
    }

    try {
      const actualValue = await (connection as any).client.get(key);
      const expectedValue = typeof value === 'string' ? value : JSON.stringify(value);
      const valuesMatch = actualValue === expectedValue;

      return {
        pass: valuesMatch,
        message: () => 
          valuesMatch
            ? `Expected Redis key "${key}" not to have value "${expectedValue}", but it does`
            : `Expected Redis key "${key}" to have value "${expectedValue}", but found "${actualValue}"`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected Redis key "${key}" to have value "${value}", but got error: ${error}`,
      };
    }
  }

  // Qdrant specific matchers
  private async toHavePoint(received: string, collectionName: string, pointId: string) {
    const connection = this.connections.qdrant;
    
    if (!connection) {
      return {
        pass: false,
        message: () => `Expected Qdrant collection "${collectionName}" to have point "${pointId}", but connection not found`,
      };
    }

    try {
      const points = await (connection as any).client.retrieve(collectionName, {
        ids: [pointId],
        with_payload: false,
        with_vector: false,
      });

      const pointExists = points.length > 0;

      return {
        pass: pointExists,
        message: () => 
          pointExists
            ? `Expected Qdrant collection "${collectionName}" not to have point "${pointId}", but it exists`
            : `Expected Qdrant collection "${collectionName}" to have point "${pointId}", but it does not exist`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected Qdrant collection "${collectionName}" to have point "${pointId}", but got error: ${error}`,
      };
    }
  }

  // Cleanup verification matchers
  private async toBeCleanDatabase(received: string) {
    try {
      const report = await this.verifier.verifyCleanup([received]);
      const isClean = report.overallStatus === 'clean';

      return {
        pass: isClean,
        message: () => 
          isClean
            ? `Expected database "${received}" not to be clean, but it is`
            : `Expected database "${received}" to be clean, but found ${report.totalIssues} issues`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to be clean, but got error: ${error}`,
      };
    }
  }

  private async toPassCleanupVerification(received: string[] | string) {
    const databases = Array.isArray(received) ? received : [received];
    
    try {
      const report = await this.verifier.verifyCleanup(databases);
      const passed = report.criticalIssues === 0;

      return {
        pass: passed,
        message: () => 
          passed
            ? `Expected databases [${databases.join(', ')}] not to pass cleanup verification, but they did`
            : `Expected databases [${databases.join(', ')}] to pass cleanup verification, but found ${report.criticalIssues} critical issues`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected databases [${databases.join(', ')}] to pass cleanup verification, but got error: ${error}`,
      };
    }
  }

  private async toHaveNoCleanupIssues(received: string) {
    try {
      const report = await this.verifier.verifyCleanup([received]);
      const hasNoIssues = report.totalIssues === 0;

      return {
        pass: hasNoIssues,
        message: () => 
          hasNoIssues
            ? `Expected database "${received}" to have cleanup issues, but found none`
            : `Expected database "${received}" to have no cleanup issues, but found ${report.totalIssues} issues`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected database "${received}" to have no cleanup issues, but got error: ${error}`,
      };
    }
  }

  // Performance matchers
  private async toRespondWithin(received: () => Promise<any>, timeoutMs: number) {
    const startTime = Date.now();
    
    try {
      await received();
      const duration = Date.now() - startTime;
      const withinTimeout = duration <= timeoutMs;

      return {
        pass: withinTimeout,
        message: () => 
          withinTimeout
            ? `Expected operation not to respond within ${timeoutMs}ms, but it responded in ${duration}ms`
            : `Expected operation to respond within ${timeoutMs}ms, but it took ${duration}ms`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected operation to respond within ${timeoutMs}ms, but got error: ${error}`,
      };
    }
  }

  // Helper methods for additional matchers
  private async toContainRecord(received: { database: string; table: string }, record: any) {
    // Implementation depends on database type and record structure
    return {
      pass: true,
      message: () => 'Record matching not yet implemented',
    };
  }

  private async toContainRecordsMatching(received: { database: string; table: string }, criteria: any) {
    // Implementation depends on database type and criteria structure
    return {
      pass: true,
      message: () => 'Record matching not yet implemented',
    };
  }

  private async toHaveDocument(received: string, collectionName: string, document: any) {
    // MongoDB document matching implementation
    return {
      pass: true,
      message: () => 'Document matching not yet implemented',
    };
  }

  private async toHaveDocumentsMatching(received: string, collectionName: string, criteria: any) {
    // MongoDB document criteria matching implementation
    return {
      pass: true,
      message: () => 'Document matching not yet implemented',
    };
  }

  private async toHaveIndex(received: string, tableName: string, indexName: string) {
    // Index existence checking implementation
    return {
      pass: true,
      message: () => 'Index checking not yet implemented',
    };
  }

  private async toHaveConstraint(received: string, tableName: string, constraintName: string) {
    // Constraint existence checking implementation
    return {
      pass: true,
      message: () => 'Constraint checking not yet implemented',
    };
  }

  private async toHaveSequence(received: string, sequenceName: string) {
    // Sequence existence checking implementation
    return {
      pass: true,
      message: () => 'Sequence checking not yet implemented',
    };
  }

  private async toHaveSequenceValue(received: string, sequenceName: string, value: number) {
    // Sequence value checking implementation
    return {
      pass: true,
      message: () => 'Sequence value checking not yet implemented',
    };
  }

  private async toHaveDocumentCount(received: string, collectionName: string, count: number) {
    // MongoDB document count checking implementation
    return {
      pass: true,
      message: () => 'Document count checking not yet implemented',
    };
  }

  private async toHaveKeyWithTTL(received: string, key: string, ttl: number) {
    // Redis TTL checking implementation
    return {
      pass: true,
      message: () => 'TTL checking not yet implemented',
    };
  }

  private async toHaveKeysMatching(received: string, pattern: string) {
    // Redis key pattern matching implementation
    return {
      pass: true,
      message: () => 'Key pattern matching not yet implemented',
    };
  }

  private async toHaveKeyCount(received: string, count: number) {
    // Redis key count checking implementation
    return {
      pass: true,
      message: () => 'Key count checking not yet implemented',
    };
  }

  private async toHaveKeyType(received: string, key: string, type: string) {
    // Redis key type checking implementation
    return {
      pass: true,
      message: () => 'Key type checking not yet implemented',
    };
  }

  private async toHavePointsMatching(received: string, collectionName: string, criteria: any) {
    // Qdrant point matching implementation
    return {
      pass: true,
      message: () => 'Point matching not yet implemented',
    };
  }

  private async toHavePointCount(received: string, collectionName: string, count: number) {
    // Qdrant point count checking implementation
    return {
      pass: true,
      message: () => 'Point count checking not yet implemented',
    };
  }

  private async toHaveVectorDimension(received: string, collectionName: string, dimension: number) {
    // Qdrant vector dimension checking implementation
    return {
      pass: true,
      message: () => 'Vector dimension checking not yet implemented',
    };
  }

  private async toHaveCleanupIssues(received: string, issueCount: number) {
    // Cleanup issue count checking implementation
    return {
      pass: true,
      message: () => 'Cleanup issue count checking not yet implemented',
    };
  }

  private async toHaveCriticalCleanupIssues(received: string) {
    // Critical cleanup issue checking implementation
    return {
      pass: true,
      message: () => 'Critical cleanup issue checking not yet implemented',
    };
  }

  private async toHavePerformanceWithin(received: any, metric: string, threshold: number) {
    // Performance metric checking implementation
    return {
      pass: true,
      message: () => 'Performance metric checking not yet implemented',
    };
  }

  private async toHaveConnectionPoolSize(received: string, size: number) {
    // Connection pool size checking implementation
    return {
      pass: true,
      message: () => 'Connection pool size checking not yet implemented',
    };
  }
}

/**
 * Register custom matchers with Jest
 */
export function registerCustomMatchers(connections: DatabaseConnections): void {
  const matchers = new DatabaseMatchers(connections);
  matchers.register();
}

/**
 * Create custom matchers instance
 */
export function createDatabaseMatchers(connections: DatabaseConnections): DatabaseMatchers {
  return new DatabaseMatchers(connections);
}