// Import removed as it's not used in this file

/**
 * Password strength meter utility
 */
export class PasswordStrengthMeter {
  /**
   * Calculate detailed password strength metrics
   */
  static calculateDetailedStrength(password: string): {
    score: number;
    feedback: {
      lengthScore: number;
      varietyScore: number;
      patternScore: number;
      entropyScore: number;
    };
    suggestions: string[];
  } {
    const feedback = {
      lengthScore: this.calculateLengthScore(password),
      varietyScore: this.calculateVarietyScore(password),
      patternScore: this.calculatePatternScore(password),
      entropyScore: this.calculateEntropyScore(password),
    };

    const score = Math.round(
      (feedback.lengthScore + feedback.varietyScore + feedback.patternScore + feedback.entropyScore) / 4
    );

    const suggestions = this.generateSuggestions(password, feedback);

    return { score, feedback, suggestions };
  }

  private static calculateLengthScore(password: string): number {
    const length = password.length;
    if (length < 8) return 0;
    if (length < 12) return 40;
    if (length < 16) return 70;
    if (length < 20) return 90;
    return 100;
  }

  private static calculateVarietyScore(password: string): number {
    let score = 0;
    if (/[a-z]/.test(password)) score += 25;
    if (/[A-Z]/.test(password)) score += 25;
    if (/\d/.test(password)) score += 25;
    if (/[^a-zA-Z0-9]/.test(password)) score += 25;
    return score;
  }

  private static calculatePatternScore(password: string): number {
    let score = 100;
    
    // Deduct for common patterns
    if (/(.)\1{2,}/.test(password)) score -= 20; // Repeated characters
    if (/012|123|234|345|456|567|678|789|890/.test(password)) score -= 20; // Sequential numbers
    if (/abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz/.test(password.toLowerCase())) score -= 20; // Sequential letters
    if (/qwerty|asdf|zxcv/.test(password.toLowerCase())) score -= 30; // Keyboard patterns
    if (/^[a-z]+$/i.test(password)) score -= 20; // All same case
    if (/^\d+$/.test(password)) score -= 40; // All numbers

    return Math.max(0, score);
  }

  private static calculateEntropyScore(password: string): number {
    const entropy = this.calculateEntropy(password);
    if (entropy < 28) return 0;
    if (entropy < 36) return 40;
    if (entropy < 60) return 70;
    if (entropy < 128) return 90;
    return 100;
  }

  private static calculateEntropy(password: string): number {
    let charset = 0;
    if (/[a-z]/.test(password)) charset += 26;
    if (/[A-Z]/.test(password)) charset += 26;
    if (/\d/.test(password)) charset += 10;
    if (/[^a-zA-Z0-9]/.test(password)) charset += 32;

    return password.length * Math.log2(charset);
  }

  private static generateSuggestions(password: string, feedback: any): string[] {
    const suggestions: string[] = [];

    if (feedback.lengthScore < 70) {
      suggestions.push('Use at least 12-16 characters for better security');
    }

    if (feedback.varietyScore < 100) {
      if (!/[a-z]/.test(password)) suggestions.push('Add lowercase letters');
      if (!/[A-Z]/.test(password)) suggestions.push('Add uppercase letters');
      if (!/\d/.test(password)) suggestions.push('Add numbers');
      if (!/[^a-zA-Z0-9]/.test(password)) suggestions.push('Add special characters');
    }

    if (feedback.patternScore < 80) {
      suggestions.push('Avoid predictable patterns and sequences');
    }

    if (feedback.entropyScore < 70) {
      suggestions.push('Increase randomness by mixing different character types');
    }

    return suggestions;
  }
}

/**
 * Password breach checking utility (stub for external API integration)
 */
export class PasswordBreachChecker {
  /**
   * Check if password has been found in known data breaches
   * This is a stub - in production, integrate with HaveIBeenPwned API
   */
  static async checkBreach(password: string): Promise<{
    isBreached: boolean;
    breachCount?: number;
    warning?: string;
  }> {
    // Placeholder implementation
    // In production, implement k-anonymity with HaveIBeenPwned API
    const commonBreachedPasswords = [
      'password', '123456', '123456789', 'qwerty', 'abc123',
      'password123', 'admin', 'letmein', 'welcome', 'monkey'
    ];

    const isBreached = commonBreachedPasswords.includes(password.toLowerCase());
    
    return {
      isBreached,
      breachCount: isBreached ? 1000000 : 0,
      warning: isBreached ? 'This password has been found in data breaches and should not be used' : undefined,
    };
  }

  /**
   * Hash password using SHA-1 for k-anonymity check (HaveIBeenPwned)
   * Only first 5 chars of hash are sent to API for privacy
   */
  static async hashForBreachCheck(password: string): Promise<string> {
    const crypto = await import('crypto');
    return crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
  }
}

