import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';

export interface PasswordHashOptions {
  rounds?: number;
  pepper?: string;
}

export interface PasswordValidationResult {
  isValid: boolean;
  strength: 'weak' | 'medium' | 'strong' | 'very-strong';
  issues: string[];
  recommendations: string[];
}

export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  requireUppercase: boolean;
  requireLowercase: boolean;
  requireNumbers: boolean;
  requireSpecialChars: boolean;
  preventCommonPasswords: boolean;
  preventPersonalInfo: boolean;
}

@Injectable()
export class PasswordService {
  private readonly defaultSaltRounds: number;
  private readonly pepper: string;
  private readonly passwordPolicy: PasswordPolicy;
  private readonly commonPasswords: Set<string>;

  constructor(private configService: ConfigService) {
    this.defaultSaltRounds = this.configService.get<number>('PASSWORD_SALT_ROUNDS', 12);
    this.pepper = this.configService.get<string>('PASSWORD_PEPPER', '');
    
    this.passwordPolicy = {
      minLength: this.configService.get<number>('PASSWORD_MIN_LENGTH', 8),
      maxLength: this.configService.get<number>('PASSWORD_MAX_LENGTH', 128),
      requireUppercase: this.configService.get<boolean>('PASSWORD_REQUIRE_UPPERCASE', true),
      requireLowercase: this.configService.get<boolean>('PASSWORD_REQUIRE_LOWERCASE', true),
      requireNumbers: this.configService.get<boolean>('PASSWORD_REQUIRE_NUMBERS', true),
      requireSpecialChars: this.configService.get<boolean>('PASSWORD_REQUIRE_SPECIAL', true),
      preventCommonPasswords: this.configService.get<boolean>('PASSWORD_PREVENT_COMMON', true),
      preventPersonalInfo: this.configService.get<boolean>('PASSWORD_PREVENT_PERSONAL', true),
    };

    // Initialize common passwords list (in production, load from external file)
    this.commonPasswords = new Set([
      'password', '123456', '123456789', 'qwerty', 'abc123', 'password123',
      'admin', 'letmein', 'welcome', 'monkey', '1234567890', 'password1',
      'qwerty123', 'dragon', 'master', 'hello', 'login', 'welcome123',
      'guest', 'admin123', 'root', 'toor', 'pass', 'test', 'user'
    ]);
  }

