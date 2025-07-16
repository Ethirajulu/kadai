import { DatabaseConnections } from '../../types/database';
import {
  CleanupVerifier,
  VerificationReport,
} from '../verification/cleanup-verifier';

// Database query result interfaces
interface PostgreSQLTableResult {
  table_name: string;
}

interface PostgreSQLSequenceResult {
  sequence_name: string;
}

interface MongoDBCollectionResult {
  name: string;
}

interface QdrantCollectionResult {
  name: string;
}

export interface DebugContext {
  testName: string;
  testFile: string;
  startTime: Date;
  endTime?: Date;
  error?: Error;
  databases: string[];
  connections: DatabaseConnections;
}

export interface ConnectionDiagnostics {
  database: string;
  connected: boolean;
  responseTime: number;
  errorMessage?: string;
  details: {
    host?: string;
    port?: number;
    database?: string;
    poolSize?: number;
    activeConnections?: number;
    pendingConnections?: number;
  };
}

export interface DatabaseStateSnapshot {
  database: string;
  timestamp: Date;
  state: {
    postgresql?: {
      tables: string[];
      sequences: string[];
      activeConnections: number;
      databaseSize: string;
    };
    mongodb?: {
      collections: string[];
      databaseSize: number;
      activeOperations: number;
    };
    redis?: {
      keyCount: number;
      memoryUsage: string;
      connectedClients: number;
    };
    qdrant?: {
      collections: string[];
      totalPoints: number;
      memoryUsage: string;
    };
  };
}

export interface DebugReport {
  context: DebugContext;
  connectionDiagnostics: ConnectionDiagnostics[];
  databaseSnapshots: DatabaseStateSnapshot[];
  verificationReport?: VerificationReport;
  recommendations: string[];
  summary: string;
}

export class DatabaseDebugger {
  private connections: DatabaseConnections;
  private verifier: CleanupVerifier;
  private debugHistory: DebugContext[] = [];

  constructor(connections: DatabaseConnections) {
    this.connections = connections;
    this.verifier = new CleanupVerifier(connections);
    // Reporter initialization removed - not currently used
  }

  /**
   * Create debug context for a test
   */
  createDebugContext(
    testName: string,
    testFile: string,
    databases?: string[]
  ): DebugContext {
    const context: DebugContext = {
      testName,
      testFile,
      startTime: new Date(),
      databases: databases || Object.keys(this.connections),
      connections: this.connections,
    };

    this.debugHistory.push(context);
    return context;
  }

  /**
   * Complete debug context with end time and optional error
   */
  completeDebugContext(context: DebugContext, error?: Error): DebugContext {
    context.endTime = new Date();
    context.error = error;
    return context;
  }

  /**
   * Diagnose database connections
   */
  async diagnoseConnections(
    databases?: string[]
  ): Promise<ConnectionDiagnostics[]> {
    const targetDatabases = databases || Object.keys(this.connections);
    const diagnostics: ConnectionDiagnostics[] = [];

    for (const database of targetDatabases) {
      const diagnostic = await this.diagnoseConnection(database);
      diagnostics.push(diagnostic);
    }

    return diagnostics;
  }

