#!/usr/bin/env node

/**
 * Security Gate Check Script
 * Analyzes security scan results and determines if the build should pass or fail
 */

const fs = require('fs').promises;
const path = require('path');

class SecurityGateCheck {
  constructor() {
    this.config = {
      highThreshold: parseInt(process.env.SECURITY_THRESHOLD_HIGH || '0'),
      criticalThreshold: parseInt(process.env.SECURITY_THRESHOLD_CRITICAL || '0'),
      failOnHighSeverity: process.env.FAIL_ON_HIGH_SEVERITY === 'true',
      reportsDir: process.env.SECURITY_REPORTS_DIR || './security-artifacts',
    };
    
    this.results = {
      dependencies: { high: 0, critical: 0, issues: [] },
      codeAnalysis: { high: 0, critical: 0, issues: [] },
      secrets: { detected: 0, issues: [] },
      penetrationTests: { high: 0, critical: 0, issues: [] },
      total: { high: 0, critical: 0, issues: [] }
    };
  }

  /**
   * Main entry point for security gate check
   */
  async run() {
    console.log('🔒 Running Security Gate Check...');
    console.log(`High severity threshold: ${this.config.highThreshold}`);
    console.log(`Critical severity threshold: ${this.config.criticalThreshold}`);
    console.log(`Fail on high severity: ${this.config.failOnHighSeverity}`);
    
    try {
      await this.analyzeDependencyReports();
      await this.analyzeCodeAnalysisReports();
      await this.analyzeSecretScanReports();
      await this.analyzePenetrationTestReports();
      
      const gateResult = this.evaluateSecurityGate();
      await this.generateGateReport(gateResult);
      
      if (gateResult.passed) {
        console.log('✅ Security gate check PASSED');
        process.exit(0);
      } else {
        console.log('❌ Security gate check FAILED');
        console.log('Issues found:');
        gateResult.issues.forEach(issue => console.log(`  - ${issue}`));
        process.exit(1);
      }
      
    } catch (error) {
      console.error('Error during security gate check:', error.message);
      process.exit(1);
    }
  }

  /**
   * Analyze dependency vulnerability reports
   */
  async analyzeDependencyReports() {
    console.log('📦 Analyzing dependency vulnerability reports...');
    
    try {
      // Analyze Snyk dependency report
      const snykDepsPath = path.join(this.config.reportsDir, 'dependency-scan-reports', 'snyk-deps.json');
      if (await this.fileExists(snykDepsPath)) {
        const snykData = await this.safeJsonParse(snykDepsPath);
        if (snykData.vulnerabilities) {
          snykData.vulnerabilities.forEach(vuln => {
            if (vuln.severity === 'critical') {
              this.results.dependencies.critical++;
              this.results.dependencies.issues.push(`Critical dependency vulnerability: ${vuln.title} in ${vuln.packageName}`);
            } else if (vuln.severity === 'high') {
              this.results.dependencies.high++;
              this.results.dependencies.issues.push(`High dependency vulnerability: ${vuln.title} in ${vuln.packageName}`);
            }
          });
        }
      }

      // Analyze npm audit report
      const npmAuditPath = path.join(this.config.reportsDir, 'dependency-scan-reports', 'npm-audit.json');
      if (await this.fileExists(npmAuditPath)) {
        const auditData = await this.safeJsonParse(npmAuditPath);
        if (auditData.vulnerabilities) {
          Object.values(auditData.vulnerabilities).forEach(vuln => {
            if (vuln.severity === 'critical') {
              this.results.dependencies.critical++;
              this.results.dependencies.issues.push(`Critical npm vulnerability: ${vuln.title}`);
            } else if (vuln.severity === 'high') {
              this.results.dependencies.high++;
              this.results.dependencies.issues.push(`High npm vulnerability: ${vuln.title}`);
            }
          });
        }
      }

      // Analyze Python Safety report
      const safetyPath = path.join(this.config.reportsDir, 'dependency-scan-reports', 'safety-report.json');
      if (await this.fileExists(safetyPath)) {
        const safetyData = await this.safeJsonParse(safetyPath);
        if (Array.isArray(safetyData)) {
          safetyData.forEach(vuln => {
            // Safety reports don't have severity levels, treat all as high
            this.results.dependencies.high++;
            this.results.dependencies.issues.push(`Python dependency vulnerability: ${vuln.advisory} in ${vuln.package_name}`);
          });
        }
      }

      console.log(`Dependencies: ${this.results.dependencies.critical} critical, ${this.results.dependencies.high} high severity issues`);
      
    } catch (error) {
      console.warn('Warning: Could not analyze dependency reports:', error.message);
    }
  }

