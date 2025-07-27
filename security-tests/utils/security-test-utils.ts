/**
 * Security testing utilities and helper functions
 */

import { randomBytes, createHash } from 'crypto';
import { sign, verify } from 'jsonwebtoken';

export class SecurityTestUtils {
  /**
   * Generate test JWT tokens for security testing
   */
  static generateTestJWT(payload: any = {}, options: any = {}): string {
    const defaultPayload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (15 * 60), // 15 minutes
      iss: 'kadai-auth',
      aud: 'kadai-api',
    };

    const secret = options.secret || 'test-secret';
    const algorithm = options.algorithm || 'HS256';

    return sign(
      { ...defaultPayload, ...payload },
      secret,
      { algorithm }
    );
  }

  /**
   * Generate expired JWT token for testing
   */
  static generateExpiredJWT(payload: any = {}): string {
    const expiredPayload = {
      ...payload,
      iat: Math.floor(Date.now() / 1000) - 3600, // 1 hour ago
      exp: Math.floor(Date.now() / 1000) - 1800, // 30 minutes ago
    };

    return this.generateTestJWT(expiredPayload);
  }

  /**
   * Generate malformed JWT token for testing
   */
  static generateMalformedJWT(): string {
    return 'invalid.jwt.token.format';
  }

  /**
   * Generate XSS attack payloads
   */
  static getXSSPayloads(): string[] {
    return [
      '<script>alert("XSS")</script>',
      '<img src="x" onerror="alert(\'XSS\')">',
      '<svg onload="alert(\'XSS\')">',
      'javascript:alert("XSS")',
      '<iframe src="javascript:alert(\'XSS\')"></iframe>',
      '<body onload="alert(\'XSS\')">',
      '<input type="image" src="x" onerror="alert(\'XSS\')">',
      '<link rel="stylesheet" href="javascript:alert(\'XSS\')">',
      '<meta http-equiv="refresh" content="0;url=javascript:alert(\'XSS\')">',
      '"><script>alert("XSS")</script>',
    ];
  }

  /**
   * Generate SQL injection attack payloads
   */
  static getSQLInjectionPayloads(): string[] {
    return [
      "'; DROP TABLE users; --",
      "' OR '1'='1",
      "' OR 1=1 --",
      "' UNION SELECT * FROM users --",
      "'; DELETE FROM users; --",
      "' OR '1'='1' /*",
      "admin'; --",
      "' OR 'a'='a",
      "' OR 1=1#",
      "1' OR '1'='1",
    ];
  }

  /**
   * Generate NoSQL injection attack payloads
   */
  static getNoSQLInjectionPayloads(): any[] {
    return [
      { $where: 'function() { return true; }' },
      { $regex: '.*' },
      { $ne: null },
      { $gt: '' },
      { $nin: [] },
      { $exists: true },
      { $or: [{ password: { $regex: '.*' } }] },
      { $and: [{ $where: 'this.password.length > 0' }] },
    ];
  }

  /**
   * Generate path traversal attack payloads
   */
  static getPathTraversalPayloads(): string[] {
    return [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
      '....//....//....//etc/passwd',
      '..%2F..%2F..%2Fetc%2Fpasswd',
      '..%252F..%252F..%252Fetc%252Fpasswd',
      '%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd',
      '..%c0%af..%c0%af..%c0%afetc%c0%afpasswd',
      '..\\..\\..\\windows\\win.ini',
    ];
  }

  /**
   * Generate command injection attack payloads
   */
  static getCommandInjectionPayloads(): string[] {
    return [
      '; cat /etc/passwd',
      '| cat /etc/passwd',
      '& cat /etc/passwd',
      '&& cat /etc/passwd',
      '|| cat /etc/passwd',
      '`cat /etc/passwd`',
      '$(cat /etc/passwd)',
      '; ls -la',
      '| whoami',
      '&& id',
    ];
  }

  /**
   * Generate weak passwords for testing
   */
  static getWeakPasswords(): string[] {
    return [
      '123456',
      'password',
      'admin',
      'qwerty',
      'abc123',
      '12345678',
      'password123',
      'admin123',
      '',
      ' ',
    ];
  }

  /**
   * Generate strong passwords for testing
   */
  static getStrongPasswords(): string[] {
    return [
      'Str0ng!P@ssw0rd',
      'MySecure#Pass123',
      'C0mplex$Password!',
      'Un1que&Strong9',
      'S3cur3*P@ssw0rd',
    ];
  }

  /**
   * Generate test rate limit scenarios
   */
  static generateRateLimitTest(maxRequests: number, windowMs: number) {
    return {
      maxRequests,
      windowMs,
      requests: Array(maxRequests + 5).fill(null).map((_, i) => ({
        timestamp: Date.now() + (i * 100),
        shouldPass: i < maxRequests,
      })),
    };
  }

  /**
   * Generate malicious file upload payloads
   */
  static getMaliciousFilePayloads() {
    return [
      {
        filename: 'malicious.exe',
        mimetype: 'application/x-executable',
        content: Buffer.from('MZ\x90\x00'), // PE header
      },
      {
        filename: 'script.php',
        mimetype: 'application/x-php',
        content: Buffer.from('<?php system($_GET["cmd"]); ?>'),
      },
      {
        filename: 'test.js',
        mimetype: 'application/javascript',
        content: Buffer.from('alert("XSS")'),
      },
      {
        filename: '../../../etc/passwd',
        mimetype: 'text/plain',
        content: Buffer.from('root:x:0:0:root:/root:/bin/bash'),
      },
      {
        filename: 'huge-file.txt',
        mimetype: 'text/plain',
        content: Buffer.alloc(100 * 1024 * 1024), // 100MB
      },
    ];
  }

  /**
   * Generate CORS attack scenarios
   */
  static getCORSAttackScenarios() {
    return [
      {
        origin: 'https://evil.com',
        expectedBlocked: true,
      },
      {
        origin: 'null',
        expectedBlocked: true,
      },
      {
        origin: 'data:text/html,<script>alert("XSS")</script>',
        expectedBlocked: true,
      },
      {
        origin: 'https://trusted-domain.com.evil.com',
        expectedBlocked: true,
      },
      {
        origin: '*',
        expectedBlocked: true, // Should not allow wildcard with credentials
      },
    ];
  }

  /**
   * Generate CSRF attack scenarios
   */
  static getCSRFAttackScenarios() {
    return [
      {
        description: 'Missing CSRF token',
        headers: {},
        shouldFail: true,
      },
      {
        description: 'Invalid CSRF token',
        headers: { 'x-csrf-token': 'invalid-token' },
        shouldFail: true,
      },
      {
        description: 'Expired CSRF token',
        headers: { 'x-csrf-token': this.generateExpiredCSRFToken() },
        shouldFail: true,
      },
      {
        description: 'Valid CSRF token',
        headers: { 'x-csrf-token': this.generateValidCSRFToken() },
        shouldFail: false,
      },
    ];
  }

  /**
   * Generate session fixation attack scenarios
   */
  static getSessionFixationScenarios() {
    return [
      {
        description: 'Reuse session ID after login',
        sessionId: 'fixed-session-id',
        shouldRegenerateSession: true,
      },
      {
        description: 'Session ID prediction',
        sessionId: 'predictable-session-123',
        shouldBeUnpredictable: true,
      },
    ];
  }

  /**
   * Validate security headers in response
   */
  static validateSecurityHeaders(headers: Record<string, string>) {
    const requiredHeaders = {
      'x-frame-options': ['DENY', 'SAMEORIGIN'],
      'x-content-type-options': ['nosniff'],
      'x-xss-protection': ['1; mode=block', '0'],
      'strict-transport-security': /^max-age=\d+/,
      'content-security-policy': /.+/,
    };

    const results = [];

    for (const [header, expectedValues] of Object.entries(requiredHeaders)) {
      const headerValue = headers[header] || headers[header.toLowerCase()];
      
      if (!headerValue) {
        results.push({
          header,
          status: 'missing',
          message: `Missing required security header: ${header}`,
        });
      } else if (Array.isArray(expectedValues)) {
        if (!expectedValues.includes(headerValue)) {
          results.push({
            header,
            status: 'invalid',
            message: `Invalid value for ${header}: ${headerValue}`,
          });
        } else {
          results.push({
            header,
            status: 'valid',
            message: `Valid security header: ${header}`,
          });
        }
      } else if (expectedValues instanceof RegExp) {
        if (!expectedValues.test(headerValue)) {
          results.push({
            header,
            status: 'invalid',
            message: `Invalid format for ${header}: ${headerValue}`,
          });
        } else {
          results.push({
            header,
            status: 'valid',
            message: `Valid security header: ${header}`,
          });
        }
      }
    }

    return results;
  }

  /**
   * Generate CSRF token for testing
   */
  private static generateValidCSRFToken(): string {
    return createHash('sha256')
      .update(`csrf-${Date.now()}-${randomBytes(16).toString('hex')}`)
      .digest('hex');
  }

  /**
   * Generate expired CSRF token for testing
   */
  private static generateExpiredCSRFToken(): string {
    const expiredTime = Date.now() - (60 * 60 * 1000); // 1 hour ago
    return createHash('sha256')
      .update(`csrf-${expiredTime}-${randomBytes(16).toString('hex')}`)
      .digest('hex');
  }

  /**
   * Generate random secure password
   */
  static generateSecurePassword(length: number = 16): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Simulate brute force attack
   */
  static async simulateBruteForceAttack(
    target: () => Promise<any>,
    attempts: number = 10,
    delay: number = 100
  ): Promise<any[]> {
    const results = [];
    
    for (let i = 0; i < attempts; i++) {
      try {
        const result = await target();
        results.push({ attempt: i + 1, success: true, result });
      } catch (error) {
        results.push({ attempt: i + 1, success: false, error: error.message });
      }
      
      // Add delay between attempts
      if (delay > 0 && i < attempts - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    return results;
  }

  /**
   * Test timing attack resistance
   */
  static async testTimingAttack(
    validInput: () => Promise<any>,
    invalidInput: () => Promise<any>,
    iterations: number = 50
  ): Promise<{ isVulnerable: boolean; timingDifference: number }> {
    const validTimes = [];
    const invalidTimes = [];

    for (let i = 0; i < iterations; i++) {
      // Test valid input
      const validStart = process.hrtime.bigint();
      try {
        await validInput();
      } catch (error) {
        // Ignore errors, we're measuring timing
      }
      const validEnd = process.hrtime.bigint();
      validTimes.push(Number(validEnd - validStart));

      // Test invalid input
      const invalidStart = process.hrtime.bigint();
      try {
        await invalidInput();
      } catch (error) {
        // Ignore errors, we're measuring timing
      }
      const invalidEnd = process.hrtime.bigint();
      invalidTimes.push(Number(invalidEnd - invalidStart));
    }

    const avgValidTime = validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const avgInvalidTime = invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length;
    const timingDifference = Math.abs(avgValidTime - avgInvalidTime);

    // If timing difference is > 10% of the average time, it might be vulnerable
    const avgTime = (avgValidTime + avgInvalidTime) / 2;
    const isVulnerable = timingDifference > (avgTime * 0.1);

    return { isVulnerable, timingDifference };
  }
}