  private async diagnoseConnection(
    database: string
  ): Promise<ConnectionDiagnostics> {
    const connection = this.connections[database as keyof DatabaseConnections];
    const startTime = Date.now();

    if (!connection) {
      return {
        database,
        connected: false,
        responseTime: 0,
        errorMessage: 'Connection not configured',
        details: {},
      };
    }

    try {
      let connected = false;
      let details: any = {};

      switch (database) {
        case 'postgresql': {
          const pgConn = connection as any;
          const client = await pgConn.pool.connect();

          try {
            const result = await client.query('SELECT version()');
            const poolStats = await client.query(
              'SELECT count(*) FROM pg_stat_activity'
            );

            connected = result.rows.length > 0;
            details = {
              host: pgConn.config.host,
              port: pgConn.config.port,
              database: pgConn.config.database,
              poolSize: pgConn.pool.options.max,
              activeConnections: parseInt(poolStats.rows[0].count),
            };
          } finally {
            client.release();
          }
          break;
        }
        case 'mongodb': {
          const mongoConn = connection as any;
          await mongoConn.database.admin().ping();
          const dbStats = await mongoConn.database.stats();

          connected = true;
          details = {
            host: mongoConn.config.host,
            port: mongoConn.config.port,
            database: mongoConn.config.database,
            databaseSize: dbStats.dataSize,
          };
          break;
        }
        case 'redis': {
          const redisConn = connection as any;
          await redisConn.client.ping();
          const info = await redisConn.client.info();

          connected = true;
          details = {
            host: redisConn.config.host,
            port: redisConn.config.port,
            database: redisConn.config.db,
            connectedClients: this.parseRedisInfo(info, 'connected_clients'),
          };
          break;
        }
        case 'qdrant': {
          const qdrantConn = connection as any;
          const collections = await qdrantConn.client.getCollections();

          connected = true;
          details = {
            host: qdrantConn.config.host,
            port: qdrantConn.config.port,
            collections: collections.collections?.length || 0,
          };
          break;
        }
      }

      return {
        database,
        connected,
        responseTime: Date.now() - startTime,
        details,
      };
    } catch (error) {
      return {
        database,
        connected: false,
        responseTime: Date.now() - startTime,
        errorMessage: (error as Error).message,
        details: {},
      };
    }
  }

  /**
   * Take database state snapshots
   */
  async takeDatabaseSnapshots(
    databases?: string[]
  ): Promise<DatabaseStateSnapshot[]> {
    const targetDatabases = databases || Object.keys(this.connections);
    const snapshots: DatabaseStateSnapshot[] = [];

    for (const database of targetDatabases) {
      const snapshot = await this.takeDatabaseSnapshot(database);
      snapshots.push(snapshot);
    }

    return snapshots;
  }

  private async takeDatabaseSnapshot(
    database: string
  ): Promise<DatabaseStateSnapshot> {
    const connection = this.connections[database as keyof DatabaseConnections];
    const snapshot: DatabaseStateSnapshot = {
      database,
      timestamp: new Date(),
      state: {},
    };

    if (!connection) {
      return snapshot;
    }

    try {
      switch (database) {
        case 'postgresql': {
          const pgConn = connection as any;
          const client = await pgConn.pool.connect();

          try {
            const tablesResult = await client.query(`
              SELECT table_name FROM information_schema.tables 
              WHERE table_schema = 'public'
            `);

            const sequencesResult = await client.query(`
              SELECT sequence_name FROM information_schema.sequences 
              WHERE sequence_schema = 'public'
            `);

            const connectionsResult = await client.query(
              'SELECT count(*) FROM pg_stat_activity'
            );

            const sizeResult = await client.query(`
              SELECT pg_size_pretty(pg_database_size(current_database())) as size
            `);

            snapshot.state.postgresql = {
              tables: (tablesResult.rows as PostgreSQLTableResult[]).map(
                (r) => r.table_name
              ),
              sequences: (
                sequencesResult.rows as PostgreSQLSequenceResult[]
              ).map((r) => r.sequence_name),
              activeConnections: parseInt(connectionsResult.rows[0].count),
              databaseSize: sizeResult.rows[0].size,
            };
          } finally {
            client.release();
          }
          break;
        }
        case 'mongodb': {
          const mongoConn = connection as any;
          const mongoCollections = await mongoConn.database
            .listCollections()
            .toArray();
          const dbStats = await mongoConn.database.stats();
          const currentOps = await mongoConn.database
            .admin()
            .command({ currentOp: true });

          snapshot.state.mongodb = {
            collections: (mongoCollections as MongoDBCollectionResult[]).map(
              (c) => c.name
            ),
            databaseSize: dbStats.dataSize,
            activeOperations: currentOps.inprog?.length || 0,
          };
          break;
        }
        case 'redis': {
          const redisConn = connection as any;
          const keyCount = await redisConn.client.dbsize();
          const info = await redisConn.client.info();

          snapshot.state.redis = {
            keyCount,
            memoryUsage: this.parseRedisInfo(info, 'used_memory_human'),
            connectedClients: parseInt(
              this.parseRedisInfo(info, 'connected_clients')
            ),
          };
          break;
        }
        case 'qdrant': {
          const qdrantConn = connection as any;
          const collectionsResponse = await qdrantConn.client.getCollections();
          const qdrantCollections = collectionsResponse.collections || [];

          let totalPoints = 0;
          for (const collection of qdrantCollections) {
            const collectionInfo = await qdrantConn.client.getCollection(
              collection.name
            );
            totalPoints += collectionInfo.points_count || 0;
          }

          snapshot.state.qdrant = {
            collections: (qdrantCollections as QdrantCollectionResult[]).map(
              (c) => c.name
            ),
            totalPoints,
            memoryUsage: 'N/A', // Qdrant doesn't provide memory usage via API
          };
          break;
        }
      }
    } catch (error) {
      // Snapshot failed, but we'll return what we have
      console.warn(`Failed to take ${database} snapshot: ${error}`);
    }

    return snapshot;
  }

