/**
 * Security Performance Benchmarking Suite
 * Measures the performance impact of security measures and ensures they meet acceptable thresholds
 */

import { performance } from 'perf_hooks';
import { SecurityTestUtils } from '../utils/security-test-utils';

interface PerformanceBenchmark {
  name: string;
  operation: () => Promise<any>;
  expectedMaxTime: number; // milliseconds
  iterations: number;
  warmupIterations?: number;
}

interface BenchmarkResult {
  name: string;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  p99Time: number;
  throughput: number; // operations per second
  passed: boolean;
  iterations: number;
  measurements: number[];
}

export class SecurityPerformanceBenchmark {
  private results: BenchmarkResult[] = [];

  /**
   * Run a single benchmark
   */
  async runBenchmark(benchmark: PerformanceBenchmark): Promise<BenchmarkResult> {
    console.log(`Running benchmark: ${benchmark.name}`);
    
    const measurements: number[] = [];
    const totalIterations = (benchmark.warmupIterations || 0) + benchmark.iterations;

    // Run warmup iterations if specified
    if (benchmark.warmupIterations) {
      console.log(`Warming up with ${benchmark.warmupIterations} iterations...`);
      for (let i = 0; i < benchmark.warmupIterations; i++) {
        await benchmark.operation();
      }
    }

    // Run actual benchmark iterations
    console.log(`Running ${benchmark.iterations} benchmark iterations...`);
    for (let i = 0; i < benchmark.iterations; i++) {
      const startTime = performance.now();
      await benchmark.operation();
      const endTime = performance.now();
      
      measurements.push(endTime - startTime);
      
      // Brief pause between iterations to avoid overwhelming the system
      if (i < benchmark.iterations - 1) {
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    }

    // Calculate statistics
    const sortedMeasurements = measurements.sort((a, b) => a - b);
    const averageTime = measurements.reduce((sum, time) => sum + time, 0) / measurements.length;
    const minTime = Math.min(...measurements);
    const maxTime = Math.max(...measurements);
    const p95Index = Math.floor(measurements.length * 0.95);
    const p99Index = Math.floor(measurements.length * 0.99);
    const p95Time = sortedMeasurements[p95Index];
    const p99Time = sortedMeasurements[p99Index];
    const throughput = 1000 / averageTime; // operations per second

    const result: BenchmarkResult = {
      name: benchmark.name,
      averageTime,
      minTime,
      maxTime,
      p95Time,
      p99Time,
      throughput,
      passed: averageTime <= benchmark.expectedMaxTime,
      iterations: benchmark.iterations,
      measurements,
    };

    this.results.push(result);
    
    console.log(`Benchmark ${benchmark.name} completed:`);
    console.log(`  Average: ${averageTime.toFixed(2)}ms`);
    console.log(`  P95: ${p95Time.toFixed(2)}ms`);
    console.log(`  Throughput: ${throughput.toFixed(2)} ops/sec`);
    console.log(`  Passed: ${result.passed ? 'YES' : 'NO'} (expected ≤ ${benchmark.expectedMaxTime}ms)`);

    return result;
  }

  /**
   * Run all benchmarks
   */
  async runAllBenchmarks(benchmarks: PerformanceBenchmark[]): Promise<BenchmarkResult[]> {
    console.log(`Running ${benchmarks.length} security performance benchmarks...`);
    
    for (const benchmark of benchmarks) {
      await this.runBenchmark(benchmark);
      
      // Brief pause between benchmarks
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return this.results;
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const totalBenchmarks = this.results.length;
    const passedBenchmarks = this.results.filter(r => r.passed).length;
    const failedBenchmarks = totalBenchmarks - passedBenchmarks;

    let report = `# Security Performance Benchmark Report\n\n`;
    report += `**Test Date:** ${new Date().toISOString()}\n`;
    report += `**Total Benchmarks:** ${totalBenchmarks}\n`;
    report += `**Passed:** ${passedBenchmarks}\n`;
    report += `**Failed:** ${failedBenchmarks}\n`;
    report += `**Success Rate:** ${((passedBenchmarks / totalBenchmarks) * 100).toFixed(1)}%\n\n`;

    report += `## Benchmark Results\n\n`;
    report += `| Benchmark | Avg (ms) | P95 (ms) | P99 (ms) | Throughput (ops/sec) | Status |\n`;
    report += `|-----------|----------|----------|----------|---------------------|--------|\n`;

    this.results.forEach(result => {
      const status = result.passed ? '✅ PASS' : '❌ FAIL';
      report += `| ${result.name} | ${result.averageTime.toFixed(2)} | ${result.p95Time.toFixed(2)} | ${result.p99Time.toFixed(2)} | ${result.throughput.toFixed(2)} | ${status} |\n`;
    });

    report += `\n## Performance Analysis\n\n`;

    // Identify slowest operations
    const slowestResults = [...this.results].sort((a, b) => b.averageTime - a.averageTime).slice(0, 3);
    report += `### Slowest Operations:\n`;
    slowestResults.forEach((result, index) => {
      report += `${index + 1}. **${result.name}**: ${result.averageTime.toFixed(2)}ms average\n`;
    });

    // Identify failed benchmarks
    const failedResults = this.results.filter(r => !r.passed);
    if (failedResults.length > 0) {
      report += `\n### Failed Benchmarks:\n`;
      failedResults.forEach(result => {
        report += `- **${result.name}**: ${result.averageTime.toFixed(2)}ms (expected ≤ ${result.measurements.length > 0 ? 'threshold exceeded' : 'unknown'})\n`;
      });
    }

    return report;
  }

  /**
   * Clear previous results
   */
  clearResults(): void {
    this.results = [];
  }
}

describe('Security Performance Benchmarks', () => {
  let benchmark: SecurityPerformanceBenchmark;

  beforeAll(() => {
    benchmark = new SecurityPerformanceBenchmark();
  });

  beforeEach(() => {
    benchmark.clearResults();
  });

  describe('Authentication Performance', () => {
    it('should benchmark JWT token generation performance', async () => {
      const jwtBenchmark: PerformanceBenchmark = {
        name: 'JWT Token Generation',
        operation: async () => {
          return SecurityTestUtils.generateTestJWT({
            sub: 'test-user',
            email: 'test@example.com',
            role: 'user',
          });
        },
        expectedMaxTime: 5, // Should take less than 5ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(jwtBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(5);
      expect(result.throughput).toBeGreaterThan(200); // At least 200 tokens/sec
    });

    it('should benchmark JWT token validation performance', async () => {
      const testToken = SecurityTestUtils.generateTestJWT();
      
      const validationBenchmark: PerformanceBenchmark = {
        name: 'JWT Token Validation',
        operation: async () => {
          // Simulate JWT validation (in real scenario, this would call actual validation)
          const parts = testToken.split('.');
          if (parts.length !== 3) throw new Error('Invalid token');
          const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
          return payload;
        },
        expectedMaxTime: 2, // Should take less than 2ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(validationBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(2);
      expect(result.throughput).toBeGreaterThan(500); // At least 500 validations/sec
    });

    it('should benchmark password hashing performance', async () => {
      const hashingBenchmark: PerformanceBenchmark = {
        name: 'Password Hashing (bcrypt)',
        operation: async () => {
          // Simulate bcrypt hashing (in real scenario, would use actual bcrypt)
          const password = 'TestPassword123!';
          await new Promise(resolve => setTimeout(resolve, 100)); // Simulate bcrypt delay
          return `$2b$10$${Buffer.from(password).toString('base64')}`;
        },
        expectedMaxTime: 150, // bcrypt should take less than 150ms
        iterations: 50, // Fewer iterations for expensive operations
        warmupIterations: 5,
      };

      const result = await benchmark.runBenchmark(hashingBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(150);
      expect(result.throughput).toBeGreaterThan(6); // At least 6 hashes/sec
    });
  });

  describe('Input Validation Performance', () => {
    it('should benchmark XSS sanitization performance', async () => {
      const xssPayloads = SecurityTestUtils.getXSSPayloads();
      let payloadIndex = 0;

      const sanitizationBenchmark: PerformanceBenchmark = {
        name: 'XSS Sanitization',
        operation: async () => {
          const payload = xssPayloads[payloadIndex % xssPayloads.length];
          payloadIndex++;
          
          // Simulate XSS sanitization
          return payload
            .replace(/<script.*?>.*?<\/script>/gi, '')
            .replace(/javascript:/gi, '')
            .replace(/on\w+\s*=/gi, '');
        },
        expectedMaxTime: 1, // Should take less than 1ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(sanitizationBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(1);
      expect(result.throughput).toBeGreaterThan(1000); // At least 1000 sanitizations/sec
    });

    it('should benchmark SQL injection validation performance', async () => {
      const sqlPayloads = SecurityTestUtils.getSQLInjectionPayloads();
      let payloadIndex = 0;

      const sqlValidationBenchmark: PerformanceBenchmark = {
        name: 'SQL Injection Validation',
        operation: async () => {
          const payload = sqlPayloads[payloadIndex % sqlPayloads.length];
          payloadIndex++;
          
          // Simulate SQL injection validation
          const sqlPatterns = [
            /('|\\')|(;)|(\\)|(--)|(%27)|(')|(\\\\)|(')|(–)|(—)/i,
            /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
          ];
          
          return !sqlPatterns.some(pattern => pattern.test(payload));
        },
        expectedMaxTime: 0.5, // Should take less than 0.5ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(sqlValidationBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(0.5);
      expect(result.throughput).toBeGreaterThan(2000); // At least 2000 validations/sec
    });

    it('should benchmark comprehensive input validation performance', async () => {
      const validationBenchmark: PerformanceBenchmark = {
        name: 'Comprehensive Input Validation',
        operation: async () => {
          const input = {
            email: 'test@example.com',
            username: 'testuser123',
            message: 'Hello world! <script>alert("xss")</script>',
            age: 25,
          };

          // Simulate comprehensive validation
          const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email);
          const usernameValid = /^[a-zA-Z0-9_]{3,20}$/.test(input.username);
          const messageClean = input.message.replace(/<[^>]*>/g, '');
          const ageValid = typeof input.age === 'number' && input.age > 0 && input.age < 120;

          return emailValid && usernameValid && messageClean && ageValid;
        },
        expectedMaxTime: 2, // Should take less than 2ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(validationBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(2);
      expect(result.throughput).toBeGreaterThan(500); // At least 500 validations/sec
    });
  });

  describe('Rate Limiting Performance', () => {
    it('should benchmark rate limit check performance', async () => {
      const rateLimitBenchmark: PerformanceBenchmark = {
        name: 'Rate Limit Check',
        operation: async () => {
          const clientId = 'test-client-123';
          const now = Date.now();
          
          // Simulate rate limit check (in-memory for benchmark)
          const window = Math.floor(now / 60000); // 1-minute window
          const key = `${clientId}:${window}`;
          
          // Simulate Redis-like operation
          await new Promise(resolve => setTimeout(resolve, 0.1)); // Minimal async delay
          
          return { allowed: true, remaining: 99 };
        },
        expectedMaxTime: 1, // Should take less than 1ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(rateLimitBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(1);
      expect(result.throughput).toBeGreaterThan(1000); // At least 1000 checks/sec
    });
  });

  describe('Encryption Performance', () => {
    it('should benchmark AES encryption performance', async () => {
      const encryptionBenchmark: PerformanceBenchmark = {
        name: 'AES Encryption',
        operation: async () => {
          const crypto = require('crypto');
          const data = 'This is sensitive data that needs to be encrypted';
          const key = crypto.randomBytes(32);
          const iv = crypto.randomBytes(16);
          
          const cipher = crypto.createCipher('aes-256-cbc', key);
          let encrypted = cipher.update(data, 'utf8', 'hex');
          encrypted += cipher.final('hex');
          
          return encrypted;
        },
        expectedMaxTime: 1, // Should take less than 1ms
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(encryptionBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(1);
      expect(result.throughput).toBeGreaterThan(1000); // At least 1000 encryptions/sec
    });
  });

  describe('Security Header Performance', () => {
    it('should benchmark security header application performance', async () => {
      const headerBenchmark: PerformanceBenchmark = {
        name: 'Security Headers Application',
        operation: async () => {
          const response = {
            headers: {} as Record<string, string>,
            setHeader: function(name: string, value: string) {
              this.headers[name] = value;
            }
          };

          // Simulate applying security headers
          response.setHeader('X-Frame-Options', 'DENY');
          response.setHeader('X-Content-Type-Options', 'nosniff');
          response.setHeader('X-XSS-Protection', '1; mode=block');
          response.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
          response.setHeader('Content-Security-Policy', "default-src 'self'");
          response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

          return response.headers;
        },
        expectedMaxTime: 0.1, // Should take less than 0.1ms
        iterations: 10000,
        warmupIterations: 1000,
      };

      const result = await benchmark.runBenchmark(headerBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(0.1);
      expect(result.throughput).toBeGreaterThan(10000); // At least 10,000 operations/sec
    });
  });

  describe('Full Security Stack Performance', () => {
    it('should benchmark complete security middleware stack', async () => {
      const fullStackBenchmark: PerformanceBenchmark = {
        name: 'Complete Security Middleware Stack',
        operation: async () => {
          const request = {
            headers: {
              'authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              'user-agent': 'Mozilla/5.0...',
              'x-forwarded-for': '192.168.1.1',
            },
            body: {
              email: 'test@example.com',
              message: 'Hello world! <script>alert("xss")</script>',
            },
            ip: '127.0.0.1',
            url: '/api/users/profile',
            method: 'POST',
          };

          // Simulate complete security stack processing
          
          // 1. Rate limiting check
          await new Promise(resolve => setTimeout(resolve, 0.1));
          
          // 2. JWT validation
          const token = request.headers.authorization?.replace('Bearer ', '');
          if (token) {
            const parts = token.split('.');
            if (parts.length === 3) {
              JSON.parse(Buffer.from(parts[1], 'base64').toString());
            }
          }
          
          // 3. Input validation and sanitization
          const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.body.email);
          const messageClean = request.body.message.replace(/<[^>]*>/g, '');
          
          // 4. CORS check
          const origin = request.headers['origin'];
          const corsValid = !origin || origin === 'https://kadai.com';
          
          // 5. Security headers application
          const securityHeaders = {
            'X-Frame-Options': 'DENY',
            'X-Content-Type-Options': 'nosniff',
            'X-XSS-Protection': '1; mode=block',
          };

          return {
            rateLimited: false,
            authenticated: true,
            inputValid: emailValid,
            corsValid,
            headers: securityHeaders,
          };
        },
        expectedMaxTime: 5, // Should take less than 5ms for complete stack
        iterations: 1000,
        warmupIterations: 100,
      };

      const result = await benchmark.runBenchmark(fullStackBenchmark);
      expect(result.passed).toBe(true);
      expect(result.averageTime).toBeLessThan(5);
      expect(result.throughput).toBeGreaterThan(200); // At least 200 full stack processes/sec
    });
  });

  describe('Performance Regression Tests', () => {
    it('should ensure security middleware does not degrade performance beyond 10% overhead', async () => {
      // Benchmark without security middleware
      const baselineBenchmark: PerformanceBenchmark = {
        name: 'Baseline Request Processing',
        operation: async () => {
          // Simulate basic request processing without security
          const request = { url: '/api/test', method: 'GET' };
          return { status: 200, data: 'OK' };
        },
        expectedMaxTime: 1,
        iterations: 1000,
        warmupIterations: 100,
      };

      const baselineResult = await benchmark.runBenchmark(baselineBenchmark);

      // Benchmark with security middleware
      const secureRequestBenchmark: PerformanceBenchmark = {
        name: 'Secure Request Processing',
        operation: async () => {
          // Simulate request processing with security middleware
          await new Promise(resolve => setTimeout(resolve, 0.05)); // Simulate security overhead
          const request = { url: '/api/test', method: 'GET' };
          return { status: 200, data: 'OK' };
        },
        expectedMaxTime: baselineResult.averageTime * 1.1, // Allow 10% overhead
        iterations: 1000,
        warmupIterations: 100,
      };

      const secureResult = await benchmark.runBenchmark(secureRequestBenchmark);
      
      // Security overhead should not exceed 10%
      const overhead = ((secureResult.averageTime - baselineResult.averageTime) / baselineResult.averageTime) * 100;
      console.log(`Security overhead: ${overhead.toFixed(2)}%`);
      
      expect(overhead).toBeLessThan(10);
      expect(secureResult.passed).toBe(true);
    });
  });

  afterAll(async () => {
    // Generate and log performance report
    const report = benchmark.generateReport();
    console.log('\n' + report);
    
    // Save report to file
    const fs = require('fs').promises;
    const path = require('path');
    const reportsDir = path.join(process.cwd(), 'security-reports', 'performance');
    await fs.mkdir(reportsDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(reportsDir, `security-performance-${timestamp}.md`);
    await fs.writeFile(reportPath, report);
    
    console.log(`Performance report saved to: ${reportPath}`);
  });
});