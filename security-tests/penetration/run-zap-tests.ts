#!/usr/bin/env tsx

/**
 * OWASP ZAP Test Runner for CI/CD Pipeline
 * Runs automated penetration tests using OWASP ZAP
 */

import { OWASPZAPAutomation, defaultScanTargets, ScanTarget } from './owasp-zap-automation';
import { promises as fs } from 'fs';
import * as path from 'path';

interface TestConfig {
  zapPath?: string;
  zapPort?: number;
  targetBaseUrl?: string;
  timeout?: number;
  securityLevel?: 'minimal' | 'standard' | 'comprehensive';
}

class ZAPTestRunner {
  private config: TestConfig;
  private zapAutomation: OWASPZAPAutomation;

  constructor(config: TestConfig = {}) {
    this.config = {
      zapPath: process.env.ZAP_PATH || config.zapPath,
      zapPort: parseInt(process.env.ZAP_PORT || '8080'),
      targetBaseUrl: process.env.TARGET_BASE_URL || config.targetBaseUrl || 'http://localhost:3000',
      timeout: parseInt(process.env.ZAP_TIMEOUT || '300000'),
      securityLevel: (process.env.SECURITY_LEVEL as any) || config.securityLevel || 'standard',
    };

    this.zapAutomation = new OWASPZAPAutomation({
      zapPath: this.config.zapPath,
      zapPort: this.config.zapPort,
      timeout: this.config.timeout,
      headless: true,
    });
  }

  /**
   * Get scan targets based on security level
   */
  private getScanTargets(): ScanTarget[] {
    const baseUrl = this.config.targetBaseUrl!;
    
    const targets: ScanTarget[] = [
      {
        name: 'api-gateway',
        url: baseUrl,
      },
      {
        name: 'health-endpoints',
        url: `${baseUrl}/health`,
      },
    ];

    if (this.config.securityLevel === 'standard' || this.config.securityLevel === 'comprehensive') {
      targets.push(
        {
          name: 'auth-endpoints',
          url: `${baseUrl}/auth`,
          authentication: {
            method: 'form',
            loginUrl: `${baseUrl}/auth/login`,
            usernameField: 'email',
            passwordField: 'password',
            username: 'test@example.com',
            password: 'TestPassword123!',
          },
        },
        {
          name: 'api-endpoints',
          url: `${baseUrl}/api`,
        }
      );
    }

    if (this.config.securityLevel === 'comprehensive') {
      targets.push(
        {
          name: 'user-service-direct',
          url: 'http://localhost:3001',
        },
        {
          name: 'admin-endpoints',
          url: `${baseUrl}/admin`,
          context: 'admin-context',
          authentication: {
            method: 'form',
            loginUrl: `${baseUrl}/auth/login`,
            usernameField: 'email',
            passwordField: 'password',
            username: 'admin@example.com',
            password: 'AdminPassword123!',
          },
        }
      );
    }

    return targets;
  }

  /**
   * Run penetration tests
   */
  async runTests(): Promise<void> {
    console.log('🚀 Starting OWASP ZAP penetration testing...');
    console.log(`Security Level: ${this.config.securityLevel}`);
    console.log(`Target Base URL: ${this.config.targetBaseUrl}`);

    try {
      const targets = this.getScanTargets();
      console.log(`Running penetration tests on ${targets.length} targets:`);
      targets.forEach(target => console.log(`  - ${target.name}: ${target.url}`));

      const results = await this.zapAutomation.runSecurityTestSuite(targets);
      
      // Generate comprehensive report
      await this.generateComprehensiveReport(results);
      
      // Check for critical vulnerabilities
      const criticalIssues = this.checkForCriticalIssues(results);
      
      if (criticalIssues.length > 0) {
        console.error(`❌ Critical security vulnerabilities found:`);
        criticalIssues.forEach(issue => console.error(`  - ${issue}`));
        process.exit(1);
      } else {
        console.log('✅ Penetration testing completed successfully');
        console.log('📊 Check security-reports/penetration/ for detailed reports');
      }

    } catch (error: any) {
      console.error('❌ Penetration testing failed:', error.message);
      process.exit(1);
    }
  }

  /**
   * Generate comprehensive report from all scan results
   */
  private async generateComprehensiveReport(results: any[]): Promise<void> {
    const reportsDir = path.join(process.cwd(), 'security-reports', 'penetration');
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `comprehensive-pentest-report-${timestamp}.md`);

    const totalAlerts = results.reduce((sum, result) => sum + result.summary.total, 0);
    const highRiskAlerts = results.reduce((sum, result) => sum + result.summary.high, 0);
    const mediumRiskAlerts = results.reduce((sum, result) => sum + result.summary.medium, 0);
    const lowRiskAlerts = results.reduce((sum, result) => sum + result.summary.low, 0);

    let report = `# OWASP ZAP Penetration Testing Report\n\n`;
    report += `**Test Date:** ${new Date().toISOString()}\n`;
    report += `**Security Level:** ${this.config.securityLevel}\n`;
    report += `**Target Base URL:** ${this.config.targetBaseUrl}\n`;
    report += `**Targets Scanned:** ${results.length}\n\n`;