  /**
   * Generate comprehensive debug report
   */
  async generateDebugReport(context: DebugContext): Promise<DebugReport> {
    const connectionDiagnostics = await this.diagnoseConnections(
      context.databases
    );
    const databaseSnapshots = await this.takeDatabaseSnapshots(
      context.databases
    );

    let verificationReport: VerificationReport | undefined;
    try {
      verificationReport = await this.verifier.verifyCleanup(context.databases);
    } catch (error) {
      console.warn(`Verification failed during debug: ${error}`);
    }

    const recommendations = this.generateRecommendations(
      context,
      connectionDiagnostics,
      databaseSnapshots,
      verificationReport
    );

    const summary = this.generateSummary(
      context,
      connectionDiagnostics,
      verificationReport
    );

    return {
      context,
      connectionDiagnostics,
      databaseSnapshots,
      verificationReport,
      recommendations,
      summary,
    };
  }

  private generateRecommendations(
    context: DebugContext,
    diagnostics: ConnectionDiagnostics[],
    snapshots: DatabaseStateSnapshot[],
    verification?: VerificationReport
  ): string[] {
    const recommendations: string[] = [];

    // Connection issues
    const failedConnections = diagnostics.filter((d) => !d.connected);
    if (failedConnections.length > 0) {
      recommendations.push(
        `Fix connection issues for: ${failedConnections
          .map((d) => d.database)
          .join(', ')}`
      );
    }

    // Slow connections
    const slowConnections = diagnostics.filter((d) => d.responseTime > 1000);
    if (slowConnections.length > 0) {
      recommendations.push(
        `Optimize slow connections for: ${slowConnections
          .map((d) => d.database)
          .join(', ')}`
      );
    }

    // Database-specific recommendations
    snapshots.forEach((snapshot) => {
      if (snapshot.state.postgresql) {
        const pg = snapshot.state.postgresql;
        if (pg.tables.length > 50) {
          recommendations.push(
            `PostgreSQL has ${pg.tables.length} tables - consider schema optimization`
          );
        }
        if (pg.activeConnections > 20) {
          recommendations.push(
            `PostgreSQL has ${pg.activeConnections} active connections - consider connection pooling`
          );
        }
      }

      if (snapshot.state.mongodb) {
        const mongo = snapshot.state.mongodb;
        if (mongo.collections.length > 20) {
          recommendations.push(
            `MongoDB has ${mongo.collections.length} collections - consider database organization`
          );
        }
        if (mongo.activeOperations > 10) {
          recommendations.push(
            `MongoDB has ${mongo.activeOperations} active operations - check for long-running queries`
          );
        }
      }

      if (snapshot.state.redis) {
        const redis = snapshot.state.redis;
        if (redis.keyCount > 10000) {
          recommendations.push(
            `Redis has ${redis.keyCount} keys - consider key management strategy`
          );
        }
      }
    });

    // Verification issues
    if (verification) {
      if (verification.criticalIssues > 0) {
        recommendations.push(
          `Address ${verification.criticalIssues} critical cleanup issues`
        );
      }
      if (verification.warningIssues > 0) {
        recommendations.push(
          `Review ${verification.warningIssues} cleanup warnings`
        );
      }
    }

    // Test-specific recommendations
    if (context.error) {
      recommendations.push(
        `Test "${context.testName}" failed - check error details and database state`
      );
    }

    const duration = context.endTime
      ? context.endTime.getTime() - context.startTime.getTime()
      : 0;
    if (duration > 30000) {
      recommendations.push(
        `Test took ${duration}ms - consider optimizing test performance`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push(
        'No immediate issues detected - system appears healthy'
      );
    }

    return recommendations;
  }

  private generateSummary(
    context: DebugContext,
    diagnostics: ConnectionDiagnostics[],
    verification?: VerificationReport
  ): string {
    const duration = context.endTime
      ? context.endTime.getTime() - context.startTime.getTime()
      : 0;
    const connectedDbs = diagnostics.filter((d) => d.connected).length;
    const totalDbs = diagnostics.length;

    let summary = `Test "${context.testName}" executed in ${duration}ms. `;
    summary += `Database connections: ${connectedDbs}/${totalDbs} healthy. `;

    if (context.error) {
      summary += `Test failed with error: ${context.error.message}. `;
    } else {
      summary += `Test completed successfully. `;
    }

    if (verification) {
      summary += `Verification found ${verification.totalIssues} issues `;
      summary += `(${verification.criticalIssues} critical, ${verification.warningIssues} warnings).`;
    }

    return summary;
  }

  /**
   * Export debug report to file
   */
  async exportDebugReport(
    report: DebugReport,
    format: 'json' | 'html' | 'text' = 'json'
  ): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `debug-report-${report.context.testName}-${timestamp}.${format}`;

    let content: string;

    switch (format) {
      case 'json':
        content = JSON.stringify(report, null, 2);
        break;
      case 'html':
        content = await this.generateHtmlReport(report);
        break;
      case 'text':
        content = await this.generateTextReport(report);
        break;
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    const fs = await import('fs');
    const path = await import('path');

    const debugDir = './debug-reports';
    await fs.promises.mkdir(debugDir, { recursive: true });

    const filePath = path.join(debugDir, filename);
    await fs.promises.writeFile(filePath, content, 'utf8');

    return filePath;
  }

  private async generateHtmlReport(report: DebugReport): Promise<string> {
    return `
<!DOCTYPE html>
<html>
<head>
    <title>Debug Report - ${report.context.testName}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .section { margin: 20px 0; padding: 15px; border: 1px solid #ddd; border-radius: 5px; }
        .error { color: red; }
        .warning { color: orange; }
        .success { color: green; }
        .code { background: #f5f5f5; padding: 10px; border-radius: 3px; font-family: monospace; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <h1>Debug Report</h1>
    <div class="section">
        <h2>Test Context</h2>
        <p><strong>Test:</strong> ${report.context.testName}</p>
        <p><strong>File:</strong> ${report.context.testFile}</p>
        <p><strong>Duration:</strong> ${
          report.context.endTime
            ? report.context.endTime.getTime() -
              report.context.startTime.getTime()
            : 'N/A'
        }ms</p>
        ${
          report.context.error
            ? `<p class="error"><strong>Error:</strong> ${report.context.error.message}</p>`
            : ''
        }
    </div>
    
    <div class="section">
        <h2>Summary</h2>
        <p>${report.summary}</p>
    </div>
    
    <div class="section">
        <h2>Connection Diagnostics</h2>
        <table>
            <tr><th>Database</th><th>Connected</th><th>Response Time</th><th>Error</th></tr>
            ${report.connectionDiagnostics
              .map(
                (d) => `
                <tr>
                    <td>${d.database}</td>
                    <td class="${d.connected ? 'success' : 'error'}">${
                  d.connected ? 'Yes' : 'No'
                }</td>
                    <td>${d.responseTime}ms</td>
                    <td class="error">${d.errorMessage || 'None'}</td>
                </tr>
            `
              )
              .join('')}
        </table>
    </div>
    
    <div class="section">
        <h2>Recommendations</h2>
        <ul>
            ${report.recommendations.map((r) => `<li>${r}</li>`).join('')}
        </ul>
    </div>
</body>
</html>`;
  }

  private async generateTextReport(report: DebugReport): Promise<string> {
    const duration = report.context.endTime
      ? report.context.endTime.getTime() - report.context.startTime.getTime()
      : 0;

    return `
DEBUG REPORT
============

Test Context:
- Test: ${report.context.testName}
- File: ${report.context.testFile}
- Duration: ${duration}ms
- Error: ${report.context.error?.message || 'None'}

Summary:
${report.summary}

Connection Diagnostics:
${report.connectionDiagnostics
  .map(
    (d) =>
      `- ${d.database}: ${d.connected ? 'Connected' : 'Failed'} (${
        d.responseTime
      }ms)${d.errorMessage ? ` - ${d.errorMessage}` : ''}`
  )
  .join('\n')}

Recommendations:
${report.recommendations.map((r) => `- ${r}`).join('\n')}

Generated: ${new Date().toISOString()}
`;
  }

  private parseRedisInfo(info: string, key: string): string {
    const lines = info.split('\n');
    for (const line of lines) {
      const [k, v] = line.split(':');
      if (k === key) {
        return v?.trim() || '';
      }
    }
    return '';
  }

  /**
   * Clear debug history
   */
  clearHistory(): void {
    this.debugHistory = [];
  }

  /**
   * Get debug history
   */
  getHistory(): DebugContext[] {
    return [...this.debugHistory];
  }
}

/**
 * Global debug utilities
 */
export class DebugUtils {
  private static _debugger: DatabaseDebugger;

