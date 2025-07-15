/**
 * Example usage of the database seeding utilities
 * This file demonstrates how to use the various seeding components
 */

import {
  DatabaseConnections,
  SeedOptions,
  TestMigration,
  SeedVersion,
  PostgreSQLConnection,
  MongoDBConnection,
  RedisConnection,
  QdrantConnection,
} from '../../types';
import {
  MultiDatabaseOrchestrator,
  SeedVersionManager,
  TestScenarioRunner,
  TestMigrationRunner,
  PostgreSQLSeeder,
} from './index';
import type {
  CrossDatabaseSeedResult,
  DatabaseExecutionReport,
} from '../../types';

// Example database connections (replace with actual connections)
const connections: DatabaseConnections = {
  postgresql: {
    pool: {} as PostgreSQLConnection['pool'], // Your PostgreSQL pool instance
    config: {} as PostgreSQLConnection['config'],
  },
  mongodb: {
    client: {} as MongoDBConnection['client'], // Your MongoDB client instance
    database: {} as MongoDBConnection['database'], // Your MongoDB database instance
    config: {} as MongoDBConnection['config'],
  },
  redis: {
    client: {} as RedisConnection['client'], // Your Redis client instance
    config: {} as RedisConnection['config'],
  },
  qdrant: {
    client: {} as QdrantConnection['client'], // Your Qdrant client instance
    config: {} as QdrantConnection['config'],
  },
};

/**
 * Example 1: Basic Single Database Seeding
 */
async function basicSingleDatabaseSeeding() {
  console.log('=== Basic Single Database Seeding ===');

  // Create a PostgreSQL seeder
  const postgresSeeder = new PostgreSQLSeeder(
    connections.postgresql as PostgreSQLConnection
  );

  // Define seed options
  const options: SeedOptions = {
    userCount: 25,
    productCount: 100,
    orderCount: 75,
    taskCount: 50,
    createRelationships: true,
    scenario: 'ecommerce',
    cleanup: true,
    validateData: true,
  };

  try {
    // Execute seeding
    const result = await postgresSeeder.execute(options);

    if (result.success) {
      console.log(
        `✅ Seeding completed: ${result.recordsCreated} records in ${result.duration}ms`
      );

      // Validate the seeded data
      const isValid = await postgresSeeder.validate?.();
      console.log(`✅ Data validation: ${isValid ? 'PASSED' : 'FAILED'}`);
    } else {
      console.error('❌ Seeding failed:', result.errors);
    }
  } catch (error) {
    console.error('❌ Seeding error:', error);
  }
}

/**
 * Example 2: Cross-Database Orchestrated Seeding
 */
async function crossDatabaseSeeding() {
  console.log('=== Cross-Database Orchestrated Seeding ===');

  // Create orchestrator with all database connections
  const orchestrator = new MultiDatabaseOrchestrator(connections, {
    enableReferentialIntegrity: true,
    enableParallelExecution: false,
    enableRollbackOnFailure: true,
    validateAfterSeeding: true,
  });

  // Define comprehensive seed options
  const options: SeedOptions = {
    userCount: 50,
    productCount: 200,
    orderCount: 150,
    taskCount: 75,
    messageCount: 300,
    vectorCount: 200,
    createRelationships: true,
    scenario: 'marketplace',
    cleanup: false,
    validateData: true,
  };

  try {
    // Listen to seeding events
    orchestrator.on('orchestration_start', (data) => {
      console.log(
        `🚀 Starting orchestration ${
          data.executionId
        } for databases: ${data.databases.join(', ')}`
      );
    });

    orchestrator.on('seedEvent', (event) => {
      console.log(`📊 Database ${event.database}: ${event.type}`);
    });

    orchestrator.on('orchestration_complete', (report) => {
      console.log(
        `✅ Orchestration completed: ${report.totalRecords} total records in ${report.totalDuration}ms`
      );
    });

    // Execute cross-database seeding
    const result = await orchestrator.execute(options);

    if (result.success) {
      console.log(`✅ Cross-database seeding completed successfully`);
      console.log(`📊 Total records: ${result.totalRecords}`);
      console.log(`⏱️ Duration: ${result.duration}ms`);
      console.log(`🗄️ Databases: ${result.databases.join(', ')}`);

      // Get detailed execution report
      const report = orchestrator.getExecutionReport();
      console.log('📋 Execution Report:');
      for (const [dbName, dbReport] of Object.entries(report.databases)) {
        console.log(
          `  ${dbName}: ${dbReport.recordsCreated} records, ${dbReport.duration}ms`
        );
      }
    } else {
      console.error('❌ Cross-database seeding failed:', result.errors);
    }
  } catch (error) {
    console.error('❌ Orchestration error:', error);
  }
}

/**
 * Example 3: Predefined Test Scenarios
 */
