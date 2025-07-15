import { EventEmitter } from 'events';
import { PostgreSQLSeeder } from './postgresql-seeder';
import { MongoDBSeeder } from './mongodb-seeder';
import { RedisSeeder } from './redis-seeder';
import { QdrantSeeder } from './qdrant-seeder';
import {
  SeedOptions,
  SeedResult,
  SeedEvent,
  SeedEventHandler,
  DatabaseConnections,
  SeedExecutionPlan,
  SeedExecutionReport,
  CrossDatabaseSeedResult,
} from '../../types';
import { RelationshipAwareFactory } from '../factories';

export interface MultiDatabaseOrchestratorOptions extends SeedOptions {
  enableReferentialIntegrity?: boolean;
  enableParallelExecution?: boolean;
  enableRollbackOnFailure?: boolean;
  validateAfterSeeding?: boolean;
  retryAttempts?: number;
}

export class MultiDatabaseOrchestrator extends EventEmitter {
  private postgresSeeder?: PostgreSQLSeeder;
  private mongoSeeder?: MongoDBSeeder;
  private redisSeeder?: RedisSeeder;
  private qdrantSeeder?: QdrantSeeder;
  private relationshipFactory: RelationshipAwareFactory;
  private executionReport!: SeedExecutionReport;
  private options: MultiDatabaseOrchestratorOptions;

  constructor(
    private connections: DatabaseConnections,
    options: MultiDatabaseOrchestratorOptions = {}
  ) {
    super();
    this.options = {
      enableReferentialIntegrity: true,
      enableParallelExecution: false,
      enableRollbackOnFailure: true,
      validateAfterSeeding: true,
      retryAttempts: 3,
      ...options,
    };

    this.relationshipFactory = new RelationshipAwareFactory();
    this.initializeReport();
    this.initializeSeeders();
  }

  private initializeReport(): void {
    this.executionReport = {
      executionId: require('crypto').randomUUID(),
      startTime: new Date(),
      endTime: null,
      totalDuration: 0,
      totalRecords: 0,
      databases: {},
      errors: [],
      success: false,
      rollbackRequired: false,
      rollbackCompleted: false,
    };
  }

  private initializeSeeders(): void {
    // Initialize seeders based on available connections
    if (this.connections.postgresql) {
      this.postgresSeeder = new PostgreSQLSeeder(
        this.connections.postgresql,
        this.options
      );
      this.addSeederEventListeners('postgresql', this.postgresSeeder);
    }

    if (this.connections.mongodb) {
      this.mongoSeeder = new MongoDBSeeder(
        this.connections.mongodb,
        this.options
      );
      this.addSeederEventListeners('mongodb', this.mongoSeeder);
    }

    if (this.connections.redis) {
      this.redisSeeder = new RedisSeeder(this.connections.redis, this.options);
      this.addSeederEventListeners('redis', this.redisSeeder);
    }

    if (this.connections.qdrant) {
      this.qdrantSeeder = new QdrantSeeder(
        this.connections.qdrant,
        this.options
      );
      this.addSeederEventListeners('qdrant', this.qdrantSeeder);
    }
  }

  private addSeederEventListeners(database: string, seeder: any): void {
    const eventHandler: SeedEventHandler = (event: SeedEvent) => {
      // Forward seeder events and add to execution report
      this.emit('seedEvent', { ...event, database });

      if (!this.executionReport.databases[database]) {
        this.executionReport.databases[database] = {
          startTime: null,
          endTime: null,
          duration: 0,
          recordsCreated: 0,
          errors: [],
          success: false,
        };
      }

      const dbReport = this.executionReport.databases[database];

      switch (event.type) {
        case 'seed_start':
          dbReport.startTime = event.timestamp;
          break;
        case 'seed_complete':
          dbReport.endTime = event.timestamp;
          dbReport.duration = (event.data as any).duration;
          dbReport.recordsCreated = (event.data as any).totalRecords;
          dbReport.success = (event.data as any).success;
          break;
        case 'seed_error':
          dbReport.errors.push(event.error!);
          this.executionReport.errors.push(event.error!);
          break;
      }
    };

    seeder.on('seedEvent', eventHandler);
  }