/**
 * Password transition utilities for migrating from legacy systems
 */
export class PasswordMigrationHelper {
  /**
   * Detect legacy hash format
   */
  static detectHashFormat(hash: string): 'bcrypt' | 'md5' | 'sha1' | 'sha256' | 'unknown' {
    if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
      return 'bcrypt';
    }
    if (hash.length === 32 && /^[a-f0-9]+$/i.test(hash)) {
      return 'md5';
    }
    if (hash.length === 40 && /^[a-f0-9]+$/i.test(hash)) {
      return 'sha1';
    }
    if (hash.length === 64 && /^[a-f0-9]+$/i.test(hash)) {
      return 'sha256';
    }
    return 'unknown';
  }

  /**
   * Verify legacy password hash
   */
  static async verifyLegacyPassword(password: string, hash: string, salt?: string): Promise<boolean> {
    const format = this.detectHashFormat(hash);
    const crypto = await import('crypto');

    switch (format) {
      case 'md5': {
        const md5Hash = crypto.createHash('md5').update(salt ? salt + password : password).digest('hex');
        return md5Hash.toLowerCase() === hash.toLowerCase();
      }
      case 'sha1': {
        const sha1Hash = crypto.createHash('sha1').update(salt ? salt + password : password).digest('hex');
        return sha1Hash.toLowerCase() === hash.toLowerCase();
      }
      case 'sha256': {
        const sha256Hash = crypto.createHash('sha256').update(salt ? salt + password : password).digest('hex');
        return sha256Hash.toLowerCase() === hash.toLowerCase();
      }
        
      default:
        return false;
    }
  }

  /**
   * Generate migration strategy for upgrading password hashes
   */
  static generateMigrationStrategy(currentFormat: string): {
    needsMigration: boolean;
    strategy: 'immediate' | 'gradual' | 'force_reset';
    securityLevel: 'critical' | 'high' | 'medium' | 'low';
    recommendations: string[];
  } {
    const strategies = {
      'md5': {
        needsMigration: true,
        strategy: 'force_reset' as const,
        securityLevel: 'critical' as const,
        recommendations: [
          'MD5 is cryptographically broken',
          'Force password reset for all users',
          'Implement bcrypt with salt rounds >= 12',
        ],
      },
      'sha1': {
        needsMigration: true,
        strategy: 'force_reset' as const,
        securityLevel: 'critical' as const,
        recommendations: [
          'SHA1 is cryptographically broken',
          'Force password reset for all users',
          'Implement bcrypt with salt rounds >= 12',
        ],
      },
      'sha256': {
        needsMigration: true,
        strategy: 'gradual' as const,
        securityLevel: 'high' as const,
        recommendations: [
          'SHA256 without proper key stretching is vulnerable to brute force',
          'Migrate to bcrypt during login',
          'Consider PBKDF2 as intermediate step',
        ],
      },
      'bcrypt': {
        needsMigration: false,
        strategy: 'immediate' as const,
        securityLevel: 'low' as const,
        recommendations: [
          'Bcrypt is secure',
          'Consider increasing salt rounds if < 12',
        ],
      },
    };

    return strategies[currentFormat as keyof typeof strategies] || {
      needsMigration: true,
      strategy: 'force_reset',
      securityLevel: 'critical',
      recommendations: ['Unknown hash format requires immediate attention'],
    };
  }
}

/**
 * Password policy enforcement decorators and validators
 */
export class PasswordPolicyEnforcer {
  /**
   * Create validation decorator for password fields
   */
  static createValidationDecorator() {
    return function (target: any, propertyKey: string) {
      // This would be implemented as a class-validator decorator
      // For now, it's a placeholder for the decorator pattern
      const originalSetter = target[propertyKey];
      
      Object.defineProperty(target, propertyKey, {
        set: function(value: string) {
          // Validation logic would go here
          originalSetter?.call(this, value);
        },
        get: function() {
          return originalSetter;
        },
        configurable: true,
      });
    };
  }

  /**
   * Validate password against multiple policies
   */
  static validateAgainstPolicies(
    password: string,
    policies: any[]
  ): {
    isValid: boolean;
    violations: Array<{ policy: string; issues: string[] }>;
    overallScore: number;
  } {
    const violations: Array<{ policy: string; issues: string[] }> = [];
    let totalScore = 0;

    policies.forEach((policy, index) => {
      const policyName = policy.name || `Policy ${index + 1}`;
      const issues: string[] = [];

      // Implement policy validation logic
      // This is a placeholder for actual policy validation

      if (issues.length > 0) {
        violations.push({ policy: policyName, issues });
      }

      totalScore += policy.weight || 1;
    });

    return {
      isValid: violations.length === 0,
      violations,
      overallScore: totalScore / policies.length,
    };
  }
}