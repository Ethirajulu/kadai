#!/usr/bin/env tsx

/**
 * Comprehensive Security Report Generator
 * Aggregates all security scan results into a comprehensive report
 */

import { promises as fs } from 'fs';
import * as path from 'path';

interface SecurityMetrics {
  dependencies: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    scannedPackages: number;
  };
  codeAnalysis: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    filesScanned: number;
  };
  secrets: {
    detected: number;
    types: string[];
    filesAffected: number;
  };
  penetrationTests: {
    total: number;
    critical: number;
    high: number;
    medium: number;
    low: number;
    targetsScanned: number;
  };
  coverage: {
    security: number;
    overall: number;
  };
}

class SecurityReportGenerator {
  private artifactsDir: string;
  private reportsDir: string;
  private metrics: SecurityMetrics;

  constructor() {
    this.artifactsDir = process.env.SECURITY_ARTIFACTS_DIR || './security-artifacts';
    this.reportsDir = path.join(process.cwd(), 'security-reports');
    this.metrics = this.initializeMetrics();
  }

  private initializeMetrics(): SecurityMetrics {
    return {
      dependencies: { total: 0, critical: 0, high: 0, medium: 0, low: 0, scannedPackages: 0 },
      codeAnalysis: { total: 0, critical: 0, high: 0, medium: 0, low: 0, filesScanned: 0 },
      secrets: { detected: 0, types: [], filesAffected: 0 },
      penetrationTests: { total: 0, critical: 0, high: 0, medium: 0, low: 0, targetsScanned: 0 },
      coverage: { security: 0, overall: 0 }
    };
  }

  /**
   * Generate comprehensive security report
   */
  async generate(): Promise<void> {
    console.log('📊 Generating comprehensive security report...');

    try {
      await fs.mkdir(this.reportsDir, { recursive: true });

      // Collect metrics from all security scans
      await this.collectDependencyMetrics();
      await this.collectCodeAnalysisMetrics();
      await this.collectSecretScanMetrics();
      await this.collectPenetrationTestMetrics();
      await this.collectCoverageMetrics();

      // Generate reports
      await this.generateMarkdownReport();
      await this.generateJsonDashboard();
      await this.generateExecutiveSummary();

      console.log('✅ Security report generation completed');
      console.log(`📁 Reports available in: ${this.reportsDir}`);

    } catch (error: any) {
      console.error('❌ Error generating security report:', error.message);
      throw error;
    }
  }

  /**
   * Collect dependency vulnerability metrics
   */
  private async collectDependencyMetrics(): Promise<void> {
    console.log('📦 Collecting dependency metrics...');

    try {
      // Snyk dependencies
      const snykDepsPath = path.join(this.artifactsDir, 'dependency-scan-reports', 'snyk-deps.json');
      if (await this.fileExists(snykDepsPath)) {
        const snykData = JSON.parse(await fs.readFile(snykDepsPath, 'utf8'));
        if (snykData.vulnerabilities) {
          snykData.vulnerabilities.forEach((vuln: any) => {
            this.metrics.dependencies.total++;
            switch (vuln.severity) {
              case 'critical': this.metrics.dependencies.critical++; break;
              case 'high': this.metrics.dependencies.high++; break;
              case 'medium': this.metrics.dependencies.medium++; break;
              case 'low': this.metrics.dependencies.low++; break;
            }
          });
        }
        if (snykData.dependencyCount) {
          this.metrics.dependencies.scannedPackages = snykData.dependencyCount;
        }
      }

      // npm audit
      const npmAuditPath = path.join(this.artifactsDir, 'dependency-scan-reports', 'npm-audit.json');
      if (await this.fileExists(npmAuditPath)) {
        const auditData = JSON.parse(await fs.readFile(npmAuditPath, 'utf8'));
        if (auditData.metadata && auditData.metadata.dependencies) {
          this.metrics.dependencies.scannedPackages = Math.max(
            this.metrics.dependencies.scannedPackages,
            auditData.metadata.dependencies.total || 0
          );
        }
      }

      // Python Safety
      const safetyPath = path.join(this.artifactsDir, 'dependency-scan-reports', 'safety-report.json');
      if (await this.fileExists(safetyPath)) {
        const safetyData = JSON.parse(await fs.readFile(safetyPath, 'utf8'));
        if (Array.isArray(safetyData)) {
          safetyData.forEach(() => {
            this.metrics.dependencies.total++;
            this.metrics.dependencies.high++; // Safety reports all as high
          });
        }
      }

    } catch (error: any) {
      console.warn('Warning: Could not collect dependency metrics:', error.message);
    }
  }