  /**
   * Analyze code analysis reports
   */
  async analyzeCodeAnalysisReports() {
    console.log('🔍 Analyzing code analysis reports...');
    
    try {
      // Analyze Snyk code report
      const snykCodePath = path.join(this.config.reportsDir, 'code-analysis-reports', 'snyk-code.json');
      if (await this.fileExists(snykCodePath)) {
        const snykData = JSON.parse(await fs.readFile(snykCodePath, 'utf8'));
        if (snykData.runs && snykData.runs[0] && snykData.runs[0].results) {
          snykData.runs[0].results.forEach(result => {
            const severity = result.level || 'info';
            if (severity === 'error') {
              this.results.codeAnalysis.critical++;
              this.results.codeAnalysis.issues.push(`Critical code issue: ${result.message.text}`);
            } else if (severity === 'warning') {
              this.results.codeAnalysis.high++;
              this.results.codeAnalysis.issues.push(`High code issue: ${result.message.text}`);
            }
          });
        }
      }

      // Analyze Semgrep report
      const semgrepPath = path.join(this.config.reportsDir, 'code-analysis-reports', 'semgrep-results.json');
      if (await this.fileExists(semgrepPath)) {
        const semgrepData = JSON.parse(await fs.readFile(semgrepPath, 'utf8'));
        if (semgrepData.results) {
          semgrepData.results.forEach(result => {
            if (result.extra && result.extra.severity) {
              if (result.extra.severity === 'ERROR') {
                this.results.codeAnalysis.critical++;
                this.results.codeAnalysis.issues.push(`Critical Semgrep issue: ${result.check_id} - ${result.extra.message}`);
              } else if (result.extra.severity === 'WARNING') {
                this.results.codeAnalysis.high++;
                this.results.codeAnalysis.issues.push(`High Semgrep issue: ${result.check_id} - ${result.extra.message}`);
              }
            }
          });
        }
      }

      // Analyze Bandit report
      const banditPath = path.join(this.config.reportsDir, 'code-analysis-reports', 'bandit-results.json');
      if (await this.fileExists(banditPath)) {
        const banditData = JSON.parse(await fs.readFile(banditPath, 'utf8'));
        if (banditData.results) {
          banditData.results.forEach(result => {
            if (result.issue_severity === 'HIGH') {
              this.results.codeAnalysis.high++;
              this.results.codeAnalysis.issues.push(`High Bandit issue: ${result.test_name} - ${result.issue_text}`);
            }
          });
        }
      }

      console.log(`Code Analysis: ${this.results.codeAnalysis.critical} critical, ${this.results.codeAnalysis.high} high severity issues`);
      
    } catch (error) {
      console.warn('Warning: Could not analyze code analysis reports:', error.message);
    }
  }

  /**
   * Analyze secret scanning reports
   */
  async analyzeSecretScanReports() {
    console.log('🔐 Analyzing secret scanning reports...');
    
    try {
      // Analyze Semgrep secrets report
      const secretsPath = path.join(this.config.reportsDir, 'secret-scan-reports', 'secrets-scan.json');
      if (await this.fileExists(secretsPath)) {
        const secretsData = JSON.parse(await fs.readFile(secretsPath, 'utf8'));
        if (secretsData.results && secretsData.results.length > 0) {
          this.results.secrets.detected = secretsData.results.length;
          secretsData.results.forEach(result => {
            this.results.secrets.issues.push(`Secret detected: ${result.check_id} in ${result.path}`);
          });
        }
      }

      // Analyze GitLeaks report
      const gitleaksPath = path.join(this.config.reportsDir, 'secret-scan-reports', 'gitleaks-report.json');
      if (await this.fileExists(gitleaksPath)) {
        const gitleaksData = JSON.parse(await fs.readFile(gitleaksPath, 'utf8'));
        if (Array.isArray(gitleaksData) && gitleaksData.length > 0) {
          this.results.secrets.detected += gitleaksData.length;
          gitleaksData.forEach(result => {
            this.results.secrets.issues.push(`GitLeaks detection: ${result.Description} in ${result.File}`);
          });
        }
      }

      console.log(`Secrets: ${this.results.secrets.detected} potential secrets detected`);
      
    } catch (error) {
      console.warn('Warning: Could not analyze secret scan reports:', error.message);
    }
  }