    report += `## Executive Summary\n\n`;
    report += `- **Total Vulnerabilities:** ${totalAlerts}\n`;
    report += `- **High Risk:** ${highRiskAlerts} 🔴\n`;
    report += `- **Medium Risk:** ${mediumRiskAlerts} 🟡\n`;
    report += `- **Low Risk:** ${lowRiskAlerts} 🟢\n\n`;

    if (highRiskAlerts > 0) {
      report += `⚠️ **CRITICAL**: ${highRiskAlerts} high-risk vulnerabilities require immediate attention.\n\n`;
    }

    report += `## Scan Results by Target\n\n`;

    for (const result of results) {
      report += `### ${result.target}\n\n`;
      report += `- **Status:** ${result.status}\n`;
      report += `- **Scan Time:** ${(result.scanTime / 1000).toFixed(1)}s\n`;
      report += `- **Vulnerabilities:** ${result.summary.total}\n`;
      report += `  - High: ${result.summary.high}\n`;
      report += `  - Medium: ${result.summary.medium}\n`;
      report += `  - Low: ${result.summary.low}\n`;
      report += `  - Informational: ${result.summary.informational}\n\n`;

      if (result.alerts && result.alerts.length > 0) {
        const highRiskAlerts = result.alerts.filter((alert: any) => alert.risk === 'High');
        if (highRiskAlerts.length > 0) {
          report += `#### High Risk Vulnerabilities:\n\n`;
          highRiskAlerts.forEach((alert: any) => {
            report += `- **${alert.alert}** (${alert.confidence} confidence)\n`;
            report += `  - Description: ${alert.description.substring(0, 200)}...\n`;
            report += `  - Solution: ${alert.solution.substring(0, 200)}...\n\n`;
          });
        }
      }

      report += `---\n\n`;
    }

    report += `## Recommendations\n\n`;
    
    if (highRiskAlerts > 0) {
      report += `1. **IMMEDIATE ACTION REQUIRED**: Address all ${highRiskAlerts} high-risk vulnerabilities before deployment\n`;
    }
    
    if (mediumRiskAlerts > 0) {
      report += `2. Review and remediate ${mediumRiskAlerts} medium-risk vulnerabilities\n`;
    }
    
    report += `3. Implement security headers (CSP, HSTS, X-Frame-Options)\n`;
    report += `4. Ensure all input validation is properly implemented\n`;
    report += `5. Regular security scanning should be part of CI/CD pipeline\n`;
    report += `6. Consider implementing Web Application Firewall (WAF)\n\n`;

    report += `## Next Steps\n\n`;
    report += `- Review detailed reports in security-reports/penetration/\n`;
    report += `- Address high and medium risk vulnerabilities\n`;
    report += `- Re-run security scans after fixes\n`;
    report += `- Update security policies and procedures as needed\n\n`;

    report += `---\n`;
    report += `*Report generated by OWASP ZAP Automation on ${new Date().toISOString()}*\n`;

    await fs.writeFile(reportPath, report);
    console.log(`📄 Comprehensive report generated: ${reportPath}`);

    // Also create a JSON summary for CI/CD processing
    const jsonSummary = {
      timestamp: new Date().toISOString(),
      securityLevel: this.config.securityLevel,
      targetBaseUrl: this.config.targetBaseUrl,
      totalTargets: results.length,
      summary: {
        total: totalAlerts,
        high: highRiskAlerts,
        medium: mediumRiskAlerts,
        low: lowRiskAlerts,
        informational: results.reduce((sum, result) => sum + result.summary.informational, 0),
      },
      results: results.map(result => ({
        target: result.target,
        status: result.status,
        scanTime: result.scanTime,
        summary: result.summary,
      })),
      criticalIssues: this.checkForCriticalIssues(results),
    };

    const jsonPath = path.join(reportsDir, `pentest-summary-${timestamp}.json`);
    await fs.writeFile(jsonPath, JSON.stringify(jsonSummary, null, 2));
    console.log(`📊 JSON summary generated: ${jsonPath}`);
  }

  /**
   * Check for critical security issues that should fail the build
   */
  private checkForCriticalIssues(results: any[]): string[] {
    const issues: string[] = [];

    for (const result of results) {
      if (result.status === 'failed') {
        issues.push(`Scan failed for target: ${result.target}`);
        continue;
      }

      if (result.summary.high > 0) {
        issues.push(`${result.summary.high} high-risk vulnerabilities found in ${result.target}`);
      }

      // Check for specific critical vulnerability types
      if (result.alerts) {
        const criticalAlertTypes = [
          'SQL Injection',
          'Remote Code Execution',
          'Path Traversal',
          'Cross Site Scripting (Stored)',
          'Authentication Bypass',
          'Session Fixation',
        ];

        result.alerts.forEach((alert: any) => {
          if (criticalAlertTypes.some(criticalType => alert.alert.includes(criticalType))) {
            issues.push(`Critical vulnerability: ${alert.alert} in ${result.target}`);
          }
        });
      }
    }

    return issues;
  }
}

// Main execution
async function main() {
  const runner = new ZAPTestRunner();
  await runner.runTests();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { ZAPTestRunner };