  /**
   * Collect code analysis metrics
   */
  private async collectCodeAnalysisMetrics(): Promise<void> {
    console.log('🔍 Collecting code analysis metrics...');

    try {
      // Snyk Code
      const snykCodePath = path.join(this.artifactsDir, 'code-analysis-reports', 'snyk-code.json');
      if (await this.fileExists(snykCodePath)) {
        const snykData = JSON.parse(await fs.readFile(snykCodePath, 'utf8'));
        if (snykData.runs && snykData.runs[0] && snykData.runs[0].results) {
          snykData.runs[0].results.forEach((result: any) => {
            this.metrics.codeAnalysis.total++;
            const severity = result.level || 'info';
            switch (severity) {
              case 'error': this.metrics.codeAnalysis.critical++; break;
              case 'warning': this.metrics.codeAnalysis.high++; break;
              case 'note': this.metrics.codeAnalysis.medium++; break;
              default: this.metrics.codeAnalysis.low++; break;
            }
          });
        }
      }

      // Semgrep
      const semgrepPath = path.join(this.artifactsDir, 'code-analysis-reports', 'semgrep-results.json');
      if (await this.fileExists(semgrepPath)) {
        const semgrepData = JSON.parse(await fs.readFile(semgrepPath, 'utf8'));
        if (semgrepData.results) {
          const filesScanned = new Set();
          semgrepData.results.forEach((result: any) => {
            this.metrics.codeAnalysis.total++;
            filesScanned.add(result.path);
            
            if (result.extra && result.extra.severity) {
              switch (result.extra.severity) {
                case 'ERROR': this.metrics.codeAnalysis.critical++; break;
                case 'WARNING': this.metrics.codeAnalysis.high++; break;
                case 'INFO': this.metrics.codeAnalysis.medium++; break;
                default: this.metrics.codeAnalysis.low++; break;
              }
            }
          });
          this.metrics.codeAnalysis.filesScanned = filesScanned.size;
        }
      }

      // Bandit
      const banditPath = path.join(this.artifactsDir, 'code-analysis-reports', 'bandit-results.json');
      if (await this.fileExists(banditPath)) {
        const banditData = JSON.parse(await fs.readFile(banditPath, 'utf8'));
        if (banditData.results) {
          banditData.results.forEach((result: any) => {
            this.metrics.codeAnalysis.total++;
            switch (result.issue_severity) {
              case 'HIGH': this.metrics.codeAnalysis.high++; break;
              case 'MEDIUM': this.metrics.codeAnalysis.medium++; break;
              case 'LOW': this.metrics.codeAnalysis.low++; break;
            }
          });
        }
      }

    } catch (error: any) {
      console.warn('Warning: Could not collect code analysis metrics:', error.message);
    }
  }

  /**
   * Collect secret scanning metrics
   */
  private async collectSecretScanMetrics(): Promise<void> {
    console.log('🔐 Collecting secret scanning metrics...');

    try {
      // Semgrep secrets
      const secretsPath = path.join(this.artifactsDir, 'secret-scan-reports', 'secrets-scan.json');
      if (await this.fileExists(secretsPath)) {
        const secretsData = JSON.parse(await fs.readFile(secretsPath, 'utf8'));
        if (secretsData.results) {
          const files = new Set();
          const types = new Set();
          
          secretsData.results.forEach((result: any) => {
            this.metrics.secrets.detected++;
            files.add(result.path);
            types.add(result.check_id);
          });
          
          this.metrics.secrets.filesAffected = files.size;
          this.metrics.secrets.types = Array.from(types) as string[];
        }
      }

      // GitLeaks
      const gitleaksPath = path.join(this.artifactsDir, 'secret-scan-reports', 'gitleaks-report.json');
      if (await this.fileExists(gitleaksPath)) {
        const gitleaksData = JSON.parse(await fs.readFile(gitleaksPath, 'utf8'));
        if (Array.isArray(gitleaksData)) {
          const files = new Set();
          const types = new Set();
          
          gitleaksData.forEach((result: any) => {
            this.metrics.secrets.detected++;
            files.add(result.File);
            types.add(result.RuleID);
          });
          
          this.metrics.secrets.filesAffected += files.size;
          this.metrics.secrets.types = [...this.metrics.secrets.types, ...Array.from(types) as string[]];
        }
      }

    } catch (error: any) {
      console.warn('Warning: Could not collect secret scanning metrics:', error.message);
    }
  }