  /**
   * Analyze penetration test reports
   */
  async analyzePenetrationTestReports() {
    console.log('🎯 Analyzing penetration test reports...');
    
    try {
      const pentestDir = path.join(this.config.reportsDir, 'penetration-test-reports');
      if (await this.directoryExists(pentestDir)) {
        const files = await fs.readdir(pentestDir);
        
        for (const file of files) {
          if (file.startsWith('pentest-summary-') && file.endsWith('.json')) {
            const reportPath = path.join(pentestDir, file);
            const reportData = JSON.parse(await fs.readFile(reportPath, 'utf8'));
            
            if (reportData.summary) {
              this.results.penetrationTests.high += reportData.summary.high || 0;
              this.results.penetrationTests.critical += reportData.summary.critical || 0;
              
              if (reportData.criticalIssues) {
                reportData.criticalIssues.forEach(issue => {
                  this.results.penetrationTests.issues.push(`Penetration test: ${issue}`);
                });
              }
            }
          }
        }
      }

      console.log(`Penetration Tests: ${this.results.penetrationTests.critical} critical, ${this.results.penetrationTests.high} high severity issues`);
      
    } catch (error) {
      console.warn('Warning: Could not analyze penetration test reports:', error.message);
    }
  }

  /**
   * Evaluate if the security gate should pass or fail
   */
  evaluateSecurityGate() {
    // Calculate totals
    this.results.total.critical = this.results.dependencies.critical + 
                                  this.results.codeAnalysis.critical + 
                                  this.results.penetrationTests.critical;
    
    this.results.total.high = this.results.dependencies.high + 
                              this.results.codeAnalysis.high + 
                              this.results.penetrationTests.high;
    
    this.results.total.issues = [
      ...this.results.dependencies.issues,
      ...this.results.codeAnalysis.issues,
      ...this.results.secrets.issues,
      ...this.results.penetrationTests.issues
    ];

    const issues = [];
    let passed = true;

    // Check critical threshold
    if (this.results.total.critical > this.config.criticalThreshold) {
      passed = false;
      issues.push(`Critical vulnerabilities (${this.results.total.critical}) exceed threshold (${this.config.criticalThreshold})`);
    }

    // Check high severity threshold
    if (this.results.total.high > this.config.highThreshold) {
      if (this.config.failOnHighSeverity) {
        passed = false;
      }
      issues.push(`High severity vulnerabilities (${this.results.total.high}) exceed threshold (${this.config.highThreshold})`);
    }

    // Secrets are always a failure if detected
    if (this.results.secrets.detected > 0) {
      passed = false;
      issues.push(`Secrets detected (${this.results.secrets.detected}) - secrets must be removed`);
    }

    return {
      passed,
      issues,
      summary: {
        critical: this.results.total.critical,
        high: this.results.total.high,
        secrets: this.results.secrets.detected,
        totalIssues: this.results.total.issues.length
      }
    };
  }

