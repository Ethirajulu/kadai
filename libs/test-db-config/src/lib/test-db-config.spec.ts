import { TestDatabaseManager } from './test-database-manager';
import { PostgreSQLConnectionFactory } from './factories/postgresql-factory';

describe('testDbConfig', () => {
  it('should export TestDatabaseManager', () => {
    expect(TestDatabaseManager).toBeDefined();
  });

  it('should export connection factories', () => {
    expect(PostgreSQLConnectionFactory).toBeDefined();
  });
});
