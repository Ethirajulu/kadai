import { CleanupVerifier, VerificationReporter, generateVerificationReport } from './index';
import { DatabaseConnections } from '../../types/database';

/**
 * Example usage of the enhanced cleanup verification system
 */
export class VerificationExample {
  private verifier: CleanupVerifier;
  private reporter: VerificationReporter;

  constructor(connections: DatabaseConnections) {
    // Initialize verifier with custom configuration
    this.verifier = new CleanupVerifier(connections, {
      strictMode: true,
      checkConstraints: true,
      validateIndexes: true,
      checkSequences: true,
      verifyConnections: true,
      timeoutMs: 30000,
      includeSystemTables: false,
      deepScan: true,
      parallelVerification: true,
      customValidators: [],
    });

    this.reporter = new VerificationReporter();
  }

  /**
   * Example: Basic verification with console output
   */
  async basicVerification(): Promise<void> {
    console.log('🔍 Starting basic verification...\n');

    // Perform verification
    const report = await this.verifier.verifyCleanup();

    // Generate console report
    const consoleReport = await this.reporter.generateReport(report, {
      format: 'console',
      includeDetails: true,
      includeMetrics: true,
      includeRecommendations: true,
    });

    console.log(consoleReport);
  }

  /**
   * Example: Verification with multiple report formats
   */
  async multiFormatVerification(): Promise<void> {
    console.log('📊 Generating multi-format verification reports...\n');

    const report = await this.verifier.verifyCleanup();

    // Generate different report formats
    const formats = ['console', 'json', 'markdown', 'html'] as const;

    for (const format of formats) {
      const reportContent = await this.reporter.generateReport(report, {
        format,
        includeDetails: true,
        includeMetrics: true,
        includeRecommendations: true,
        outputFile: `./verification-report.${format === 'console' ? 'txt' : format}`,
      });

      console.log(`✅ Generated ${format} report`);
    }
  }

  /**
   * Example: Verification with custom validators
   */
  async verificationWithCustomValidators(): Promise<void> {
    console.log('🔧 Running verification with custom validators...\n');

    // Add custom PostgreSQL validator
    this.verifier.addCustomValidator({
      name: 'table_count_validator',
      database: 'postgresql',
      validator: async (connection) => {
        const result = await connection.pool.query(`
          SELECT count(*) as table_count 
          FROM information_schema.tables 
          WHERE table_schema = 'public'
        `);
        
        const tableCount = parseInt(result.rows[0].table_count);
        
        if (tableCount > 50) {
          return [{
            type: 'performance_degradation' as const,
            severity: 'warning' as const,
            location: 'public schema',
            description: `High table count: ${tableCount} tables`,
            suggestion: 'Consider database schema optimization',
          }];
        }
        
        return [];
      },
    });

    // Add custom MongoDB validator
    this.verifier.addCustomValidator({
      name: 'collection_size_validator',
      database: 'mongodb',
      validator: async (connection) => {
        const collections = await connection.database.listCollections().toArray();
        const issues = [];
        
        for (const collection of collections) {
          const stats = await connection.database.collection(collection.name).stats();
          
          if (stats.size > 10 * 1024 * 1024) { // 10MB threshold
            issues.push({
              type: 'data_remaining' as const,
              severity: 'warning' as const,
              location: `collection: ${collection.name}`,
              description: `Large collection size: ${Math.round(stats.size / 1024 / 1024)}MB`,
              suggestion: 'Consider collection cleanup or archiving',
            });
          }
        }
        
        return issues;
      },
    });

    // Run verification
    const report = await this.verifier.verifyCleanup();

    // Generate detailed report
    const detailedReport = await this.reporter.generateReport(report, {
      format: 'markdown',
      includeDetails: true,
      includeMetrics: true,
      includeRecommendations: true,
      sortBySeverity: true,
    });

    console.log(detailedReport);
  }

  /**
   * Example: Targeted verification for specific databases
   */
  async targetedVerification(): Promise<void> {
    console.log('🎯 Running targeted verification...\n');

    // Verify only specific databases
    const report = await this.verifier.verifyCleanup(['postgresql', 'mongodb']);

    // Generate focused report
    const focusedReport = await this.reporter.generateReport(report, {
      format: 'console',
      includeDetails: true,
      includeMetrics: true,
      includeRecommendations: true,
      groupByDatabase: true,
      sortBySeverity: true,
    });

    console.log(focusedReport);
  }

