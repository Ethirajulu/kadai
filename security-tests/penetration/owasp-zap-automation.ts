/**
 * OWASP ZAP Automated Penetration Testing Suite
 * Integrates OWASP ZAP for automated security testing
 */

import { spawn, ChildProcess } from 'child_process';
import { promises as fs } from 'fs';
import * as path from 'path';
import axios from 'axios';
import { randomBytes } from 'crypto';

export interface ZAPConfig {
  zapPath?: string;
  zapPort?: number;
  zapHost?: string;
  apiKey?: string;
  timeout?: number;
  headless?: boolean;
}

export interface ScanTarget {
  name: string;
  url: string;
  context?: string;
  authentication?: {
    method: 'form' | 'script' | 'http';
    loginUrl?: string;
    usernameField?: string;
    passwordField?: string;
    username?: string;
    password?: string;
  };
}

export interface ScanResult {
  target: string;
  scanId: string;
  status: 'completed' | 'failed' | 'in_progress';
  alerts: ZAPAlert[];
  summary: {
    high: number;
    medium: number;
    low: number;
    informational: number;
    total: number;
  };
  scanTime: number;
  reportPath?: string;
}

export interface ZAPAlert {
  pluginId: string;
  alert: string;
  risk: 'High' | 'Medium' | 'Low' | 'Informational';
  confidence: 'High' | 'Medium' | 'Low';
  description: string;
  solution: string;
  reference: string;
  instances: Array<{
    uri: string;
    method: string;
    param: string;
    evidence: string;
  }>;
  cweid?: string;
  wascid?: string;
}

export class OWASPZAPAutomation {
  private config: Required<ZAPConfig>;
  private zapProcess?: ChildProcess;
  private baseURL: string;
  private isRunning = false;

  constructor(config: ZAPConfig = {}) {
    this.config = {
      zapPath: config.zapPath || '/Applications/OWASP ZAP.app/Contents/Java/zap.jar',
      zapPort: config.zapPort || 8080,
      zapHost: config.zapHost || 'localhost',
      apiKey: config.apiKey || this.generateSecureApiKey(),
      timeout: config.timeout || 300000, // 5 minutes
      headless: config.headless ?? true,
    };
    this.baseURL = `http://${this.config.zapHost}:${this.config.zapPort}`;
  }

