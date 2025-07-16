import {
  PostgreSQLCleanupStrategy,
  CleanupResult,
  CleanupOptions,
  CleanupVerificationResult,
  CleanupPerformanceMetrics,
  CleanupIssue,
  CleanupError,
} from '../../types/cleanup';
import { PostgreSQLConnection } from '../../types/database';

export class PostgreSQLCleanup implements PostgreSQLCleanupStrategy {
  public readonly database = 'postgresql' as const;
  private performanceMetrics: CleanupPerformanceMetrics | null = null;

  constructor(private connection: PostgreSQLConnection) {}

  async cleanup(options?: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    const connectionStartTime = Date.now();
    
    const mergedOptions = {
      preserveSchema: true,
      resetSequences: true,
      batchSize: 1000,
      retryAttempts: 3,
      ...options,
    };

    let recordsRemoved = 0;
    const tablesAffected: string[] = [];
    const errors: Error[] = [];
    const warnings: string[] = [];

    const client = await this.connection.pool.connect();
    const connectionTime = Date.now() - connectionStartTime;

    try {
      await client.query('BEGIN');

      // Get all user tables (excluding system tables)
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `;
      
      const queryStartTime = Date.now();
      const { rows: tables } = await client.query(tablesQuery);
      
      if (tables.length === 0) {
        warnings.push('No tables found to clean');
      }

      // Disable foreign key checks temporarily for faster cleanup
      await client.query('SET CONSTRAINTS ALL DEFERRED');

      // Clean each table
      for (const { table_name: tableName } of tables) {
        try {
          // Count records before cleanup
          const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
          const recordCount = parseInt(countResult.rows[0].count);

          if (recordCount > 0) {
            if (mergedOptions.batchSize && recordCount > mergedOptions.batchSize) {
              // Use batched deletion for large tables
              await this.batchedDelete(client, tableName, mergedOptions.batchSize);
            } else {
              // Use TRUNCATE for smaller tables (faster)
              await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
            }
            
            recordsRemoved += recordCount;
            tablesAffected.push(tableName);
          }
        } catch (error) {
          const cleanupError = new CleanupError(
            `Failed to clean table ${tableName}: ${error}`,
            this.database,
            `cleanup_table_${tableName}`,
            error as Error
          );
          errors.push(cleanupError);
        }
      }

      // Reset sequences if requested
      if (mergedOptions.resetSequences) {
        try {
          await this.resetSequences();
        } catch (error) {
          warnings.push(`Failed to reset sequences: ${error}`);
        }
      }

      // Re-enable foreign key checks
      await client.query('SET CONSTRAINTS ALL IMMEDIATE');

      // Optional: Run VACUUM to reclaim space
      if (mergedOptions.performanceMonitoring && recordsRemoved > 1000) {
        try {
          await client.query('VACUUM ANALYZE');
        } catch (error) {
          warnings.push(`VACUUM ANALYZE failed: ${error}`);
        }
      }

      await client.query('COMMIT');

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
        tablesAffected,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        performanceMetrics: this.performanceMetrics,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      const cleanupError = new CleanupError(
        `PostgreSQL cleanup failed: ${error}`,
        this.database,
        'cleanup',
        error as Error
      );
      
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        tablesAffected,
        errors: [cleanupError],
      };
    } finally {
      client.release();
    }
  }

  async verify(options?: CleanupOptions): Promise<CleanupVerificationResult> {
    const startTime = Date.now();
    const issues: CleanupIssue[] = [];
    let checkedTables = 0;

    const client = await this.connection.pool.connect();

    try {
      // Check if any tables have data
      const tablesQuery = `
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `;
      
      const { rows: tables } = await client.query(tablesQuery);
      checkedTables = tables.length;

      for (const { table_name: tableName } of tables) {
        const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
        const recordCount = parseInt(countResult.rows[0].count);

        if (recordCount > 0) {
          issues.push({
            type: 'data_remaining',
            severity: 'warning',
            location: `table: ${tableName}`,
            description: `Table ${tableName} contains ${recordCount} records`,
            suggestion: 'Run cleanup again or check for foreign key constraints',
          });
        }
      }

      // Check for active transactions
      const activeTransactionsQuery = `
        SELECT COUNT(*) as count 
        FROM pg_stat_activity 
        WHERE state = 'active' 
        AND query NOT LIKE '%pg_stat_activity%'
      `;
      
      const { rows: [{ count: activeTransactions }] } = await client.query(activeTransactionsQuery);
      
      if (parseInt(activeTransactions) > 1) { // Excluding our own connection
        issues.push({
          type: 'connection_issue',
          severity: 'info',
          location: 'database connections',
          description: `${activeTransactions} active transactions detected`,
          suggestion: 'Consider waiting for transactions to complete',
        });
      }

      return {
        isClean: issues.filter(i => i.severity === 'critical' || i.severity === 'warning').length === 0,
        database: this.database,
        issues,
        verificationTime: Date.now() - startTime,
        checkedItems: {
          tables: checkedTables,
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
          tables: checkedTables,
        },
      };
    } finally {
      client.release();
    }
  }

  async reset(options?: CleanupOptions): Promise<CleanupResult> {
    // Reset is the same as cleanup for PostgreSQL
    return this.cleanup(options);
  }

  async truncateTables(tables?: string[], options?: CleanupOptions): Promise<CleanupResult> {
    const startTime = Date.now();
    let recordsRemoved = 0;
    const tablesAffected: string[] = [];
    const errors: Error[] = [];

    const client = await this.connection.pool.connect();

    try {
      await client.query('BEGIN');

      // If no tables specified, get all tables
      let targetTables = tables;
      if (!targetTables) {
        const tablesQuery = `
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
        `;
        const { rows } = await client.query(tablesQuery);
        targetTables = rows.map((row: any) => row.table_name);
      }

      for (const tableName of targetTables || []) {
        try {
          // Count records before truncation
          const countResult = await client.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
          const recordCount = parseInt(countResult.rows[0].count);

          if (recordCount > 0) {
            await client.query(`TRUNCATE TABLE "${tableName}" RESTART IDENTITY CASCADE`);
            recordsRemoved += recordCount;
            tablesAffected.push(tableName);
          }
        } catch (error) {
          errors.push(new CleanupError(
            `Failed to truncate table ${tableName}: ${error}`,
            this.database,
            `truncate_${tableName}`,
            error as Error
          ));
        }
      }

      await client.query('COMMIT');

      return {
        success: errors.length === 0,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        tablesAffected,
        errors: errors.length > 0 ? errors : undefined,
      };

    } catch (error) {
      await client.query('ROLLBACK');
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved,
        tablesAffected,
        errors: [new CleanupError(
          `Truncate tables failed: ${error}`,
          this.database,
          'truncate_tables',
          error as Error
        )],
      };
    } finally {
      client.release();
    }
  }

  async rollbackTransactions(): Promise<CleanupResult> {
    const startTime = Date.now();
    const client = await this.connection.pool.connect();

    try {
      // Get all active transactions except our own
      const activeTransactionsQuery = `
        SELECT pid, query, state_change 
        FROM pg_stat_activity 
        WHERE state IN ('active', 'idle in transaction') 
        AND pid != pg_backend_pid()
      `;
      
      const { rows: transactions } = await client.query(activeTransactionsQuery);
      
      // Note: We don't actually terminate other connections as that could be dangerous
      // Instead, we just rollback our own transaction if it exists
      await client.query('ROLLBACK');

      return {
        success: true,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        warnings: [`Found ${transactions.length} active transactions (not terminated for safety)`],
      };

    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        errors: [new CleanupError(
          `Rollback transactions failed: ${error}`,
          this.database,
          'rollback_transactions',
          error as Error
        )],
      };
    } finally {
      client.release();
    }
  }

  async resetSequences(): Promise<CleanupResult> {
    const startTime = Date.now();
    const client = await this.connection.pool.connect();

    try {
      // Get all sequences
      const sequencesQuery = `
        SELECT sequence_name 
        FROM information_schema.sequences 
        WHERE sequence_schema = 'public'
      `;
      
      const { rows: sequences } = await client.query(sequencesQuery);
      
      for (const { sequence_name: sequenceName } of sequences) {
        await client.query(`ALTER SEQUENCE "${sequenceName}" RESTART WITH 1`);
      }

      return {
        success: true,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
      };

    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        errors: [new CleanupError(
          `Reset sequences failed: ${error}`,
          this.database,
          'reset_sequences',
          error as Error
        )],
      };
    } finally {
      client.release();
    }
  }

  async dropTestSchemas(): Promise<CleanupResult> {
    const startTime = Date.now();
    const client = await this.connection.pool.connect();

    try {
      // Get test schemas (schemas that start with 'test_')
      const schemasQuery = `
        SELECT schema_name 
        FROM information_schema.schemata 
        WHERE schema_name LIKE 'test_%'
      `;
      
      const { rows: schemas } = await client.query(schemasQuery);
      
      for (const { schema_name: schemaName } of schemas) {
        await client.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
      }

      return {
        success: true,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
      };

    } catch (error) {
      return {
        success: false,
        database: this.database,
        duration: Date.now() - startTime,
        recordsRemoved: 0,
        errors: [new CleanupError(
          `Drop test schemas failed: ${error}`,
          this.database,
          'drop_test_schemas',
          error as Error
        )],
      };
    } finally {
      client.release();
    }
  }

  getPerformanceMetrics(): CleanupPerformanceMetrics | null {
    return this.performanceMetrics;
  }

  private async batchedDelete(client: any, tableName: string, batchSize: number): Promise<void> {
    let deletedCount = 0;
    let totalDeleted = 0;

    do {
      const result = await client.query(
        `DELETE FROM "${tableName}" WHERE ctid IN (SELECT ctid FROM "${tableName}" LIMIT $1)`,
        [batchSize]
      );
      deletedCount = result.rowCount;
      totalDeleted += deletedCount;
    } while (deletedCount > 0);
  }
}