  /**
   * Example: Verification metrics tracking
   */
  async metricsTracking(): Promise<void> {
    console.log('📈 Tracking verification metrics...\n');

    // Run multiple verifications
    for (let i = 0; i < 5; i++) {
      await this.verifier.verifyCleanup();
      console.log(`Completed verification ${i + 1}/5`);
    }

    // Get accumulated metrics
    const metrics = this.verifier.getMetrics();
    
    console.log('\n📊 Verification Metrics:');
    console.log(`Total Verifications: ${metrics.verificationCount}`);
    console.log(`Average Verification Time: ${metrics.averageVerificationTime.toFixed(2)}ms`);
    console.log(`Success Rate: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`Common Issues:`, metrics.commonIssues);
    console.log(`Database Performance:`, metrics.databasePerformance);
  }

  /**
   * Example: JUnit report generation for CI/CD
   */
  async junitReportGeneration(): Promise<void> {
    console.log('🚀 Generating JUnit report for CI/CD...\n');

    const report = await this.verifier.verifyCleanup();

    // Generate JUnit XML report
    const junitReport = await this.reporter.generateReport(report, {
      format: 'junit',
      includeDetails: true,
      outputFile: './verification-junit.xml',
    });

    console.log('✅ JUnit report generated for CI/CD integration');
    console.log(`Report status: ${report.overallStatus}`);
    console.log(`Critical issues: ${report.criticalIssues}`);
    console.log(`Total issues: ${report.totalIssues}`);
  }

  /**
   * Example: Comprehensive verification workflow
   */
  async comprehensiveWorkflow(): Promise<void> {
    console.log('🔄 Running comprehensive verification workflow...\n');

    try {
      // 1. Run basic verification
      console.log('Step 1: Basic verification');
      let report = await this.verifier.verifyCleanup();
      
      if (report.criticalIssues > 0) {
        console.log('❌ Critical issues found. Manual intervention required.');
        
        // Generate detailed HTML report for investigation
        await generateVerificationReport(report, {
          format: 'html',
          includeDetails: true,
          includeMetrics: true,
          includeRecommendations: true,
          outputFile: './critical-issues-report.html',
        });
        
        return;
      }

      // 2. Run deep scan if basic verification passes
      console.log('Step 2: Deep scan verification');
      this.verifier = new CleanupVerifier(this.verifier['connections'], {
        strictMode: true,
        deepScan: true,
        checkConstraints: true,
        validateIndexes: true,
        checkSequences: true,
        parallelVerification: true,
      });

      report = await this.verifier.verifyCleanup();

      // 3. Generate comprehensive report
      console.log('Step 3: Generating comprehensive report');
      const comprehensiveReport = await this.reporter.generateReport(report, {
        format: 'markdown',
        includeDetails: true,
        includeMetrics: true,
        includeRecommendations: true,
        sortBySeverity: true,
        groupByDatabase: true,
        outputFile: './comprehensive-verification-report.md',
      });

      // 4. Track metrics
      console.log('Step 4: Tracking metrics');
      const metrics = this.verifier.getMetrics();
      console.log(`Verification completed in ${report.verificationTime}ms`);
      console.log(`Success rate: ${(metrics.successRate * 100).toFixed(1)}%`);

      // 5. Generate CI/CD report
      console.log('Step 5: Generating CI/CD report');
      await this.reporter.generateReport(report, {
        format: 'junit',
        outputFile: './verification-results.xml',
      });

      console.log('✅ Comprehensive verification workflow completed successfully');

    } catch (error) {
      console.error('❌ Verification workflow failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Reset metrics if needed
    this.verifier.resetMetrics();
    console.log('🧹 Verification resources cleaned up');
  }
}

/**
 * Example usage function
 */
export async function runVerificationExamples(connections: DatabaseConnections): Promise<void> {
  const example = new VerificationExample(connections);

  try {
    // Run different verification examples
    await example.basicVerification();
    await example.multiFormatVerification();
    await example.verificationWithCustomValidators();
    await example.targetedVerification();
    await example.metricsTracking();
    await example.junitReportGeneration();
    await example.comprehensiveWorkflow();
    
  } finally {
    await example.cleanup();
  }
}

/**
 * Quick verification utility function
 */
export async function quickVerification(
  connections: DatabaseConnections,
  options: {
    databases?: string[];
    format?: 'console' | 'json' | 'markdown' | 'html';
    strict?: boolean;
    outputFile?: string;
  } = {}
): Promise<string> {
  const verifier = new CleanupVerifier(connections, {
    strictMode: options.strict ?? false,
    parallelVerification: true,
    deepScan: false,
  });

  const report = await verifier.verifyCleanup(options.databases);

  return await generateVerificationReport(report, {
    format: options.format ?? 'console',
    includeDetails: true,
    includeMetrics: true,
    includeRecommendations: true,
    outputFile: options.outputFile,
  });
}