  /**
   * Start OWASP ZAP daemon
   */
  async startZAP(): Promise<void> {
    if (this.isRunning) {
      console.log('ZAP is already running');
      return;
    }

    console.log('Starting OWASP ZAP...');

    const zapArgs = [
      '-jar', this.config.zapPath,
      '-daemon',
      '-port', this.config.zapPort.toString(),
      '-config', `api.key=${this.config.apiKey}`,
      '-config', 'api.addrs.addr.regex=true',
      '-config', 'api.addrs.addr.name=.*',
    ];

    if (this.config.headless) {
      zapArgs.push('-headless');
    }

    try {
      this.zapProcess = spawn('java', zapArgs, {
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      if (this.zapProcess.stdout) {
        this.zapProcess.stdout.on('data', (data) => {
          console.log(`ZAP: ${data}`);
        });
      }

      if (this.zapProcess.stderr) {
        this.zapProcess.stderr.on('data', (data) => {
          console.error(`ZAP Error: ${data}`);
        });
      }

      this.zapProcess.on('close', (code) => {
        console.log(`ZAP process exited with code ${code}`);
        this.isRunning = false;
      });

      // Wait for ZAP to start
      await this.waitForZAPToStart();
      this.isRunning = true;
      console.log('OWASP ZAP started successfully');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to start OWASP ZAP: ${errorMessage}`);
    }
  }

  /**
   * Generate secure API key for ZAP
   */
  private generateSecureApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Stop OWASP ZAP daemon
   */
  async stopZAP(): Promise<void> {
    if (!this.isRunning || !this.zapProcess) {
      return;
    }

    console.log('Stopping OWASP ZAP...');

    try {
      // Try graceful shutdown first
      await this.apiCall('core/action/shutdown/');
      
      // Wait a bit for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (this.zapProcess && !this.zapProcess.killed) {
        this.zapProcess.kill('SIGTERM');
        
        // Force kill if needed
        setTimeout(() => {
          if (this.zapProcess && !this.zapProcess.killed) {
            this.zapProcess.kill('SIGKILL');
          }
        }, 5000);
      }

      this.isRunning = false;
      console.log('OWASP ZAP stopped');

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Error stopping ZAP:', errorMessage);
      if (this.zapProcess) {
        this.zapProcess.kill('SIGKILL');
      }
      this.isRunning = false;
    }
  }

  /**
   * Run automated penetration test on target
   */
  async runPenetrationTest(target: ScanTarget): Promise<ScanResult> {
    const startTime = Date.now();
    console.log(`Starting penetration test for ${target.name} (${target.url})`);

    try {
      // Set up context if provided
      if (target.context) {
        await this.setupContext(target);
      }

      // Set up authentication if provided
      if (target.authentication) {
        await this.setupAuthentication(target);
      }

      // Access the target URL first
      await this.accessURL(target.url);

      // Run spider scan to discover pages
      const spiderId = await this.runSpider(target.url);
      await this.waitForScan(spiderId, 'spider');

      // Run active scan for vulnerabilities
      const activeScanId = await this.runActiveScan(target.url);
      await this.waitForScan(activeScanId, 'activescan');

      // Get alerts/results
      const alerts = await this.getAlerts(target.url);
      
      const summary = this.calculateSummary(alerts);
      const scanTime = Date.now() - startTime;

      // Generate report
      const reportPath = await this.generateReport(target, alerts);

      return {
        target: target.url,
        scanId: activeScanId,
        status: 'completed',
        alerts,
        summary,
        scanTime,
        reportPath,
      };

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Penetration test failed for ${target.url}:`, errorMessage);
      return {
        target: target.url,
        scanId: 'failed',
        status: 'failed',
        alerts: [],
        summary: { high: 0, medium: 0, low: 0, informational: 0, total: 0 },
        scanTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Run comprehensive security test suite
   */
  async runSecurityTestSuite(targets: ScanTarget[]): Promise<ScanResult[]> {
    console.log(`Running security test suite for ${targets.length} targets`);
    
    try {
      await this.startZAP();
      
      const results: ScanResult[] = [];
      
      for (const target of targets) {
        try {
          const result = await this.runPenetrationTest(target);
          results.push(result);
          
          // Brief pause between scans
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`Failed to scan ${target.url}:`, errorMessage);
          results.push({
            target: target.url,
            scanId: 'error',
            status: 'failed',
            alerts: [],
            summary: { high: 0, medium: 0, low: 0, informational: 0, total: 0 },
            scanTime: 0,
          });
        }
      }
      
      return results;
      
    } finally {
      await this.stopZAP();
    }
  }

  private async waitForZAPToStart(): Promise<void> {
    const maxAttempts = 30; // 30 attempts with 2s intervals = 1 minute max
    let attempts = 0;

    while (attempts < maxAttempts) {
      try {
        await axios.get(`${this.baseURL}/JSON/core/view/version/`, {
          timeout: 2000,
          params: { apikey: this.config.apiKey }
        });
        return; // ZAP is ready
      } catch (error) {
        attempts++;
        console.log(`Waiting for ZAP to start (attempt ${attempts}/${maxAttempts})...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    throw new Error('ZAP failed to start within timeout period');
  }

  private async apiCall(endpoint: string, params: Record<string, any> = {}): Promise<any> {
    const url = `${this.baseURL}/JSON/${endpoint}`;
    const response = await axios.get(url, {
      params: { apikey: this.config.apiKey, ...params },
      timeout: this.config.timeout,
    });
    return response.data;
  }

  private async setupContext(target: ScanTarget): Promise<void> {
    if (!target.context) return;

    console.log(`Setting up context: ${target.context}`);
    await this.apiCall('context/action/newContext/', { contextName: target.context });
    await this.apiCall('context/action/includeInContext/', {
      contextName: target.context,
      regex: `${target.url}.*`,
    });
  }

  private async setupAuthentication(target: ScanTarget): Promise<void> {
    if (!target.authentication || !target.context) return;

    console.log('Setting up authentication...');
    const auth = target.authentication;

    if (auth.method === 'form' && auth.loginUrl) {
      await this.apiCall('authentication/action/setAuthenticationMethod/', {
        contextId: '0', // Default context
        authMethodName: 'formBasedAuthentication',
        authMethodConfigParams: `loginUrl=${auth.loginUrl}&loginRequestData=username%3D{%25username%25}%26password%3D{%25password%25}`,
      });

      if (auth.username && auth.password) {
        await this.apiCall('users/action/newUser/', {
          contextId: '0',
          name: 'testuser',
        });

        await this.apiCall('users/action/setAuthenticationCredentials/', {
          contextId: '0',
          userId: '0',
          authCredentialsConfigParams: `username=${auth.username}&password=${auth.password}`,
        });

        await this.apiCall('users/action/setUserEnabled/', {
          contextId: '0',
          userId: '0',
          enabled: 'true',
        });
      }
    }
  }

  private async accessURL(url: string): Promise<void> {
    console.log(`Accessing target URL: ${url}`);
    await this.apiCall('core/action/accessUrl/', { url });
  }

  private async runSpider(url: string): Promise<string> {
    console.log(`Starting spider scan for: ${url}`);
    const response = await this.apiCall('spider/action/scan/', { url });
    return response.scan;
  }

  private async runActiveScan(url: string): Promise<string> {
    console.log(`Starting active scan for: ${url}`);
    const response = await this.apiCall('ascan/action/scan/', { url });
    return response.scan;
  }

  private async waitForScan(scanId: string, scanType: 'spider' | 'activescan'): Promise<void> {
    console.log(`Waiting for ${scanType} scan ${scanId} to complete...`);
    
    let progress = 0;
    while (progress < 100) {
      try {
        const endpoint = scanType === 'spider' 
          ? 'spider/view/status/'
          : 'ascan/view/status/';
        
        const response = await this.apiCall(endpoint, { scanId });
        progress = parseInt(response.status);
        
        if (progress < 100) {
          console.log(`${scanType} scan progress: ${progress}%`);
          await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error checking ${scanType} scan status:`, errorMessage);
        break;
      }
    }
    
    console.log(`${scanType} scan completed`);
  }

  private async getAlerts(baseurl?: string): Promise<ZAPAlert[]> {
    console.log('Retrieving security alerts...');
    const params = baseurl ? { baseurl } : {};
    const response = await this.apiCall('core/view/alerts/', params);
    return response.alerts || [];
  }

  private calculateSummary(alerts: ZAPAlert[]) {
    const summary = { high: 0, medium: 0, low: 0, informational: 0, total: alerts.length };
    
    alerts.forEach(alert => {
      switch (alert.risk.toLowerCase()) {
        case 'high':
          summary.high++;
          break;
        case 'medium':
          summary.medium++;
          break;
        case 'low':
          summary.low++;
          break;
        case 'informational':
          summary.informational++;
          break;
      }
    });
    
    return summary;
  }

  private async generateReport(target: ScanTarget, alerts: ZAPAlert[]): Promise<string> {
    const reportsDir = path.join(process.cwd(), 'security-reports', 'penetration');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `zap-report-${target.name}-${timestamp}.json`);
    
    const report = {
      target: target.url,
      scanDate: new Date().toISOString(),
      summary: this.calculateSummary(alerts),
      alerts,
      recommendations: this.generateRecommendations(alerts),
    };
    
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`Report generated: ${reportPath}`);
    
    return reportPath;
  }

  private generateRecommendations(alerts: ZAPAlert[]): string[] {
    const recommendations: string[] = [];
    const highRiskAlerts = alerts.filter(alert => alert.risk === 'High');
    const mediumRiskAlerts = alerts.filter(alert => alert.risk === 'Medium');

    if (highRiskAlerts.length > 0) {
      recommendations.push(`Immediately address ${highRiskAlerts.length} high-risk security vulnerabilities`);
    }

    if (mediumRiskAlerts.length > 0) {
      recommendations.push(`Review and fix ${mediumRiskAlerts.length} medium-risk security issues`);
    }

    // Add specific recommendations based on alert types
    const alertTypes = new Set(alerts.map(alert => alert.alert));
    
    if (alertTypes.has('Cross Site Scripting (Reflected)') || alertTypes.has('Cross Site Scripting (Stored)')) {
      recommendations.push('Implement proper input validation and output encoding to prevent XSS attacks');
    }

    if (alertTypes.has('SQL Injection')) {
      recommendations.push('Use parameterized queries and input validation to prevent SQL injection');
    }

    if (alertTypes.has('Missing Anti-clickjacking Header')) {
      recommendations.push('Add X-Frame-Options header to prevent clickjacking attacks');
    }

    if (alertTypes.has('Content Security Policy (CSP) Header Not Set')) {
      recommendations.push('Implement Content Security Policy headers to prevent various attacks');
    }

    return recommendations;
  }
}

// Default scan targets for Kadai application
export const defaultScanTargets: ScanTarget[] = [
  {
    name: 'api-gateway',
    url: 'http://localhost:3000',
  },
  {
    name: 'user-service',
    url: 'http://localhost:3001',
  },
  {
    name: 'seller-dashboard',
    url: 'http://localhost:4200',
  },
  {
    name: 'auth-endpoints',
    url: 'http://localhost:3001/auth',
    authentication: {
      method: 'form',
      loginUrl: 'http://localhost:3001/auth/login',
      usernameField: 'email',
      passwordField: 'password',
      username: process.env.SECURITY_TEST_USER || 'test@example.com',
      password: process.env.SECURITY_TEST_PASSWORD || 'TestPassword123!',
    },
  },
];