  /**
   * Collect penetration test metrics
   */
  private async collectPenetrationTestMetrics(): Promise<void> {
    console.log('🎯 Collecting penetration test metrics...');

    try {
      const pentestDir = path.join(this.artifactsDir, 'penetration-test-reports');
      if (await this.directoryExists(pentestDir)) {
        const files = await fs.readdir(pentestDir);
        
        for (const file of files) {
          if (file.startsWith('pentest-summary-') && file.endsWith('.json')) {
            const reportPath = path.join(pentestDir, file);
            const reportData = JSON.parse(await fs.readFile(reportPath, 'utf8'));
            
            if (reportData.summary) {
              this.metrics.penetrationTests.total += reportData.summary.total || 0;
              this.metrics.penetrationTests.critical += reportData.summary.critical || 0;
              this.metrics.penetrationTests.high += reportData.summary.high || 0;
              this.metrics.penetrationTests.medium += reportData.summary.medium || 0;
              this.metrics.penetrationTests.low += reportData.summary.low || 0;
              this.metrics.penetrationTests.targetsScanned += reportData.totalTargets || 0;
            }
          }
        }
      }

    } catch (error: any) {
      console.warn('Warning: Could not collect penetration test metrics:', error.message);
    }
  }

  /**
   * Collect test coverage metrics
   */
  private async collectCoverageMetrics(): Promise<void> {
    console.log('📈 Collecting coverage metrics...');

    try {
      // Security test coverage
      const securityTestsDir = path.join(this.artifactsDir, 'security-test-reports');
      if (await this.directoryExists(securityTestsDir)) {
        const coverageJsonPath = path.join(securityTestsDir, 'coverage', 'coverage-summary.json');
        if (await this.fileExists(coverageJsonPath)) {
          const coverageData = JSON.parse(await fs.readFile(coverageJsonPath, 'utf8'));
          if (coverageData.total && coverageData.total.lines) {
            this.metrics.coverage.security = coverageData.total.lines.pct || 0;
          }
        }
      }

      // Overall test coverage (if available)
      const overallCoveragePath = path.join(process.cwd(), 'coverage', 'coverage-summary.json');
      if (await this.fileExists(overallCoveragePath)) {
        const coverageData = JSON.parse(await fs.readFile(overallCoveragePath, 'utf8'));
        if (coverageData.total && coverageData.total.lines) {
          this.metrics.coverage.overall = coverageData.total.lines.pct || 0;
        }
      }

    } catch (error: any) {
      console.warn('Warning: Could not collect coverage metrics:', error.message);
    }
  }

  /**
   * Generate comprehensive markdown report
   */
  private async generateMarkdownReport(): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(this.reportsDir, `comprehensive-report-${timestamp}.md`);

    const totalVulns = this.metrics.dependencies.total + 
                      this.metrics.codeAnalysis.total + 
                      this.metrics.penetrationTests.total;
    
    const totalCritical = this.metrics.dependencies.critical + 
                         this.metrics.codeAnalysis.critical + 
                         this.metrics.penetrationTests.critical;
    
    const totalHigh = this.metrics.dependencies.high + 
                     this.metrics.codeAnalysis.high + 
                     this.metrics.penetrationTests.high;