  /**
   * Hash a password with salt and optional pepper
   */
  async hashPassword(password: string, options?: PasswordHashOptions): Promise<string> {
    if (!password) {
      throw new Error('Password cannot be empty');
    }

    // Validate password before hashing
    const validation = this.validatePassword(password);
    if (!validation.isValid) {
      throw new Error(`Password validation failed: ${validation.issues.join(', ')}`);
    }

    const saltRounds = options?.rounds || this.defaultSaltRounds;
    const pepper = options?.pepper || this.pepper;

    // Add pepper if configured
    const pepperedPassword = pepper ? password + pepper : password;

    try {
      const hash = await bcrypt.hash(pepperedPassword, saltRounds);
      return hash;
    } catch (error) {
      throw new Error(`Password hashing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify a password against a hash
   */
  async verifyPassword(password: string, hash: string, pepper?: string): Promise<boolean> {
    if (!password || !hash) {
      return false;
    }

    try {
      const usePepper = pepper || this.pepper;
      const pepperedPassword = usePepper ? password + usePepper : password;
      
      return await bcrypt.compare(pepperedPassword, hash);
    } catch (error) {
      // Log error but don't expose details
      console.error('Password verification error:', error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Validate password against policy
   */
  validatePassword(password: string, userInfo?: any): PasswordValidationResult {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let strength: PasswordValidationResult['strength'] = 'weak';

    // Length validation
    if (password.length < this.passwordPolicy.minLength) {
      issues.push(`Password must be at least ${this.passwordPolicy.minLength} characters long`);
    }
    if (password.length > this.passwordPolicy.maxLength) {
      issues.push(`Password must not exceed ${this.passwordPolicy.maxLength} characters`);
    }

    // Character requirements
    if (this.passwordPolicy.requireUppercase && !/[A-Z]/.test(password)) {
      issues.push('Password must contain at least one uppercase letter');
    }
    if (this.passwordPolicy.requireLowercase && !/[a-z]/.test(password)) {
      issues.push('Password must contain at least one lowercase letter');
    }
    if (this.passwordPolicy.requireNumbers && !/\d/.test(password)) {
      issues.push('Password must contain at least one number');
    }
    if (this.passwordPolicy.requireSpecialChars && !/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      issues.push('Password must contain at least one special character');
    }

    // Common password check
    if (this.passwordPolicy.preventCommonPasswords && this.commonPasswords.has(password.toLowerCase())) {
      issues.push('Password is too common and easily guessable');
    }

    // Personal information check
    if (this.passwordPolicy.preventPersonalInfo && userInfo) {
      const personalFields = [userInfo.firstName, userInfo.lastName, userInfo.email, userInfo.username]
        .filter(Boolean)
        .map(field => field.toLowerCase());
      
      const passwordLower = password.toLowerCase();
      for (const field of personalFields) {
        if (passwordLower.includes(field) || field.includes(passwordLower)) {
          issues.push('Password should not contain personal information');
          break;
        }
      }
    }

    // Calculate strength
    strength = this.calculatePasswordStrength(password);

    // Generate recommendations
    if (strength === 'weak' || strength === 'medium') {
      recommendations.push('Consider using a longer password with mixed character types');
    }
    if (!/[A-Z].*[A-Z]/.test(password)) {
      recommendations.push('Consider adding more uppercase letters');
    }
    if (!/\d.*\d/.test(password)) {
      recommendations.push('Consider adding more numbers');
    }
    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?].*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
      recommendations.push('Consider adding more special characters');
    }

    return {
      isValid: issues.length === 0,
      strength,
      issues,
      recommendations
    };
  }

  /**
   * Generate a secure random password
   */
  generateSecurePassword(length = 16): string {
    if (length < 8 || length > 128) {
      throw new Error('Password length must be between 8 and 128 characters');
    }

    const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lowercase = 'abcdefghijklmnopqrstuvwxyz';
    const numbers = '0123456789';
    const specialChars = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    
    let password = '';
    let allChars = '';

    // Ensure at least one character from each required type
    if (this.passwordPolicy.requireUppercase) {
      password += uppercase[Math.floor(Math.random() * uppercase.length)];
      allChars += uppercase;
    }
    if (this.passwordPolicy.requireLowercase) {
      password += lowercase[Math.floor(Math.random() * lowercase.length)];
      allChars += lowercase;
    }
    if (this.passwordPolicy.requireNumbers) {
      password += numbers[Math.floor(Math.random() * numbers.length)];
      allChars += numbers;
    }
    if (this.passwordPolicy.requireSpecialChars) {
      password += specialChars[Math.floor(Math.random() * specialChars.length)];
      allChars += specialChars;
    }

    // Fill remaining length with random characters
    for (let i = password.length; i < length; i++) {
      password += allChars[Math.floor(Math.random() * allChars.length)];
    }

    // Shuffle the password to avoid predictable patterns
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Check if password needs rehashing (due to changed salt rounds)
   */
  async needsRehash(hash: string, rounds?: number): Promise<boolean> {
    const targetRounds = rounds || this.defaultSaltRounds;
    
    try {
      // Bcrypt hash format: $2b$rounds$salt+hash
      const hashParts = hash.split('$');
      if (hashParts.length < 4 || hashParts[0] !== '' || !hashParts[1].startsWith('2')) {
        return true; // Invalid format, needs rehashing
      }
      
      const hashRounds = parseInt(hashParts[2]);
      return isNaN(hashRounds) || hashRounds < targetRounds;
    } catch {
      // If we can't parse the hash, assume it needs rehashing
      return true;
    }
  }

  /**
   * Safely update password hash if needed
   */
  async rehashPasswordIfNeeded(password: string, currentHash: string): Promise<string | null> {
    if (await this.needsRehash(currentHash)) {
      return await this.hashPassword(password);
    }
    return null;
  }

  /**
   * Get current password policy
   */
  getPasswordPolicy(): PasswordPolicy {
    return { ...this.passwordPolicy };
  }

  /**
   * Calculate password strength score
   */
  private calculatePasswordStrength(password: string): PasswordValidationResult['strength'] {
    let score = 0;

    // Length scoring
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (password.length >= 16) score += 1;

    // Character type scoring
    if (/[a-z]/.test(password)) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) score += 1;

    // Pattern scoring
    if (!/(.)\1{2,}/.test(password)) score += 1; // No repeated characters
    if (!/012|123|234|345|456|567|678|789|890|abc|bcd|cde|def/.test(password.toLowerCase())) score += 1; // No sequences

    // Convert score to strength
    if (score <= 3) return 'weak';
    if (score <= 5) return 'medium';
    if (score <= 7) return 'strong';
    return 'very-strong';
  }
}