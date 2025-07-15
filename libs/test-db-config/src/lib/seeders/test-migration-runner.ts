import { EventEmitter } from 'events';
import {
  DatabaseConnections,
  TestMigration,
  TestMigrationResult,
  TestMigrationState,
  TestMigrationHistory,
  TestMigrationOptions,
  TestMigrationRunner as ITestMigrationRunner,
} from '../../types';

export class TestMigrationRunner
  extends EventEmitter
  implements ITestMigrationRunner
{
  private migrations: Map<string, TestMigration>;
  private migrationHistory: TestMigrationHistory[];
  private currentState: Map<string, TestMigrationState>;

  constructor(private connections: DatabaseConnections) {
    super();
    this.migrations = new Map();
    this.migrationHistory = [];
    this.currentState = new Map();
  }

  registerMigration(migration: TestMigration): void {
    this.migrations.set(migration.id, migration);
    this.currentState.set(migration.id, 'pending');

    this.emit('migration_registered', { migration });
  }

  async runMigration(
    migrationId: string,
    options?: TestMigrationOptions
  ): Promise<TestMigrationResult> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      return {
        success: false,
        migrationId,
        error: new Error(`Migration ${migrationId} not found`),
        message: 'Migration not found',
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      this.emit('migration_start', { migration });
      this.currentState.set(migrationId, 'running');

      // Check dependencies
      if (migration.dependencies && migration.dependencies.length > 0) {
        for (const depId of migration.dependencies) {
          const depState = this.currentState.get(depId);
          if (depState !== 'completed') {
            // Try to run dependency first
            const depResult = await this.runMigration(depId, options);
            if (!depResult.success) {
              throw new Error(
                `Failed to run dependency migration ${depId}: ${depResult.error?.message}`
              );
            }
          }
        }
      }

      // Run the migration based on target databases
      const results: Record<string, any> = {};

      for (const database of migration.targetDatabases) {
        const dbResult = await this.runDatabaseMigration(
          migration,
          database,
          options
        );
        results[database] = dbResult;

        if (!dbResult.success && migration.rollbackOnFailure) {
          // Rollback previous successful operations
          await this.rollbackMigration(migrationId, options);
          throw new Error(
            `Migration failed for database ${database}: ${dbResult.error}`
          );
        }
      }

      const duration = Date.now() - startTime;
      this.currentState.set(migrationId, 'completed');

      // Record in history
      const historyEntry: TestMigrationHistory = {
        migrationId: migration.id,
        name: migration.name,
        appliedAt: new Date(),
        rolledBackAt: null,
        status: 'completed',
        duration,
        results,
        metadata: {
          environment: options?.environment || process.env.NODE_ENV || 'test',
          version: migration.version,
        },
      };
      this.migrationHistory.push(historyEntry);

      this.emit('migration_complete', { migration, result: historyEntry });

      return {
        success: true,
        migrationId,
        message: `Migration ${migrationId} completed successfully`,
        duration,
        details: results,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.currentState.set(migrationId, 'failed');

      // Record failure in history
      const historyEntry: TestMigrationHistory = {
        migrationId: migration.id,
        name: migration.name,
        appliedAt: new Date(),
        rolledBackAt: null,
        status: 'failed',
        duration,
        results: { error: err.message },
        metadata: {
          environment: options?.environment || process.env.NODE_ENV || 'test',
          version: migration.version,
        },
      };
      this.migrationHistory.push(historyEntry);

      this.emit('migration_error', {
        migration,
        error: err,
        result: historyEntry,
      });

      return {
        success: false,
        migrationId,
        error: err,
        message: `Migration ${migrationId} failed`,
        duration,
      };
    }
  }

  async rollbackMigration(
    migrationId: string,
    options?: TestMigrationOptions
  ): Promise<TestMigrationResult> {
    const migration = this.migrations.get(migrationId);
    if (!migration) {
      return {
        success: false,
        migrationId,
        error: new Error(`Migration ${migrationId} not found`),
        message: 'Migration not found',
        duration: 0,
      };
    }

    const startTime = Date.now();

    try {
      this.emit('migration_rollback_start', { migration });

      // Check if rollback is supported
      if (!migration.rollback) {
        throw new Error(`Migration ${migrationId} does not support rollback`);
      }

      // Run rollback operations
      const results: Record<string, any> = {};

      for (const database of migration.targetDatabases) {
        const dbResult = await this.rollbackDatabaseMigration(
          migration,
          database,
          options
        );
        results[database] = dbResult;
      }

      const duration = Date.now() - startTime;
      this.currentState.set(migrationId, 'rolled_back');

      // Update history
      const historyEntry = this.migrationHistory.find(
        (h) => h.migrationId === migrationId
      );
      if (historyEntry) {
        historyEntry.status = 'rolled_back';
        historyEntry.rolledBackAt = new Date();
      }

      this.emit('migration_rollback_complete', { migration, duration });

      return {
        success: true,
        migrationId,
        message: `Migration ${migrationId} rolled back successfully`,
        duration,
        details: results,
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.emit('migration_rollback_error', { migration, error: err });

      return {
        success: false,
        migrationId,
        error: err,
        message: `Migration rollback ${migrationId} failed`,
        duration,
      };
    }
  }

  async runAllPendingMigrations(
    options?: TestMigrationOptions
  ): Promise<TestMigrationResult[]> {
    const results: TestMigrationResult[] = [];
    const pendingMigrations = Array.from(this.migrations.values())
      .filter((m) => this.currentState.get(m.id) === 'pending')
      .sort((a, b) => a.order - b.order);

    for (const migration of pendingMigrations) {
      const result = await this.runMigration(migration.id, options);
      results.push(result);

      // Stop on first failure if not configured to continue
      if (!result.success && !options?.continueOnFailure) {
        break;
      }
    }

    return results;
  }

  private async runDatabaseMigration(
    migration: TestMigration,
    database: string,
    options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    const connection = this.connections[database as keyof DatabaseConnections];
    if (!connection) {
      return {
        success: false,
        error: `No connection available for database ${database}`,
      };
    }

    try {
      switch (database) {
        case 'postgresql':
          return await this.runPostgreSQLMigration(
            migration,
            connection as any,
            options
          );
        case 'mongodb':
          return await this.runMongoDBMigration(
            migration,
            connection as any,
            options
          );
        case 'redis':
          return await this.runRedisMigration(
            migration,
            connection as any,
            options
          );
        case 'qdrant':
          return await this.runQdrantMigration(
            migration,
            connection as any,
            options
          );
        default:
          return {
            success: false,
            error: `Unsupported database type: ${database}`,
          };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        error: err.message,
      };
    }
  }

  private async rollbackDatabaseMigration(
    migration: TestMigration,
    database: string,
    options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    const connection = this.connections[database as keyof DatabaseConnections];
    if (!connection) {
      return {
        success: false,
        error: `No connection available for database ${database}`,
      };
    }

    try {
      if (!migration.rollback) {
        return {
          success: false,
          error: 'Rollback operations not defined',
        };
      }

      switch (database) {
        case 'postgresql':
          return await this.rollbackPostgreSQLMigration(
            migration,
            connection as any,
            options
          );
        case 'mongodb':
          return await this.rollbackMongoDBMigration(
            migration,
            connection as any,
            options
          );
        case 'redis':
          return await this.rollbackRedisMigration(
            migration,
            connection as any,
            options
          );
        case 'qdrant':
          return await this.rollbackQdrantMigration(
            migration,
            connection as any,
            options
          );
        default:
          return {
            success: false,
            error: `Unsupported database type: ${database}`,
          };
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      return {
        success: false,
        error: err.message,
      };
    }
  }

  private async runPostgreSQLMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    const client = await (connection as any).pool.connect();
    try {
      await client.query('BEGIN');

      for (const operation of migration.operations.postgresql || []) {
        if (operation.sql) {
          await client.query(operation.sql);
        }
        if (operation.script) {
          await operation.script(client);
        }
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async runMongoDBMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    const session = (connection as any).client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const operation of migration.operations.mongodb || []) {
          if (operation.collection && operation.operation) {
            const collection = (connection as any).database.collection(
              operation.collection
            );
            await collection[operation.operation](...(operation.args || []));
          }
          if (operation.script) {
            await operation.script(connection as any);
          }
        }
      });
      return { success: true };
    } finally {
      await session.endSession();
    }
  }

  private async runRedisMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    for (const operation of migration.operations.redis || []) {
      if (operation.command) {
        await (connection as any).client[operation.command](
          ...(operation.args || [])
        );
      }
      if (operation.script) {
        await operation.script(connection as any);
      }
    }
    return { success: true };
  }

  private async runQdrantMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    for (const operation of migration.operations.qdrant || []) {
      if (operation.method) {
        await (connection as any).client[operation.method](
          ...(operation.args || [])
        );
      }
      if (operation.script) {
        await operation.script(connection as any);
      }
    }
    return { success: true };
  }

  private async rollbackPostgreSQLMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    const client = await (connection as any).pool.connect();
    try {
      await client.query('BEGIN');

      for (const operation of migration.rollback?.postgresql || []) {
        if (operation.sql) {
          await client.query(operation.sql);
        }
        if (operation.script) {
          await operation.script(client);
        }
      }

      await client.query('COMMIT');
      return { success: true };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async rollbackMongoDBMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    const session = (connection as any).client.startSession();
    try {
      await session.withTransaction(async () => {
        for (const operation of migration.rollback?.mongodb || []) {
          if (operation.collection && operation.operation) {
            const collection = (connection as any).database.collection(
              operation.collection
            );
            await collection[operation.operation](...(operation.args || []));
          }
          if (operation.script) {
            await operation.script(connection as any);
          }
        }
      });
      return { success: true };
    } finally {
      await session.endSession();
    }
  }

  private async rollbackRedisMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    for (const operation of migration.rollback?.redis || []) {
      if (operation.command) {
        await (connection as any).client[operation.command](
          ...(operation.args || [])
        );
      }
      if (operation.script) {
        await operation.script(connection as any);
      }
    }
    return { success: true };
  }

  private async rollbackQdrantMigration(
    migration: TestMigration,
    connection: unknown,
    _options?: TestMigrationOptions
  ): Promise<{ success: boolean; error?: string }> {
    for (const operation of migration.rollback?.qdrant || []) {
      if (operation.method) {
        await (connection as any).client[operation.method](
          ...(operation.args || [])
        );
      }
      if (operation.script) {
        await operation.script(connection as any);
      }
    }
    return { success: true };
  }

  getMigrationHistory(): TestMigrationHistory[] {
    return [...this.migrationHistory];
  }

  getMigrationState(migrationId: string): TestMigrationState | undefined {
    return this.currentState.get(migrationId);
  }

  getAllMigrations(): TestMigration[] {
    return Array.from(this.migrations.values()).sort(
      (a, b) => a.order - b.order
    );
  }

  getPendingMigrations(): TestMigration[] {
    return this.getAllMigrations().filter(
      (m) => this.currentState.get(m.id) === 'pending'
    );
  }

  getCompletedMigrations(): TestMigration[] {
    return this.getAllMigrations().filter(
      (m) => this.currentState.get(m.id) === 'completed'
    );
  }

  getFailedMigrations(): TestMigration[] {
    return this.getAllMigrations().filter(
      (m) => this.currentState.get(m.id) === 'failed'
    );
  }
}