async function testScenarios() {
  console.log('=== Predefined Test Scenarios ===');

  const scenarioRunner = new TestScenarioRunner(connections);

  // Get available scenarios
  const scenarios = scenarioRunner.getAllScenarios();
  console.log('📋 Available scenarios:', Object.keys(scenarios));

  try {
    // Run a small dataset scenario for quick testing
    console.log('🧪 Running small-dataset scenario...');
    const smallResult = await scenarioRunner.runScenario('small-dataset');

    if (smallResult.success) {
      console.log(
        `✅ Small dataset scenario completed in ${smallResult.duration}ms`
      );
      console.log(
        `📊 Records created: ${
          (smallResult.result as CrossDatabaseSeedResult)?.totalRecords
        }`
      );
    }

    // Run an e-commerce scenario
    console.log('🛒 Running ecommerce scenario...');
    const ecommerceResult = await scenarioRunner.runScenario('ecommerce');

    if (ecommerceResult.success) {
      console.log(
        `✅ E-commerce scenario completed in ${ecommerceResult.duration}ms`
      );
      console.log(
        `📊 Records created: ${
          (ecommerceResult.result as CrossDatabaseSeedResult)?.totalRecords
        }`
      );
    }

    // Run multiple scenarios sequentially
    console.log('🔄 Running multiple scenarios...');
    const multipleResults = await scenarioRunner.runMultipleScenarios([
      'minimal',
      'small-dataset',
      'conversation',
    ]);

    console.log(`✅ Completed ${multipleResults.length} scenarios`);
    multipleResults.forEach((result, index) => {
      console.log(
        `  ${index + 1}. ${result.scenario}: ${
          result.success ? 'SUCCESS' : 'FAILED'
        } (${result.duration}ms)`
      );
    });
  } catch (error) {
    console.error('❌ Scenario execution error:', error);
  }
}

/**
 * Example 4: Version Management
 */
async function versionManagement() {
  console.log('=== Seed Version Management ===');

  const versionManager = new SeedVersionManager();

  try {
    // Initialize versioning
    await versionManager.initializeVersioning({
      defaultSeedOptions: {
        userCount: 10,
        productCount: 50,
        scenario: 'ecommerce',
      },
    });

    console.log('✅ Version management initialized');

    // Create a new version
    const newVersion: SeedVersion = {
      id: '1.1.0',
      version: '1.1.0',
      name: 'Enhanced E-commerce Dataset',
      description:
        'Improved seed data with better relationships and more realistic data',
      createdAt: new Date(),
      schema: { version: '1.0', type: 'enhanced-ecommerce' },
      seedOptions: {
        userCount: 100,
        productCount: 500,
        orderCount: 300,
        taskCount: 150,
        messageCount: 800,
        vectorCount: 500,
        createRelationships: true,
        scenario: 'marketplace',
        validateData: true,
      },
      dependencies: [
        { versionId: '1.0.0', reason: 'Base version with core schema' },
      ],
      metadata: {
        author: 'development-team',
        purpose: 'performance-testing',
        environment: 'test',
      },
    };

    const createResult = await versionManager.createVersion(newVersion);
    if (createResult.success) {
      console.log(`✅ Created version ${createResult.version}`);
    }

    // Apply the version
    const applyResult = await versionManager.applyVersion('1.1.0');
    if (applyResult.success) {
      console.log(`✅ Applied version ${applyResult.version}`);
      console.log(`📌 Current version: ${versionManager.getCurrentVersion()}`);
    }

    // Show version history
    const history = versionManager.getVersionHistory();
    console.log('📋 Version History:');
    history.forEach((entry, index) => {
      console.log(
        `  ${index + 1}. ${entry.version.id} - ${entry.version.name} (${
          entry.status
        })`
      );
    });

    // Rollback if needed
    if (process.env.DEMO_ROLLBACK === 'true') {
      const rollbackResult = await versionManager.rollbackVersion('1.1.0');
      if (rollbackResult.success) {
        console.log(`✅ Rolled back version ${rollbackResult.version}`);
      }
    }
  } catch (error) {
    console.error('❌ Version management error:', error);
  }
}

/**
 * Example 5: Test Environment Migrations
 */
