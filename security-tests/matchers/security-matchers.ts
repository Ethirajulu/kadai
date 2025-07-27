/**
 * Custom Jest matchers for security testing
 */

interface SecurityTestResult {
  pass: boolean;
  message: () => string;
}

export const securityMatchers = {
  /**
   * Validates that a JWT token has the correct structure and claims
   */
  toBeValidJWTToken(received: string, expectedClaims?: Record<string, any>): SecurityTestResult {
    const jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
    
    if (!jwtRegex.test(received)) {
      return {
        pass: false,
        message: () => `Expected ${received} to be a valid JWT token format`,
      };
    }
    
    try {
      const parts = received.split('.');
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      
      // Check for required JWT claims
      const requiredClaims = ['sub', 'iat', 'exp'];
      for (const claim of requiredClaims) {
        if (!payload[claim]) {
          return {
            pass: false,
            message: () => `JWT token missing required claim: ${claim}`,
          };
        }
      }
      
      // Check expected claims if provided
      if (expectedClaims) {
        for (const [key, value] of Object.entries(expectedClaims)) {
          if (payload[key] !== value) {
            return {
              pass: false,
              message: () => `JWT claim ${key} expected ${value} but got ${payload[key]}`,
            };
          }
        }
      }
      
      return {
        pass: true,
        message: () => `JWT token is valid`,
      };
    } catch (error) {
      return {
        pass: false,
        message: () => `JWT token has invalid payload: ${error.message}`,
      };
    }
  },

  /**
   * Validates that a response includes required security headers
   */
  toHaveSecurityHeaders(received: any, customHeaders?: string[]): SecurityTestResult {
    const headers = received.headers || received.getHeaders?.() || {};
    const headerNames = Object.keys(headers).map(h => h.toLowerCase());
    
    const requiredHeaders = [
      'x-frame-options',
      'x-content-type-options',
      'x-xss-protection',
      'strict-transport-security',
      ...(customHeaders || [])
    ];
    
    const missingHeaders = requiredHeaders.filter(
      header => !headerNames.includes(header.toLowerCase())
    );
    
    if (missingHeaders.length > 0) {
      return {
        pass: false,
        message: () => `Response missing security headers: ${missingHeaders.join(', ')}`,
      };
    }
    
    return {
      pass: true,
      message: () => `Response has all required security headers`,
    };
  },

  /**
   * Validates that a response is properly rate limited
   */
  toBeRateLimited(received: any): SecurityTestResult {
    const status = received.status || received.statusCode;
    const headers = received.headers || received.getHeaders?.() || {};
    
    if (status !== 429) {
      return {
        pass: false,
        message: () => `Expected rate limit response (429) but got ${status}`,
      };
    }
    
    // Check for rate limit headers
    const rateLimitHeaders = [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after'
    ];
    
    const hasRateLimitHeaders = rateLimitHeaders.some(
      header => headers[header] || headers[header.toLowerCase()]
    );
    
    if (!hasRateLimitHeaders) {
      return {
        pass: false,
        message: () => `Rate limit response missing rate limit headers`,
      };
    }
    
    return {
      pass: true,
      message: () => `Response is properly rate limited`,
    };
  },

  /**
   * Validates that input sanitization prevents XSS attacks
   */
  toPreventXSS(received: string, originalInput: string): SecurityTestResult {
    const xssPatterns = [
      /<script.*?>.*?<\/script>/gi,
      /javascript:/gi,
      /onload=/gi,
      /onerror=/gi,
      /onclick=/gi,
      /<iframe.*?>/gi,
      /<object.*?>/gi,
      /<embed.*?>/gi,
    ];
    
    const hasXSSPattern = xssPatterns.some(pattern => pattern.test(received));
    
    if (hasXSSPattern) {
      return {
        pass: false,
        message: () => `Output contains potential XSS: ${received}`,
      };
    }
    
    // Check if dangerous input was properly escaped/removed
    if (originalInput.includes('<script>') && received.includes('<script>')) {
      return {
        pass: false,
        message: () => `XSS payload was not properly sanitized`,
      };
    }
    
    return {
      pass: true,
      message: () => `Input was properly sanitized against XSS`,
    };
  },

  /**
   * Validates that SQL injection is prevented
   */
  toPreventSQLInjection(queryResult: any, maliciousInput: string): SecurityTestResult {
    // Check if malicious SQL keywords are present in the result
    const sqlKeywords = [
      'DROP TABLE',
      'DELETE FROM',
      'INSERT INTO',
      'UPDATE SET',
      'UNION SELECT',
      'OR 1=1',
      "'; --",
      '" OR ""="',
    ];
    
    const resultString = JSON.stringify(queryResult).toUpperCase();
    
    const hasSQLInjection = sqlKeywords.some(keyword => 
      resultString.includes(keyword.toUpperCase())
    );
    
    if (hasSQLInjection) {
      return {
        pass: false,
        message: () => `Query result suggests SQL injection vulnerability`,
      };
    }
    
    return {
      pass: true,
      message: () => `Query properly prevents SQL injection`,
    };
  },

  /**
   * Validates that passwords meet security requirements
   */
  toMeetPasswordRequirements(received: string): SecurityTestResult {
    const requirements = {
      minLength: received.length >= 8,
      hasUppercase: /[A-Z]/.test(received),
      hasLowercase: /[a-z]/.test(received),
      hasNumbers: /\d/.test(received),
      hasSpecialChars: /[!@#$%^&*(),.?":{}|<>]/.test(received),
    };
    
    const failedRequirements = Object.entries(requirements)
      .filter(([_, passed]) => !passed)
      .map(([requirement]) => requirement);
    
    if (failedRequirements.length > 0) {
      return {
        pass: false,
        message: () => `Password fails requirements: ${failedRequirements.join(', ')}`,
      };
    }
    
    return {
      pass: true,
      message: () => `Password meets all security requirements`,
    };
  },

  /**
   * Validates that CORS is properly configured
   */
  toHaveValidCORS(received: any, allowedOrigins?: string[]): SecurityTestResult {
    const headers = received.headers || received.getHeaders?.() || {};
    const corsHeaders = {
      'access-control-allow-origin': headers['access-control-allow-origin'],
      'access-control-allow-methods': headers['access-control-allow-methods'],
      'access-control-allow-headers': headers['access-control-allow-headers'],
    };
    
    // Check if CORS headers are present
    if (!corsHeaders['access-control-allow-origin']) {
      return {
        pass: false,
        message: () => `Response missing CORS headers`,
      };
    }
    
    // Validate allowed origins if specified
    if (allowedOrigins) {
      const allowedOrigin = corsHeaders['access-control-allow-origin'];
      if (allowedOrigin === '*' && allowedOrigins.length > 0) {
        return {
          pass: false,
          message: () => `CORS should not allow all origins (*)`,
        };
      }
      
      if (!allowedOrigins.includes(allowedOrigin)) {
        return {
          pass: false,
          message: () => `CORS origin ${allowedOrigin} not in allowed list`,
        };
      }
    }
    
    return {
      pass: true,
      message: () => `CORS is properly configured`,
    };
  },

  /**
   * Validates that sensitive data is not exposed in responses
   */
  toNotExposeSensitiveData(received: any): SecurityTestResult {
    const sensitiveFields = [
      'password',
      'secret',
      'private_key',
      'access_token',
      'refresh_token',
      'api_key',
      'database_url',
      'connection_string',
    ];
    
    const responseString = JSON.stringify(received).toLowerCase();
    
    const exposedFields = sensitiveFields.filter(field => 
      responseString.includes(field)
    );
    
    if (exposedFields.length > 0) {
      return {
        pass: false,
        message: () => `Response exposes sensitive fields: ${exposedFields.join(', ')}`,
      };
    }
    
    return {
      pass: true,
      message: () => `Response does not expose sensitive data`,
    };
  },

  /**
   * Validates that file uploads are secure
   */
  toBeSecureFileUpload(received: any): SecurityTestResult {
    const { filename, mimetype, size } = received;
    
    // Check file extension
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.pdf', '.txt'];
    const fileExtension = filename ? filename.toLowerCase().split('.').pop() : '';
    
    if (!allowedExtensions.includes(`.${fileExtension}`)) {
      return {
        pass: false,
        message: () => `File extension .${fileExtension} not allowed`,
      };
    }
    
    // Check MIME type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'text/plain',
    ];
    
    if (!allowedMimeTypes.includes(mimetype)) {
      return {
        pass: false,
        message: () => `MIME type ${mimetype} not allowed`,
      };
    }
    
    // Check file size (10MB max)
    const maxSize = 10 * 1024 * 1024;
    if (size > maxSize) {
      return {
        pass: false,
        message: () => `File size ${size} exceeds maximum ${maxSize}`,
      };
    }
    
    return {
      pass: true,
      message: () => `File upload is secure`,
    };
  },
};

// Add matchers to Jest
expect.extend(securityMatchers);