  async execute(
    options?: MultiDatabaseOrchestratorOptions
  ): Promise<CrossDatabaseSeedResult> {
    const mergedOptions = { ...this.options, ...options };
    this.executionReport.startTime = new Date();

    this.emit('orchestration_start', {
      executionId: this.executionReport.executionId,
      databases: Object.keys(this.connections),
      options: mergedOptions,
    });

    try {
      // Generate unified dataset for all databases
      const unifiedDataset = this.generateUnifiedDataset(mergedOptions);

      // Create execution plan based on dependencies
      const executionPlan = this.createExecutionPlan(mergedOptions);

      // Execute seeding based on plan
      if (
        mergedOptions.enableParallelExecution &&
        !mergedOptions.enableReferentialIntegrity
      ) {
        await this.executeParallel(
          executionPlan,
          unifiedDataset,
          mergedOptions
        );
      } else {
        await this.executeSequential(
          executionPlan,
          unifiedDataset,
          mergedOptions
        );
      }

      // Validate results if requested
      if (mergedOptions.validateAfterSeeding) {
        await this.validateResults();
      }

      // Finalize report
      this.finalizeReport(true);

      this.emit('orchestration_complete', this.executionReport);

      return this.createCrossDbResult(true);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      this.executionReport.errors.push(err);

      // Rollback if enabled
      if (mergedOptions.enableRollbackOnFailure) {
        this.executionReport.rollbackRequired = true;
        await this.rollback();
      }

      this.finalizeReport(false);

      this.emit('orchestration_error', {
        executionId: this.executionReport.executionId,
        error: err,
        report: this.executionReport,
      });

      return this.createCrossDbResult(false, err);
    }
  }

  private generateUnifiedDataset(
    options: MultiDatabaseOrchestratorOptions
  ): any {
    if (!options.enableReferentialIntegrity) {
      // Generate separate datasets for each database
      return null;
    }

    // Generate a unified dataset that maintains relationships across databases
    return this.relationshipFactory.generateRelatedDataSet({
      userCount: options.userCount || 10,
      sellerRatio: 0.3,
      productsPerSeller: Math.floor(
        (options.productCount || 50) / ((options.userCount || 10) * 0.3)
      ),
      ordersPerUser: Math.floor(
        (options.orderCount || 30) / (options.userCount || 10)
      ),
      tasksPerUser: Math.floor(
        (options.taskCount || 20) / (options.userCount || 10)
      ),
      messagesPerUser: Math.floor(
        (options.messageCount || 100) / (options.userCount || 10)
      ),
      vectorsPerProduct: 1,
      vectorsPerMessage: 1,
    });
  }

  private createExecutionPlan(
    options: MultiDatabaseOrchestratorOptions
  ): SeedExecutionPlan {
    const plan: SeedExecutionPlan = {
      stages: [],
      dependencies: [],
      parallelizable: !options.enableReferentialIntegrity,
    };

    if (options.enableReferentialIntegrity) {
      // Sequential execution to maintain referential integrity
      plan.stages = [
        { databases: ['postgresql'], description: 'Seed core relational data' },
        {
          databases: ['mongodb', 'redis'],
          description: 'Seed document and cache data',
        },
        {
          databases: ['qdrant'],
          description: 'Seed vector data with references',
        },
      ];

      plan.dependencies = [
        {
          from: 'postgresql',
          to: 'mongodb',
          reason: 'MongoDB needs user IDs from PostgreSQL',
        },
        {
          from: 'postgresql',
          to: 'redis',
          reason: 'Redis cache needs product/user data',
        },
        {
          from: 'postgresql',
          to: 'qdrant',
          reason: 'Vector data needs product/user references',
        },
      ];
    } else {
      // Parallel execution possible
      plan.stages = [
        {
          databases: ['postgresql', 'mongodb', 'redis', 'qdrant'],
          description: 'Seed all databases in parallel',
        },
      ];
    }

    return plan;
  }

  private async executeSequential(
    plan: SeedExecutionPlan,
    unifiedDataset: unknown,
    options: MultiDatabaseOrchestratorOptions
  ): Promise<void> {
    for (const stage of plan.stages) {
      const stageResults = stage.databases
        .map((database) =>
          this.executeDatabaseSeeding(database, unifiedDataset, options)
        )
        .filter((p): p is Promise<SeedResult> => p !== null);

      // Wait for all seeders in this stage to complete
      const results = await Promise.allSettled(stageResults);

      // Check for failures
      const failures = results.filter(
        (result) =>
          result.status === 'rejected' ||
          (result.status === 'fulfilled' && !result.value.success)
      );

      if (failures.length > 0 && options.enableRollbackOnFailure) {
        throw new Error(`Seeding failed in stage: ${stage.description}`);
      }
    }
  }

  private async executeParallel(
    plan: SeedExecutionPlan,
    unifiedDataset: unknown,
    options: MultiDatabaseOrchestratorOptions
  ): Promise<void> {
    const allSeeders = (['postgresql', 'mongodb', 'redis', 'qdrant'] as const)
      .map((database) =>
        this.executeDatabaseSeeding(database, unifiedDataset, options)
      )
      .filter((p): p is Promise<SeedResult> => p !== null);

    const results = await Promise.allSettled(allSeeders);

    const failures = results.filter(
      (result) =>
        result.status === 'rejected' ||
        (result.status === 'fulfilled' && !result.value.success)
    );

    if (failures.length > 0 && options.enableRollbackOnFailure) {
      throw new Error(`Seeding failed in parallel execution`);
    }
  }

