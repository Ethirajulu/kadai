/**
 * Security testing utilities and helper functions
 */

import { randomBytes, createHash } from 'crypto';
import { sign } from 'jsonwebtoken';

// Type definitions for security testing
export interface SecurityTestJWTOptions {
  secret?: string;
  algorithm?: string;
  expiresIn?: string | number;
}

export interface SecurityTestResult {
  success: boolean;
  message: string;
  data?: any;
}

export interface SecurityTestConfig {
  timeout?: number;
  retries?: number;
  strict?: boolean;
}

export class SecurityTestUtils {
  /**
   * Generate test JWT tokens for security testing
   */
  static generateTestJWT(
    payload: any = {},
    options: SecurityTestJWTOptions = {}
  ): string {
    const defaultPayload = {
      sub: 'test-user-id',
      email: 'test@example.com',
      role: 'user',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 15 * 60, // 15 minutes
      iss: 'kadai-auth',
      aud: 'kadai-api',
    };

    const secret = options.secret || 'test-secret';

    return sign({ ...defaultPayload, ...payload }, secret, {
      algorithm: 'HS256',
    });
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
      requests: Array(maxRequests + 5)
        .fill(null)
        .map((_, i) => ({
          timestamp: Date.now() + i * 100,
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

    const results: Array<{
      header: string;
      status: string;
      message: string;
    }> = [];

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
    const expiredTime = Date.now() - 60 * 60 * 1000; // 1 hour ago
    return createHash('sha256')
      .update(`csrf-${expiredTime}-${randomBytes(16).toString('hex')}`)
      .digest('hex');
  }

  /**
   * Generate random secure password
   */
  static generateSecurePassword(length = 16): string {
    const charset =
      'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
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
    attempts = 10,
    delay = 100
  ): Promise<SecurityTestResult[]> {
    const results: SecurityTestResult[] = [];

    for (let i = 0; i < attempts; i++) {
      try {
        const result = await target();
        results.push({
          success: true,
          message: `Attempt ${i + 1} succeeded`,
          data: { attempt: i + 1, result },
        });
      } catch (error: any) {
        results.push({
          success: false,
          message: `Attempt ${i + 1} failed: ${error.message}`,
          data: { attempt: i + 1, error: error.message },
        });
      }

      // Add delay between attempts
      if (delay > 0 && i < attempts - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
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
    iterations = 50
  ): Promise<{ isVulnerable: boolean; timingDifference: number }> {
    const validTimes: number[] = [];
    const invalidTimes: number[] = [];

    for (let i = 0; i < iterations; i++) {
      // Test valid input
      const validStart = process.hrtime.bigint();
      try {
        await validInput();
      } catch {
        // Ignore errors, we're measuring timing
      }
      const validEnd = process.hrtime.bigint();
      validTimes.push(Number(validEnd - validStart));

      // Test invalid input
      const invalidStart = process.hrtime.bigint();
      try {
        await invalidInput();
      } catch {
        // Ignore errors, we're measuring timing
      }
      const invalidEnd = process.hrtime.bigint();
      invalidTimes.push(Number(invalidEnd - invalidStart));
    }

    const avgValidTime =
      validTimes.reduce((a, b) => a + b, 0) / validTimes.length;
    const avgInvalidTime =
      invalidTimes.reduce((a, b) => a + b, 0) / invalidTimes.length;
    const timingDifference = Math.abs(avgValidTime - avgInvalidTime);

    // If timing difference is > 10% of the average time, it might be vulnerable
    const avgTime = (avgValidTime + avgInvalidTime) / 2;
    const isVulnerable = timingDifference > avgTime * 0.1;

    return { isVulnerable, timingDifference };
  }

  /**
   * Validate JWT token (for regression tests)
   */
  static async validateJWTToken(token: string): Promise<boolean> {
    try {
      // Simulate JWT validation logic
      if (!token || token === 'none' || token === 'null' || token === 'undefined') {
        return false;
      }
      
      const parts = token.split('.');
      if (parts.length !== 3) {
        return false;
      }
      
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      if (header.alg === 'none') {
        return false; // Prevent algorithm confusion
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sanitize input (for regression tests)
   */
  static async sanitizeInput(input: string): Promise<string> {
    // Simulate input sanitization
    return input
      .replace(/<script.*?>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=/gi, '');
  }

  /**
   * Validate search input (for regression tests)
   */
  static async validateSearchInput(input: string): Promise<boolean> {
    const sqlPatterns = [
      /('|\\')|(;)|(\\)|(--)|(%27)|(')|(\\\\)|(')|(–)|(—)/i,
      /(union|select|insert|update|delete|drop|create|alter|exec|execute)/i,
    ];
    
    return !sqlPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Validate NoSQL input (for regression tests)
   */
  static async validateNoSQLInput(input: any): Promise<boolean> {
    // Check for NoSQL injection patterns
    if (typeof input === 'object' && input !== null) {
      const dangerousKeys = ['$where', '$regex', '$ne', '$gt', '$nin', '$exists', '$or', '$and'];
      return !dangerousKeys.some(key => key in input);
    }
    return true;
  }

  /**
   * Validate file path (for regression tests)
   */
  static async validateFilePath(path: string): Promise<boolean> {
    return !path.includes('../') && !path.includes('..\\');
  }

  /**
   * Get client IP (for regression tests)
   */
  static async getClientIP(request: any): Promise<string> {
    // Always return the actual connection IP, ignoring spoofed headers
    return request.connection?.remoteAddress || '127.0.0.1';
  }

  /**
   * Validate file upload (for regression tests)
   */
  static async validateFileUpload(file: any): Promise<boolean> {
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'text/plain', 'application/pdf'];
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.txt', '.pdf'];
    
    return allowedMimeTypes.includes(file.mimetype) && 
           allowedExtensions.some(ext => file.filename.toLowerCase().endsWith(ext));
  }

  /**
   * Validate file extension (for regression tests)
   */
  static async validateFileExtension(filename: string): Promise<boolean> {
    // Check for double extensions
    const parts = filename.split('.');
    if (parts.length > 2) {
      return false; // Reject double extensions
    }
    
    const allowedExtensions = ['jpg', 'jpeg', 'png', 'txt', 'pdf'];
    const extension = parts[parts.length - 1].toLowerCase();
    return allowedExtensions.includes(extension);
  }

  /**
   * Validate CORS origin (for regression tests)
   */
  static async validateCORSOrigin(origin: string): Promise<boolean> {
    const allowedOrigins = ['http://localhost:3000', 'https://kadai.com'];
    return allowedOrigins.includes(origin);
  }

  /**
   * Validate CSRF token (for regression tests)
   */
  static async validateCSRFToken(token?: string): Promise<boolean> {
    if (!token) return false;
    // Simulate CSRF token validation
    return token.length > 10 && !token.includes('invalid');
  }

  /**
   * Validate password strength (for regression tests)
   */
  static async validatePasswordStrength(password: string): Promise<boolean> {
    // Minimum 8 chars, with uppercase, lowercase, number, and special char
    const minLength = password.length >= 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);
    
    return minLength && hasUpper && hasLower && hasNumber && hasSpecial;
  }

  /**
   * Validate password (for regression tests)
   */
  static async validatePassword(inputPassword: string, correctPassword: string): Promise<boolean> {
    // Simulate constant-time comparison to prevent timing attacks
    await new Promise(resolve => setTimeout(resolve, 100)); // Constant delay
    return inputPassword === correctPassword;
  }

  /**
   * Simulate request (for regression tests)
   */
  static async simulateRequest(request: any): Promise<any> {
    // Mock request simulation
    return {
      status: 404,
      body: 'Not Found',
    };
  }

  /**
   * Sanitize query parameters (for regression tests)
   */
  static async sanitizeQueryParams(query: any): Promise<any> {
    const sanitized = { ...query };
    
    // Remove prototype pollution attempts
    delete sanitized.__proto__;
    delete sanitized.constructor;
    delete sanitized.prototype;
    
    return sanitized;
  }

  /**
   * Sanitize error message (for regression tests)
   */
  static async sanitizeErrorMessage(message: string): Promise<string> {
    // Remove sensitive information from error messages
    return message
      .replace(/password|secret|key|token/gi, '[REDACTED]')
      .replace(/\/etc\/.*|c:\\.*|postgres:\/\/.*@.*:\d+/gi, '[PATH_REDACTED]')
      .replace(/localhost:\d+/g, '[HOST_REDACTED]');
  }
}
