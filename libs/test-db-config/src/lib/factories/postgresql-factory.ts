import { Pool } from 'pg';
import { PostgreSQLTestConfig, PostgreSQLConnection } from '../../types';

export class PostgreSQLConnectionFactory {
  async createConnection(config: PostgreSQLTestConfig): Promise<PostgreSQLConnection> {
    const poolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.username,
      password: config.password,
      ssl: config.ssl,
      max: config.poolSize || 10,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeoutMillis || 2000,
    };

    const pool = new Pool(poolConfig);

    try {
      // Test the connection
      await this.testConnection(pool);
      
      return {
        pool,
        config,
      };
    } catch (error) {
      await pool.end();
      throw new Error(`Failed to create PostgreSQL connection: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async testConnection(pool: Pool): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  async closeConnection(connection: PostgreSQLConnection): Promise<void> {
    await connection.pool.end();
  }

  async isHealthy(connection: PostgreSQLConnection): Promise<boolean> {
    try {
      const result = await connection.pool.query('SELECT 1');
      return result.rows.length === 1;
    } catch {
      return false;
    }
  }

  createTestDatabaseName(baseName: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `test_${baseName}_${timestamp}_${random}`;
  }
}