  /**
   * Generate security gate report
   */
  async generateGateReport(gateResult) {
    const reportsDir = path.join(process.cwd(), 'security-reports');
    await fs.mkdir(reportsDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `security-gate-report-${timestamp}.md`);

    let report = `# Security Gate Check Report\n\n`;
    report += `**Date:** ${new Date().toISOString()}\n`;
    report += `**Status:** ${gateResult.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;

    report += `## Summary\n\n`;
    report += `- **Critical Vulnerabilities:** ${gateResult.summary.critical}\n`;
    report += `- **High Severity Vulnerabilities:** ${gateResult.summary.high}\n`;
    report += `- **Secrets Detected:** ${gateResult.summary.secrets}\n`;
    report += `- **Total Issues:** ${gateResult.summary.totalIssues}\n\n`;

    report += `## Thresholds\n\n`;
    report += `- **Critical Threshold:** ${this.config.criticalThreshold}\n`;
    report += `- **High Severity Threshold:** ${this.config.highThreshold}\n`;
    report += `- **Fail on High Severity:** ${this.config.failOnHighSeverity}\n\n`;

    if (!gateResult.passed) {
      report += `## Gate Failure Reasons\n\n`;
      gateResult.issues.forEach(issue => {
        report += `- ${issue}\n`;
      });
      report += `\n`;
    }

    report += `## Detailed Results\n\n`;
    report += `### Dependencies\n`;
    report += `- Critical: ${this.results.dependencies.critical}\n`;
    report += `- High: ${this.results.dependencies.high}\n\n`;

    report += `### Code Analysis\n`;
    report += `- Critical: ${this.results.codeAnalysis.critical}\n`;
    report += `- High: ${this.results.codeAnalysis.high}\n\n`;

    report += `### Secret Scanning\n`;
    report += `- Secrets Detected: ${this.results.secrets.detected}\n\n`;

    report += `### Penetration Testing\n`;
    report += `- Critical: ${this.results.penetrationTests.critical}\n`;
    report += `- High: ${this.results.penetrationTests.high}\n\n`;

    if (this.results.total.issues.length > 0) {
      report += `## All Issues Found\n\n`;
      this.results.total.issues.forEach((issue, index) => {
        report += `${index + 1}. ${issue}\n`;
      });
      report += `\n`;
    }

    report += `## Recommendations\n\n`;
    if (gateResult.summary.critical > 0) {
      report += `1. **URGENT**: Address all ${gateResult.summary.critical} critical vulnerabilities immediately\n`;
    }
    if (gateResult.summary.high > 0) {
      report += `2. Review and remediate ${gateResult.summary.high} high severity vulnerabilities\n`;
    }
    if (gateResult.summary.secrets > 0) {
      report += `3. **REQUIRED**: Remove all ${gateResult.summary.secrets} detected secrets from the codebase\n`;
    }
    report += `4. Re-run security scans after fixes are applied\n`;
    report += `5. Consider implementing additional security controls\n\n`;

    await fs.writeFile(reportPath, report);
    console.log(`📊 Security gate report generated: ${reportPath}`);

    // Generate PR comment if this is a pull request
    if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
      await this.generatePRComment(gateResult);
    }
  }

  /**
   * Generate PR comment with security results
   */
  async generatePRComment(gateResult) {
    const reportsDir = path.join(process.cwd(), 'security-reports');
    const commentPath = path.join(reportsDir, 'pr-security-summary.md');

    let comment = `## 🔒 Security Gate Check Results\n\n`;
    comment += `**Status:** ${gateResult.passed ? '✅ PASSED' : '❌ FAILED'}\n\n`;

    comment += `| Category | Critical | High | Status |\n`;
    comment += `|----------|----------|------|--------|\n`;
    comment += `| Dependencies | ${this.results.dependencies.critical} | ${this.results.dependencies.high} | ${this.results.dependencies.critical + this.results.dependencies.high === 0 ? '✅' : '⚠️'} |\n`;
    comment += `| Code Analysis | ${this.results.codeAnalysis.critical} | ${this.results.codeAnalysis.high} | ${this.results.codeAnalysis.critical + this.results.codeAnalysis.high === 0 ? '✅' : '⚠️'} |\n`;
    comment += `| Secrets | ${this.results.secrets.detected} | - | ${this.results.secrets.detected === 0 ? '✅' : '❌'} |\n`;
    comment += `| Penetration Tests | ${this.results.penetrationTests.critical} | ${this.results.penetrationTests.high} | ${this.results.penetrationTests.critical + this.results.penetrationTests.high === 0 ? '✅' : '⚠️'} |\n\n`;

    if (!gateResult.passed) {
      comment += `### ❌ Gate Failures\n\n`;
      gateResult.issues.forEach(issue => {
        comment += `- ${issue}\n`;
      });
      comment += `\n`;
    }

    comment += `### 📊 Summary\n`;
    comment += `- **Total Critical:** ${gateResult.summary.critical}\n`;
    comment += `- **Total High:** ${gateResult.summary.high}\n`;
    comment += `- **Secrets Detected:** ${gateResult.summary.secrets}\n\n`;

    if (gateResult.summary.critical > 0 || gateResult.summary.secrets > 0) {
      comment += `⚠️ **Action Required**: This PR cannot be merged until all critical vulnerabilities and secrets are resolved.\n\n`;
    }

    comment += `<details>\n<summary>🔍 View detailed security reports</summary>\n\n`;
    comment += `Check the Actions tab for detailed security scan results and reports.\n`;
    comment += `</details>\n`;

    await fs.writeFile(commentPath, comment);
    console.log(`💬 PR comment generated: ${commentPath}`);
  }

  /**
   * Safely parse JSON file with validation
   */
  async safeJsonParse(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      // Basic validation to prevent JSON injection
      if (content.length > 50 * 1024 * 1024) { // 50MB limit
        throw new Error('File too large for security analysis');
      }
      return JSON.parse(content);
    } catch (error) {
      console.warn(`Warning: Could not parse JSON file ${filePath}:`, error.message);
      return {};
    }
  }

  /**
   * Utility function to check if file exists
   */
  async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Utility function to check if directory exists
   */
  async directoryExists(dirPath) {
    try {
      const stats = await fs.stat(dirPath);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }
}

// Main execution
if (require.main === module) {
  const gateCheck = new SecurityGateCheck();
  gateCheck.run().catch(error => {
    console.error('Fatal error in security gate check:', error);
    process.exit(1);
  });
}

module.exports = { SecurityGateCheck };