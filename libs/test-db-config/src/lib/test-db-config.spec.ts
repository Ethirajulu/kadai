import { TestDatabaseManager } from './test-database-manager.js';
import { PostgreSQLConnectionFactory } from './factories/postgresql-factory.js';

describe('testDbConfig', () => {
  it('should export TestDatabaseManager', () => {
    expect(TestDatabaseManager).toBeDefined();
  });

  it('should export connection factories', () => {
    expect(PostgreSQLConnectionFactory).toBeDefined();
  });
});
