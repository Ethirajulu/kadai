import { VerificationReport } from './cleanup-verifier';
import { CleanupVerificationResult } from '../../types/cleanup';

export type ReportFormat = 'json' | 'html' | 'markdown' | 'console' | 'junit';

export interface ReportOptions {
  format: ReportFormat;
  includeDetails: boolean;
  includeMetrics: boolean;
  includeRecommendations: boolean;
  groupByDatabase: boolean;
  sortBySeverity: boolean;
  outputFile?: string;
  timestamp: boolean;
}

export interface ConsoleReportOptions {
  colors: boolean;
  verbose: boolean;
  showProgressBar: boolean;
  maxIssuesPerDatabase: number;
}

export class VerificationReporter {
  private defaultOptions: ReportOptions = {
    format: 'console',
    includeDetails: true,
    includeMetrics: true,
    includeRecommendations: true,
    groupByDatabase: true,
    sortBySeverity: true,
    timestamp: true,
  };

  /**
   * Generate verification report in specified format
   */
  async generateReport(
    report: VerificationReport,
    options?: Partial<ReportOptions>
  ): Promise<string> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    
    switch (mergedOptions.format) {
      case 'json':
        return this.generateJSONReport(report, mergedOptions);
      case 'html':
        return this.generateHTMLReport(report, mergedOptions);
      case 'markdown':
        return this.generateMarkdownReport(report, mergedOptions);
      case 'console':
        return this.generateConsoleReport(report, mergedOptions);
      case 'junit':
        return this.generateJUnitReport(report, mergedOptions);
      default:
        throw new Error(`Unsupported report format: ${mergedOptions.format}`);
    }
  }

  /**
   * Generate JSON report
   */
  private generateJSONReport(report: VerificationReport, options: ReportOptions): string {
    const jsonReport = {
      ...(options.timestamp && { timestamp: new Date().toISOString() }),
      ...report,
      ...(options.includeDetails && { detailedResults: report.detailedResults }),
      ...(options.includeMetrics && { metrics: this.extractMetrics(report) }),
    };

    return JSON.stringify(jsonReport, null, 2);
  }

  /**
   * Generate HTML report
   */
  private generateHTMLReport(report: VerificationReport, options: ReportOptions): string {
    const title = 'Cleanup Verification Report';
    const timestamp = options.timestamp ? new Date().toLocaleString() : '';
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background-color: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #e0e0e0; padding-bottom: 20px; margin-bottom: 20px; }
        .status-clean { color: #28a745; }
        .status-issues { color: #dc3545; }
        .status-warning { color: #ffc107; }
        .metric-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin: 20px 0; }
        .metric-card { background: #f8f9fa; padding: 15px; border-radius: 4px; border-left: 4px solid #007bff; }
        .issue-critical { background: #f8d7da; border-left: 4px solid #dc3545; }
        .issue-warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .issue-info { background: #d1ecf1; border-left: 4px solid #17a2b8; }
        .issue { margin: 10px 0; padding: 10px; border-radius: 4px; }
        .database-section { margin: 20px 0; }
        .database-title { color: #495057; border-bottom: 1px solid #dee2e6; padding-bottom: 5px; }
        .recommendations { background: #e9ecef; padding: 15px; border-radius: 4px; margin: 20px 0; }
        .table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .table th, .table td { padding: 12px; text-align: left; border-bottom: 1px solid #dee2e6; }
        .table th { background-color: #f8f9fa; font-weight: bold; }
        .progress-bar { width: 100%; height: 20px; background-color: #e9ecef; border-radius: 10px; overflow: hidden; }
        .progress-fill { height: 100%; background-color: #28a745; transition: width 0.3s ease; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${title}</h1>
            ${timestamp ? `<p>Generated: ${timestamp}</p>` : ''}
            <div class="status-${report.overallStatus === 'clean' ? 'clean' : 'issues'}">
                <h2>Overall Status: ${report.overallStatus.toUpperCase()}</h2>
            </div>
        </div>`;

    // Summary metrics
    if (options.includeMetrics) {
      html += `
        <div class="metric-grid">
            <div class="metric-card">
                <h3>Total Databases</h3>
                <p style="font-size: 24px; margin: 0;">${report.totalDatabases}</p>
            </div>
            <div class="metric-card">
                <h3>Clean Databases</h3>
                <p style="font-size: 24px; margin: 0; color: #28a745;">${report.cleanDatabases}</p>
            </div>
            <div class="metric-card">
                <h3>Databases with Issues</h3>
                <p style="font-size: 24px; margin: 0; color: #dc3545;">${report.databasesWithIssues}</p>
            </div>
            <div class="metric-card">
                <h3>Total Issues</h3>
                <p style="font-size: 24px; margin: 0;">${report.totalIssues}</p>
            </div>
            <div class="metric-card">
                <h3>Critical Issues</h3>
                <p style="font-size: 24px; margin: 0; color: #dc3545;">${report.criticalIssues}</p>
            </div>
            <div class="metric-card">
                <h3>Verification Time</h3>
                <p style="font-size: 24px; margin: 0;">${report.verificationTime}ms</p>
            </div>
        </div>
        
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${(report.cleanDatabases / report.totalDatabases) * 100}%"></div>
        </div>
        <p style="text-align: center; margin: 10px 0; color: #6c757d;">
            ${report.cleanDatabases}/${report.totalDatabases} databases clean (${Math.round((report.cleanDatabases / report.totalDatabases) * 100)}%)
        </p>`;
    }

    // Detailed results
    if (options.includeDetails) {
      html += '<h2>Detailed Results</h2>';
      
      const sortedResults = options.sortBySeverity 
        ? this.sortResultsBySeverity(report.detailedResults)
        : report.detailedResults;

      sortedResults.forEach(result => {
        html += `
          <div class="database-section">
            <h3 class="database-title">${result.database.toUpperCase()}</h3>
            <p><strong>Status:</strong> ${result.isClean ? '✅ Clean' : '❌ Issues Found'}</p>
            <p><strong>Verification Time:</strong> ${result.verificationTime}ms</p>
            <p><strong>Items Checked:</strong> ${this.formatCheckedItems(result.checkedItems)}</p>
            
            ${result.issues.length > 0 ? `
              <h4>Issues (${result.issues.length}):</h4>
              ${result.issues.map(issue => `
                <div class="issue issue-${issue.severity}">
                  <strong>${issue.type.replace('_', ' ').toUpperCase()}</strong> - ${issue.severity}
                  <p><strong>Location:</strong> ${issue.location}</p>
                  <p><strong>Description:</strong> ${issue.description}</p>
                  ${issue.suggestion ? `<p><strong>Suggestion:</strong> ${issue.suggestion}</p>` : ''}
                </div>
              `).join('')}
            ` : '<p style="color: #28a745;">No issues found</p>'}
          </div>`;
      });
    }

    // Recommendations
    if (options.includeRecommendations && report.recommendations.length > 0) {
      html += `
        <div class="recommendations">
          <h2>Recommendations</h2>
          <ul>
            ${report.recommendations.map(rec => `<li>${rec}</li>`).join('')}
          </ul>
        </div>`;
    }

    // Summary
    html += `
        <div class="summary">
          <h2>Summary</h2>
          <p>${report.summary}</p>
        </div>
      </div>
    </body>
    </html>`;

    return html;
  }

  /**
   * Generate Markdown report
   */
  private generateMarkdownReport(report: VerificationReport, options: ReportOptions): string {
    let markdown = '# Cleanup Verification Report\n\n';
    
    if (options.timestamp) {
      markdown += `**Generated:** ${new Date().toISOString()}\n\n`;
    }

    // Status
    const statusEmoji = report.overallStatus === 'clean' ? '✅' : '❌';
    markdown += `## ${statusEmoji} Overall Status: ${report.overallStatus.toUpperCase()}\n\n`;

    // Summary
    markdown += `### Summary\n${report.summary}\n\n`;

    // Metrics
    if (options.includeMetrics) {
      markdown += `### Metrics\n\n`;
      markdown += `| Metric | Value |\n`;
      markdown += `|--------|-------|\n`;
      markdown += `| Total Databases | ${report.totalDatabases} |\n`;
      markdown += `| Clean Databases | ${report.cleanDatabases} |\n`;
      markdown += `| Databases with Issues | ${report.databasesWithIssues} |\n`;
      markdown += `| Total Issues | ${report.totalIssues} |\n`;
      markdown += `| Critical Issues | ${report.criticalIssues} |\n`;
      markdown += `| Warning Issues | ${report.warningIssues} |\n`;
      markdown += `| Info Issues | ${report.infoIssues} |\n`;
      markdown += `| Verification Time | ${report.verificationTime}ms |\n\n`;
    }

    // Detailed results
    if (options.includeDetails) {
      markdown += `### Detailed Results\n\n`;
      
      const sortedResults = options.sortBySeverity 
        ? this.sortResultsBySeverity(report.detailedResults)
        : report.detailedResults;

      sortedResults.forEach(result => {
        const statusIcon = result.isClean ? '✅' : '❌';
        markdown += `#### ${statusIcon} ${result.database.toUpperCase()}\n\n`;
        markdown += `- **Status:** ${result.isClean ? 'Clean' : 'Issues Found'}\n`;
        markdown += `- **Verification Time:** ${result.verificationTime}ms\n`;
        markdown += `- **Items Checked:** ${this.formatCheckedItems(result.checkedItems)}\n\n`;
        
        if (result.issues.length > 0) {
          markdown += `**Issues (${result.issues.length}):**\n\n`;
          result.issues.forEach(issue => {
            const severityIcon = this.getSeverityIcon(issue.severity);
            markdown += `${severityIcon} **${issue.type.replace('_', ' ').toUpperCase()}** (${issue.severity})\n`;
            markdown += `- **Location:** ${issue.location}\n`;
            markdown += `- **Description:** ${issue.description}\n`;
            if (issue.suggestion) {
              markdown += `- **Suggestion:** ${issue.suggestion}\n`;
            }
            markdown += '\n';
          });
        } else {
          markdown += '✅ No issues found\n\n';
        }
      });
    }

    // Recommendations
    if (options.includeRecommendations && report.recommendations.length > 0) {
      markdown += `### Recommendations\n\n`;
      report.recommendations.forEach(rec => {
        markdown += `- ${rec}\n`;
      });
      markdown += '\n';
    }

    return markdown;
  }

  /**
   * Generate Console report
   */
  private generateConsoleReport(report: VerificationReport, options: ReportOptions): string {
    const colors = {
      reset: '\x1b[0m',
      bright: '\x1b[1m',
      red: '\x1b[31m',
      green: '\x1b[32m',
      yellow: '\x1b[33m',
      blue: '\x1b[34m',
      cyan: '\x1b[36m',
      gray: '\x1b[90m',
    };

    let output = '';
    
    // Header
    output += `${colors.bright}${colors.cyan}=== CLEANUP VERIFICATION REPORT ===${colors.reset}\n`;
    
    if (options.timestamp) {
      output += `${colors.gray}Generated: ${new Date().toLocaleString()}${colors.reset}\n`;
    }
    
    // Status
    const statusColor = report.overallStatus === 'clean' ? colors.green : colors.red;
    output += `\n${colors.bright}Overall Status: ${statusColor}${report.overallStatus.toUpperCase()}${colors.reset}\n`;
    
    // Summary
    output += `\n${colors.bright}Summary:${colors.reset}\n${report.summary}\n`;
    
    // Metrics
    if (options.includeMetrics) {
      output += `\n${colors.bright}Metrics:${colors.reset}\n`;
      output += `├─ Total Databases: ${report.totalDatabases}\n`;
      output += `├─ Clean Databases: ${colors.green}${report.cleanDatabases}${colors.reset}\n`;
      output += `├─ Databases with Issues: ${colors.red}${report.databasesWithIssues}${colors.reset}\n`;
      output += `├─ Total Issues: ${report.totalIssues}\n`;
      output += `├─ Critical Issues: ${colors.red}${report.criticalIssues}${colors.reset}\n`;
      output += `├─ Warning Issues: ${colors.yellow}${report.warningIssues}${colors.reset}\n`;
      output += `├─ Info Issues: ${colors.blue}${report.infoIssues}${colors.reset}\n`;
      output += `└─ Verification Time: ${report.verificationTime}ms\n`;
    }
    
    // Progress bar
    const progressWidth = 40;
    const progressFilled = Math.round((report.cleanDatabases / report.totalDatabases) * progressWidth);
    const progressEmpty = progressWidth - progressFilled;
    
    output += `\n${colors.bright}Progress:${colors.reset}\n`;
    output += `[${colors.green}${'█'.repeat(progressFilled)}${colors.reset}${colors.gray}${'░'.repeat(progressEmpty)}${colors.reset}] `;
    output += `${Math.round((report.cleanDatabases / report.totalDatabases) * 100)}% (${report.cleanDatabases}/${report.totalDatabases})\n`;
    
    // Detailed results
    if (options.includeDetails) {
      output += `\n${colors.bright}Detailed Results:${colors.reset}\n`;
      
      const sortedResults = options.sortBySeverity 
        ? this.sortResultsBySeverity(report.detailedResults)
        : report.detailedResults;

      sortedResults.forEach((result, index) => {
        const isLast = index === sortedResults.length - 1;
        const prefix = isLast ? '└─' : '├─';
        const statusIcon = result.isClean ? '✅' : '❌';
        const statusColor = result.isClean ? colors.green : colors.red;
        
        output += `${prefix} ${statusIcon} ${colors.bright}${result.database.toUpperCase()}${colors.reset} `;
        output += `${statusColor}(${result.isClean ? 'Clean' : 'Issues Found'})${colors.reset} `;
        output += `${colors.gray}(${result.verificationTime}ms)${colors.reset}\n`;
        
        if (result.issues.length > 0) {
          result.issues.forEach((issue, issueIndex) => {
            const isLastIssue = issueIndex === result.issues.length - 1;
            const issuePrefix = isLast ? '   ' : '│  ';
            const issueIcon = isLastIssue ? '└─' : '├─';
            
            const severityColor = issue.severity === 'critical' ? colors.red :
                                issue.severity === 'warning' ? colors.yellow : colors.blue;
            
            output += `${issuePrefix}${issueIcon} ${severityColor}${issue.type.replace('_', ' ').toUpperCase()}${colors.reset} `;
            output += `${colors.gray}(${issue.severity})${colors.reset}\n`;
            output += `${issuePrefix}   ${colors.gray}${issue.location}: ${issue.description}${colors.reset}\n`;
            
            if (issue.suggestion) {
              output += `${issuePrefix}   ${colors.blue}💡 ${issue.suggestion}${colors.reset}\n`;
            }
          });
        }
      });
    }
    
    // Recommendations
    if (options.includeRecommendations && report.recommendations.length > 0) {
      output += `\n${colors.bright}Recommendations:${colors.reset}\n`;
      report.recommendations.forEach((rec, index) => {
        const isLast = index === report.recommendations.length - 1;
        const prefix = isLast ? '└─' : '├─';
        output += `${prefix} ${colors.blue}💡 ${rec}${colors.reset}\n`;
      });
    }
    
    return output;
  }

  /**
   * Generate JUnit XML report
   */
  private generateJUnitReport(report: VerificationReport, options: ReportOptions): string {
    const timestamp = new Date().toISOString();
    const totalTests = report.totalDatabases;
    const failures = report.databasesWithIssues;
    const time = report.verificationTime / 1000; // Convert to seconds
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<testsuites name="CleanupVerification" tests="${totalTests}" failures="${failures}" time="${time}" timestamp="${timestamp}">\n`;
    xml += `  <testsuite name="DatabaseCleanupVerification" tests="${totalTests}" failures="${failures}" time="${time}">\n`;
    
    report.detailedResults.forEach(result => {
      const testTime = result.verificationTime / 1000;
      xml += `    <testcase name="${result.database}" classname="DatabaseCleanup" time="${testTime}">\n`;
      
      if (!result.isClean) {
        const criticalIssues = result.issues.filter(i => i.severity === 'critical');
        const warningIssues = result.issues.filter(i => i.severity === 'warning');
        
        if (criticalIssues.length > 0) {
          xml += `      <failure message="Critical cleanup issues found">\n`;
          xml += `        <![CDATA[\n`;
          criticalIssues.forEach(issue => {
            xml += `${issue.type}: ${issue.description}\n`;
            xml += `Location: ${issue.location}\n`;
            if (issue.suggestion) {
              xml += `Suggestion: ${issue.suggestion}\n`;
            }
            xml += `\n`;
          });
          xml += `        ]]>\n`;
          xml += `      </failure>\n`;
        }
        
        if (warningIssues.length > 0) {
          xml += `      <error message="Cleanup warnings found">\n`;
          xml += `        <![CDATA[\n`;
          warningIssues.forEach(issue => {
            xml += `${issue.type}: ${issue.description}\n`;
            xml += `Location: ${issue.location}\n`;
            if (issue.suggestion) {
              xml += `Suggestion: ${issue.suggestion}\n`;
            }
            xml += `\n`;
          });
          xml += `        ]]>\n`;
          xml += `      </error>\n`;
        }
      }
      
      xml += `    </testcase>\n`;
    });
    
    xml += `  </testsuite>\n`;
    xml += `</testsuites>\n`;
    
    return xml;
  }

  private sortResultsBySeverity(results: CleanupVerificationResult[]): CleanupVerificationResult[] {
    return results.sort((a, b) => {
      const aCritical = a.issues.filter(i => i.severity === 'critical').length;
      const bCritical = b.issues.filter(i => i.severity === 'critical').length;
      
      if (aCritical !== bCritical) {
        return bCritical - aCritical; // More critical issues first
      }
      
      const aWarning = a.issues.filter(i => i.severity === 'warning').length;
      const bWarning = b.issues.filter(i => i.severity === 'warning').length;
      
      return bWarning - aWarning; // More warnings first
    });
  }

  private formatCheckedItems(checkedItems: { [key: string]: number }): string {
    return Object.entries(checkedItems)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ') || 'N/A';
  }

  private getSeverityIcon(severity: string): string {
    switch (severity) {
      case 'critical': return '🔴';
      case 'warning': return '🟡';
      case 'info': return '🔵';
      default: return '⚪';
    }
  }

  private extractMetrics(report: VerificationReport): any {
    return {
      totalDatabases: report.totalDatabases,
      cleanDatabases: report.cleanDatabases,
      databasesWithIssues: report.databasesWithIssues,
      totalIssues: report.totalIssues,
      criticalIssues: report.criticalIssues,
      warningIssues: report.warningIssues,
      infoIssues: report.infoIssues,
      verificationTime: report.verificationTime,
      successRate: (report.cleanDatabases / report.totalDatabases) * 100,
    };
  }
}

/**
 * Utility function to generate and optionally save verification reports
 */
export async function generateVerificationReport(
  report: VerificationReport,
  options: Partial<ReportOptions> = {}
): Promise<string> {
  const reporter = new VerificationReporter();
  const reportContent = await reporter.generateReport(report, options);
  
  if (options.outputFile) {
    const fs = await import('fs');
    await fs.promises.writeFile(options.outputFile, reportContent, 'utf8');
  }
  
  return reportContent;
}