  private async executeDatabaseSeeding(
    database: string,
    unifiedDataset: unknown,
    options: MultiDatabaseOrchestratorOptions
  ): Promise<SeedResult | null> {
    let seeder: any;
    let seedOptions: SeedOptions;

    switch (database) {
      case 'postgresql':
        seeder = this.postgresSeeder;
        seedOptions = options;
        break;
      case 'mongodb':
        seeder = this.mongoSeeder;
        seedOptions = options;
        break;
      case 'redis':
        seeder = this.redisSeeder;
        seedOptions = options;
        break;
      case 'qdrant':
        seeder = this.qdrantSeeder;
        seedOptions = options;
        break;
      default:
        return null;
    }

    if (!seeder) {
      return null;
    }

    let attempt = 0;
    const maxAttempts = options.retryAttempts || 3;

    while (attempt < maxAttempts) {
      try {
        const result = await seeder.execute(seedOptions);
        if (result.success) {
          return result;
        }
        attempt++;
      } catch (error) {
        attempt++;
        if (attempt >= maxAttempts) {
          throw error;
        }

        // Wait before retry
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }

    throw new Error(`Failed to seed ${database} after ${maxAttempts} attempts`);
  }

  private async validateResults(): Promise<void> {
    const validationPromises: Promise<boolean>[] = [];

    if (this.postgresSeeder) {
      validationPromises.push(this.postgresSeeder.validate!());
    }
    if (this.mongoSeeder) {
      validationPromises.push(this.mongoSeeder.validate!());
    }
    if (this.redisSeeder) {
      validationPromises.push(this.redisSeeder.validate!());
    }
    if (this.qdrantSeeder) {
      validationPromises.push(this.qdrantSeeder.validate!());
    }

    const results = await Promise.all(validationPromises);
    const allValid = results.every((result) => result === true);

    if (!allValid) {
      throw new Error('Validation failed for one or more databases');
    }
  }

  async rollback(): Promise<void> {
    this.emit('rollback_start', {
      executionId: this.executionReport.executionId,
    });

    const rollbackPromises: Promise<SeedResult>[] = [];

    // Rollback in reverse order to respect dependencies
    if (this.qdrantSeeder) {
      rollbackPromises.push(this.qdrantSeeder.rollback!());
    }
    if (this.redisSeeder) {
      rollbackPromises.push(this.redisSeeder.rollback!());
    }
    if (this.mongoSeeder) {
      rollbackPromises.push(this.mongoSeeder.rollback!());
    }
    if (this.postgresSeeder) {
      rollbackPromises.push(this.postgresSeeder.rollback!());
    }

    try {
      await Promise.all(rollbackPromises);
      this.executionReport.rollbackCompleted = true;

      this.emit('rollback_complete', {
        executionId: this.executionReport.executionId,
      });
    } catch (error) {
      this.emit('rollback_error', {
        executionId: this.executionReport.executionId,
        error,
      });
      throw error;
    }
  }

  private finalizeReport(success: boolean): void {
    this.executionReport.endTime = new Date();
    this.executionReport.totalDuration =
      this.executionReport.endTime.getTime() -
      this.executionReport.startTime.getTime();
    this.executionReport.success = success;

    // Calculate total records across all databases
    this.executionReport.totalRecords = Object.values(
      this.executionReport.databases
    ).reduce((total, db) => total + db.recordsCreated, 0);
  }

  private createCrossDbResult(
    success: boolean,
    error?: Error
  ): CrossDatabaseSeedResult {
    return {
      success,
      totalRecords: this.executionReport.totalRecords,
      duration: this.executionReport.totalDuration,
      databases: Object.keys(this.executionReport.databases),
      executionReport: this.executionReport,
      errors: error ? [error] : this.executionReport.errors,
    };
  }

  getExecutionReport(): SeedExecutionReport {
    return { ...this.executionReport };
  }

  async cleanup(): Promise<void> {
    const cleanupPromises: Promise<any>[] = [];

    if (this.postgresSeeder) {
      cleanupPromises.push(this.postgresSeeder.rollback!());
    }
    if (this.mongoSeeder) {
      cleanupPromises.push(this.mongoSeeder.rollback!());
    }
    if (this.redisSeeder) {
      cleanupPromises.push(this.redisSeeder.rollback!());
    }
    if (this.qdrantSeeder) {
      cleanupPromises.push(this.qdrantSeeder.rollback!());
    }

    await Promise.all(cleanupPromises);
  }
}