    let report = `# Comprehensive Security Report\n\n`;
    report += `**Generated:** ${new Date().toISOString()}\n`;
    report += `**Project:** Kadai AI Sales Assistant\n`;
    report += `**Branch:** ${process.env.GITHUB_REF_NAME || 'unknown'}\n`;
    report += `**Commit:** ${process.env.GITHUB_SHA || 'unknown'}\n\n`;

    // Executive Summary
    report += `## 📊 Executive Summary\n\n`;
    report += `| Metric | Count | Status |\n`;
    report += `|--------|-------|--------|\n`;
    report += `| Total Vulnerabilities | ${totalVulns} | ${totalVulns === 0 ? '✅' : totalCritical > 0 ? '🔴' : totalHigh > 0 ? '🟡' : '🟢'} |\n`;
    report += `| Critical Severity | ${totalCritical} | ${totalCritical === 0 ? '✅' : '🔴'} |\n`;
    report += `| High Severity | ${totalHigh} | ${totalHigh === 0 ? '✅' : '🟡'} |\n`;
    report += `| Secrets Detected | ${this.metrics.secrets.detected} | ${this.metrics.secrets.detected === 0 ? '✅' : '🔴'} |\n`;
    report += `| Security Test Coverage | ${this.metrics.coverage.security.toFixed(1)}% | ${this.metrics.coverage.security >= 80 ? '✅' : this.metrics.coverage.security >= 70 ? '🟡' : '🔴'} |\n\n`;

    // Risk Assessment
    if (totalCritical > 0) {
      report += `⚠️ **HIGH RISK**: ${totalCritical} critical vulnerabilities require immediate attention.\n\n`;
    } else if (totalHigh > 0) {
      report += `⚠️ **MEDIUM RISK**: ${totalHigh} high-severity issues should be addressed soon.\n\n`;
    } else if (this.metrics.secrets.detected > 0) {
      report += `⚠️ **HIGH RISK**: ${this.metrics.secrets.detected} secrets detected and must be removed.\n\n`;
    } else {
      report += `✅ **LOW RISK**: No critical vulnerabilities or secrets detected.\n\n`;
    }

    // Detailed Results
    report += `## 🔍 Detailed Security Analysis\n\n`;

    // Dependencies
    report += `### 📦 Dependency Vulnerabilities\n\n`;
    report += `- **Packages Scanned:** ${this.metrics.dependencies.scannedPackages}\n`;
    report += `- **Total Vulnerabilities:** ${this.metrics.dependencies.total}\n`;
    report += `- **Critical:** ${this.metrics.dependencies.critical}\n`;
    report += `- **High:** ${this.metrics.dependencies.high}\n`;
    report += `- **Medium:** ${this.metrics.dependencies.medium}\n`;
    report += `- **Low:** ${this.metrics.dependencies.low}\n\n`;

    // Code Analysis
    report += `### 🔍 Static Code Analysis\n\n`;
    report += `- **Files Scanned:** ${this.metrics.codeAnalysis.filesScanned}\n`;
    report += `- **Total Issues:** ${this.metrics.codeAnalysis.total}\n`;
    report += `- **Critical:** ${this.metrics.codeAnalysis.critical}\n`;
    report += `- **High:** ${this.metrics.codeAnalysis.high}\n`;
    report += `- **Medium:** ${this.metrics.codeAnalysis.medium}\n`;
    report += `- **Low:** ${this.metrics.codeAnalysis.low}\n\n`;

    // Secrets
    report += `### 🔐 Secret Detection\n\n`;
    report += `- **Secrets Detected:** ${this.metrics.secrets.detected}\n`;
    report += `- **Files Affected:** ${this.metrics.secrets.filesAffected}\n`;
    if (this.metrics.secrets.types.length > 0) {
      report += `- **Secret Types:** ${this.metrics.secrets.types.join(', ')}\n`;
    }
    report += `\n`;