async function testMigrations() {
  console.log('=== Test Environment Migrations ===');

  const migrationRunner = new TestMigrationRunner(connections);

  // Define a test migration
  const schemaMigration: TestMigration = {
    id: 'add-user-preferences-table',
    name: 'Add User Preferences Table',
    description:
      'Creates a new table for storing user preferences in test environment',
    version: '1.0.0',
    order: 1,
    targetDatabases: ['postgresql'],
    rollbackOnFailure: true,
    operations: {
      postgresql: [
        {
          sql: `
            CREATE TABLE IF NOT EXISTS user_preferences (
              id SERIAL PRIMARY KEY,
              user_id UUID NOT NULL REFERENCES users(id),
              preference_key VARCHAR(100) NOT NULL,
              preference_value TEXT,
              created_at TIMESTAMP DEFAULT NOW(),
              updated_at TIMESTAMP DEFAULT NOW(),
              UNIQUE(user_id, preference_key)
            )
          `,
        },
        {
          sql: `
            CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
            ON user_preferences(user_id)
          `,
        },
      ],
    },
    rollback: {
      postgresql: [{ sql: 'DROP TABLE IF EXISTS user_preferences CASCADE' }],
    },
    metadata: {
      purpose: 'test-enhancement',
      safe: true,
    },
  };

  try {
    // Register the migration
    migrationRunner.registerMigration(schemaMigration);
    console.log('📝 Registered migration:', schemaMigration.name);

    // Run the migration
    const migrationResult = await migrationRunner.runMigration(
      schemaMigration.id
    );
    if (migrationResult.success) {
      console.log(`✅ Migration completed in ${migrationResult.duration}ms`);
    } else {
      console.error('❌ Migration failed:', migrationResult.error);
    }

    // Check migration state
    const state = migrationRunner.getMigrationState(schemaMigration.id);
    console.log(`📊 Migration state: ${state}`);

    // Get migration history
    const history = migrationRunner.getMigrationHistory();
    console.log('📋 Migration History:');
    history.forEach((entry, index) => {
      console.log(
        `  ${index + 1}. ${entry.name} - ${entry.status} (${entry.duration}ms)`
      );
    });

    // Rollback if needed for demo
    if (process.env.DEMO_ROLLBACK === 'true') {
      const rollbackResult = await migrationRunner.rollbackMigration(
        schemaMigration.id
      );
      if (rollbackResult.success) {
        console.log(`✅ Migration rolled back in ${rollbackResult.duration}ms`);
      }
    }
  } catch (error) {
    console.error('❌ Migration error:', error);
  }
}

/**
 * Example 6: Performance Testing Setup
 */
async function performanceTestingSetup() {
  console.log('=== Performance Testing Setup ===');

  const scenarioRunner = new TestScenarioRunner(connections);

  try {
    // Run performance test scenario with optimized settings
    console.log('🚀 Setting up large dataset for performance testing...');

    const startTime = Date.now();
    const result = await scenarioRunner.runScenario('performance-test', {
      userCount: 1000,
      productCount: 5000,
      orderCount: 3000,
      messageCount: 10000,
      vectorCount: 5000,
    });

    const totalTime = Date.now() - startTime;

    if (result.success) {
      console.log(`✅ Performance test setup completed`);
      console.log(
        `📊 Total records: ${
          (result.result as CrossDatabaseSeedResult)?.totalRecords
        }`
      );
      console.log(`⏱️ Setup time: ${totalTime}ms`);
      console.log(
        `🔥 Records/second: ${Math.round(
          ((result.result as CrossDatabaseSeedResult)?.totalRecords || 0) /
            (totalTime / 1000)
        )}`
      );

      // Performance metrics
      if ((result.result as CrossDatabaseSeedResult)?.executionReport) {
        console.log('📈 Database Performance:');
        for (const [dbName, dbReport] of Object.entries(
          (result.result as CrossDatabaseSeedResult).executionReport.databases
        )) {
          const db = dbReport as DatabaseExecutionReport;
          const rps = Math.round(db.recordsCreated / (db.duration / 1000));
          console.log(
            `  ${dbName}: ${db.recordsCreated} records, ${rps} records/sec`
          );
        }
      }
    } else {
      console.error('❌ Performance test setup failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Performance setup error:', error);
  }
}

/**
 * Main function to run all examples
 */
export async function runAllExamples() {
  console.log('🎯 Running Database Seeding Examples\n');

  try {
    await basicSingleDatabaseSeeding();
    console.log('\n' + '='.repeat(50) + '\n');

    await crossDatabaseSeeding();
    console.log('\n' + '='.repeat(50) + '\n');

    await testScenarios();
    console.log('\n' + '='.repeat(50) + '\n');

    await versionManagement();
    console.log('\n' + '='.repeat(50) + '\n');

    await testMigrations();
    console.log('\n' + '='.repeat(50) + '\n');

    await performanceTestingSetup();
    console.log('\n' + '='.repeat(50) + '\n');

    console.log('🎉 All examples completed successfully!');
  } catch (error) {
    console.error('❌ Example execution failed:', error);
  }
}

// Export individual functions for selective usage
export {
  basicSingleDatabaseSeeding,
  crossDatabaseSeeding,
  testScenarios,
  versionManagement,
  testMigrations,
  performanceTestingSetup,
};

// Uncomment to run examples
// runAllExamples().catch(console.error);