  static get debugger(): DatabaseDebugger {
    return DebugUtils._debugger;
  }

  static initialize(connections: DatabaseConnections): void {
    DebugUtils._debugger = new DatabaseDebugger(connections);
  }

  static createContext(
    testName: string,
    testFile: string,
    databases?: string[]
  ): DebugContext {
    return DebugUtils._debugger.createDebugContext(
      testName,
      testFile,
      databases
    );
  }

  static async diagnoseConnections(
    databases?: string[]
  ): Promise<ConnectionDiagnostics[]> {
    return DebugUtils._debugger.diagnoseConnections(databases);
  }

  static async takeDatabaseSnapshots(
    databases?: string[]
  ): Promise<DatabaseStateSnapshot[]> {
    return DebugUtils._debugger.takeDatabaseSnapshots(databases);
  }

  static async generateDebugReport(
    context: DebugContext
  ): Promise<DebugReport> {
    return DebugUtils._debugger.generateDebugReport(context);
  }

  static async exportDebugReport(
    report: DebugReport,
    format?: 'json' | 'html' | 'text'
  ): Promise<string> {
    return DebugUtils._debugger.exportDebugReport(report, format);
  }

  static getInstance(): DatabaseDebugger {
    return DebugUtils._debugger;
  }
}

/**
 * Debug decorator for test functions
 */
export function debugTest(testName?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const context = DebugUtils.createContext(
        testName || propertyKey,
        target.constructor.name
      );

      try {
        const result = await originalMethod.apply(this, args);
        DebugUtils.debugger.completeDebugContext(context);
        return result;
      } catch (error) {
        DebugUtils.debugger.completeDebugContext(context, error as Error);
        const report = await DebugUtils.generateDebugReport(context);
        await DebugUtils.exportDebugReport(report, 'json');
        throw error;
      }
    };
  };
}