    // Penetration Tests
    report += `### 🎯 Penetration Testing\n\n`;
    report += `- **Targets Scanned:** ${this.metrics.penetrationTests.targetsScanned}\n`;
    report += `- **Total Vulnerabilities:** ${this.metrics.penetrationTests.total}\n`;
    report += `- **Critical:** ${this.metrics.penetrationTests.critical}\n`;
    report += `- **High:** ${this.metrics.penetrationTests.high}\n`;
    report += `- **Medium:** ${this.metrics.penetrationTests.medium}\n`;
    report += `- **Low:** ${this.metrics.penetrationTests.low}\n\n`;

    // Test Coverage
    report += `### 📈 Test Coverage\n\n`;
    report += `- **Security Test Coverage:** ${this.metrics.coverage.security.toFixed(1)}%\n`;
    report += `- **Overall Test Coverage:** ${this.metrics.coverage.overall.toFixed(1)}%\n\n`;

    // Recommendations
    report += `## 🎯 Recommendations\n\n`;
    
    if (totalCritical > 0) {
      report += `1. **URGENT**: Address all ${totalCritical} critical vulnerabilities immediately\n`;
    }
    
    if (this.metrics.secrets.detected > 0) {
      report += `2. **URGENT**: Remove all ${this.metrics.secrets.detected} detected secrets from the codebase\n`;
    }
    
    if (totalHigh > 0) {
      report += `3. Review and remediate ${totalHigh} high-severity vulnerabilities\n`;
    }
    
    if (this.metrics.coverage.security < 80) {
      report += `4. Improve security test coverage from ${this.metrics.coverage.security.toFixed(1)}% to at least 80%\n`;
    }
    
    report += `5. Implement regular security scanning in CI/CD pipeline\n`;
    report += `6. Consider security training for development team\n`;
    report += `7. Review and update security policies\n\n`;

    // Compliance Status
    report += `## 📋 Compliance Status\n\n`;
    report += `| Standard | Status | Notes |\n`;
    report += `|----------|--------|-------|\n`;
    report += `| OWASP Top 10 | ${totalCritical === 0 ? '✅ Compliant' : '❌ Issues Found'} | ${totalCritical > 0 ? `${totalCritical} critical issues` : 'No critical issues'} |\n`;
    report += `| Secure SDLC | ${this.metrics.coverage.security >= 80 ? '✅ Compliant' : '⚠️ Partial'} | Security test coverage: ${this.metrics.coverage.security.toFixed(1)}% |\n`;
    report += `| Secret Management | ${this.metrics.secrets.detected === 0 ? '✅ Compliant' : '❌ Violations'} | ${this.metrics.secrets.detected > 0 ? `${this.metrics.secrets.detected} secrets detected` : 'No secrets detected'} |\n\n`;

    // Next Steps
    report += `## 🚀 Next Steps\n\n`;
    report += `1. Review detailed scan reports in security-reports/ directory\n`;
    report += `2. Create tickets for high and critical vulnerabilities\n`;
    report += `3. Update security documentation\n`;
    report += `4. Schedule follow-up security review\n`;
    report += `5. Monitor security metrics dashboard\n\n`;

    report += `---\n`;
    report += `*Report generated by Kadai Security Pipeline on ${new Date().toISOString()}*\n`;

    await fs.writeFile(reportPath, report);
    console.log(`📄 Comprehensive report generated: ${reportPath}`);
  }

  /**
   * Generate JSON dashboard data
   */
  private async generateJsonDashboard(): Promise<void> {
    const dashboardPath = path.join(this.reportsDir, 'security-dashboard.json');

    const dashboard = {
      timestamp: new Date().toISOString(),
      project: 'kadai',
      branch: process.env.GITHUB_REF_NAME || 'unknown',
      commit: process.env.GITHUB_SHA || 'unknown',
      metrics: this.metrics,
      summary: {
        totalVulnerabilities: this.metrics.dependencies.total + 
                             this.metrics.codeAnalysis.total + 
                             this.metrics.penetrationTests.total,
        totalCritical: this.metrics.dependencies.critical + 
                      this.metrics.codeAnalysis.critical + 
                      this.metrics.penetrationTests.critical,
        totalHigh: this.metrics.dependencies.high + 
                  this.metrics.codeAnalysis.high + 
                  this.metrics.penetrationTests.high,
        secretsDetected: this.metrics.secrets.detected,
        securityCoverage: this.metrics.coverage.security,
        overallCoverage: this.metrics.coverage.overall,
      },
      status: this.calculateOverallStatus(),
      compliance: {
        owasp: this.metrics.dependencies.critical + this.metrics.codeAnalysis.critical + this.metrics.penetrationTests.critical === 0,
        secureSDLC: this.metrics.coverage.security >= 80,
        secretManagement: this.metrics.secrets.detected === 0,
      }
    };

    await fs.writeFile(dashboardPath, JSON.stringify(dashboard, null, 2));
    console.log(`📊 Dashboard data generated: ${dashboardPath}`);
  }

  /**
   * Generate executive summary
   */
  private async generateExecutiveSummary(): Promise<void> {
    const summaryPath = path.join(this.reportsDir, 'executive-summary.md');

    const totalCritical = this.metrics.dependencies.critical + 
                         this.metrics.codeAnalysis.critical + 
                         this.metrics.penetrationTests.critical;

    let summary = `# Security Executive Summary\n\n`;
    summary += `**Date:** ${new Date().toLocaleDateString()}\n`;
    summary += `**Project:** Kadai AI Sales Assistant\n\n`;

    summary += `## Key Findings\n\n`;
    
    if (totalCritical === 0 && this.metrics.secrets.detected === 0) {
      summary += `✅ **Security Status: GOOD**\n\n`;
      summary += `The application has passed security scanning with no critical vulnerabilities or exposed secrets detected.\n\n`;
    } else {
      summary += `⚠️ **Security Status: ATTENTION REQUIRED**\n\n`;
      if (totalCritical > 0) {
        summary += `- ${totalCritical} critical vulnerabilities require immediate remediation\n`;
      }
      if (this.metrics.secrets.detected > 0) {
        summary += `- ${this.metrics.secrets.detected} secrets detected and must be removed\n`;
      }
      summary += `\n`;
    }

    summary += `## Security Metrics\n\n`;
    summary += `- **Security Test Coverage:** ${this.metrics.coverage.security.toFixed(1)}%\n`;
    summary += `- **Dependencies Scanned:** ${this.metrics.dependencies.scannedPackages}\n`;
    summary += `- **Code Files Analyzed:** ${this.metrics.codeAnalysis.filesScanned}\n`;
    summary += `- **Penetration Test Targets:** ${this.metrics.penetrationTests.targetsScanned}\n\n`;

    summary += `## Immediate Actions Required\n\n`;
    if (totalCritical > 0 || this.metrics.secrets.detected > 0) {
      if (totalCritical > 0) {
        summary += `1. Address ${totalCritical} critical vulnerabilities before next release\n`;
      }
      if (this.metrics.secrets.detected > 0) {
        summary += `2. Remove ${this.metrics.secrets.detected} exposed secrets from codebase\n`;
      }
      summary += `3. Re-run security scans to verify fixes\n\n`;
    } else {
      summary += `No immediate actions required. Continue regular security monitoring.\n\n`;
    }

    summary += `For detailed analysis, see the comprehensive security report.\n`;

    await fs.writeFile(summaryPath, summary);
    console.log(`📋 Executive summary generated: ${summaryPath}`);
  }

  /**
   * Calculate overall security status
   */
  private calculateOverallStatus(): string {
    const totalCritical = this.metrics.dependencies.critical + 
                         this.metrics.codeAnalysis.critical + 
                         this.metrics.penetrationTests.critical;

    if (totalCritical > 0 || this.metrics.secrets.detected > 0) {
      return 'CRITICAL';
    }

    const totalHigh = this.metrics.dependencies.high + 
                     this.metrics.codeAnalysis.high + 
                     this.metrics.penetrationTests.high;

    if (totalHigh > 0) {
      return 'WARNING';
    }

    return 'GOOD';
  }

  /**
   * Utility functions
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  private async directoryExists(dirPath: string): Promise<boolean> {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

// Main execution
async function main() {
  const generator = new SecurityReportGenerator();
  await generator.generate();
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error generating security report:', error);
    process.exit(1);
  });
}

export { SecurityReportGenerator };