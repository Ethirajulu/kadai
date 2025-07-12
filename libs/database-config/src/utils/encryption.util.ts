import * as crypto from 'crypto';
import { Logger } from '@nestjs/common';

export interface EncryptionConfig {
  algorithm: string;
  keyLength: number;
  ivLength: number;
  saltLength: number;
  iterations: number;
}

export interface EncryptedData {
  data: string;
  iv: string;
  salt: string;
  authTag?: string;
}

export class EncryptionUtil {
  private static readonly logger = new Logger(EncryptionUtil.name);
  
  private static readonly DEFAULT_CONFIG: EncryptionConfig = {
    algorithm: 'aes-256-gcm',
    keyLength: 32,
    ivLength: 16,
    saltLength: 16,
    iterations: 100000
  };

  /**
   * Encrypt sensitive data like connection strings or passwords
   */
  static encrypt(data: string, password: string, config: EncryptionConfig = this.DEFAULT_CONFIG): EncryptedData {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(config.saltLength);
      const iv = crypto.randomBytes(config.ivLength);
      
      // Derive key from password using PBKDF2
      const key = crypto.pbkdf2Sync(password, salt, config.iterations, config.keyLength, 'sha256');
      
      // Create cipher
      const cipher = crypto.createCipher(config.algorithm, key);
      cipher.setAAD(Buffer.from('database-config')); // Additional authenticated data
      
      // Encrypt data
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      // Get authentication tag for GCM mode
      const authTag = cipher.getAuthTag();
      
      return {
        data: encrypted,
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      this.logger.error('Encryption failed:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  /**
   * Decrypt sensitive data
   */
  static decrypt(encryptedData: EncryptedData, password: string, config: EncryptionConfig = this.DEFAULT_CONFIG): string {
    try {
      // Convert hex strings back to buffers
      const salt = Buffer.from(encryptedData.salt, 'hex');
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = encryptedData.authTag ? Buffer.from(encryptedData.authTag, 'hex') : undefined;
      
      // Derive key from password
      const key = crypto.pbkdf2Sync(password, salt, config.iterations, config.keyLength, 'sha256');
      
      // Create decipher
      const decipher = crypto.createDecipher(config.algorithm, key);
      if (authTag) {
        decipher.setAuthTag(authTag);
        decipher.setAAD(Buffer.from('database-config'));
      }
      
      // Decrypt data
      let decrypted = decipher.update(encryptedData.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      this.logger.error('Decryption failed:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  /**
   * Hash passwords securely using bcrypt-like approach
   */
  static async hashPassword(password: string, rounds: number = 12): Promise<string> {
    try {
      const salt = crypto.randomBytes(16);
      const hash = crypto.pbkdf2Sync(password, salt, Math.pow(2, rounds), 64, 'sha256');
      
      // Combine rounds, salt, and hash
      return `${rounds}:${salt.toString('hex')}:${hash.toString('hex')}`;
    } catch (error) {
      this.logger.error('Password hashing failed:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Verify password against hash
   */
  static async verifyPassword(password: string, hash: string): Promise<boolean> {
    try {
      const [roundsStr, saltHex, hashHex] = hash.split(':');
      const rounds = parseInt(roundsStr, 10);
      const salt = Buffer.from(saltHex, 'hex');
      const originalHash = Buffer.from(hashHex, 'hex');
      
      const derivedHash = crypto.pbkdf2Sync(password, salt, Math.pow(2, rounds), 64, 'sha256');
      
      return crypto.timingSafeEqual(originalHash, derivedHash);
    } catch (error) {
      this.logger.error('Password verification failed:', error);
      return false;
    }
  }

  /**
   * Generate secure random password
   */
  static generateSecurePassword(length: number = 32): string {
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, charset.length);
      password += charset[randomIndex];
    }
    
    return password;
  }

  /**
   * Generate secure random token
   */
  static generateSecureToken(bytes: number = 32): string {
    return crypto.randomBytes(bytes).toString('hex');
  }

  /**
   * Hash data for integrity checking
   */
  static hashData(data: string, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(data).digest('hex');
  }

  /**
   * Verify data integrity
   */
  static verifyDataIntegrity(data: string, hash: string, algorithm: string = 'sha256'): boolean {
    const computedHash = this.hashData(data, algorithm);
    return crypto.timingSafeEqual(
      Buffer.from(hash, 'hex'),
      Buffer.from(computedHash, 'hex')
    );
  }

  /**
   * Mask sensitive connection string for logging
   */
  static maskConnectionString(connectionString: string): string {
    // Pattern to match various connection string formats
    const patterns = [
      // MongoDB: mongodb://username:password@host:port/database
      /^(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@.+)$/,
      // PostgreSQL: postgresql://username:password@host:port/database
      /^(postgresql:\/\/[^:]+:)([^@]+)(@.+)$/,
      // Redis: redis://[:password@]host:port[/database]
      /^(redis:\/\/[^:]*:?)([^@]+)(@.+)$/,
      // Generic: protocol://username:password@host
      /^([^:]+:\/\/[^:]+:)([^@]+)(@.+)$/
    ];

    for (const pattern of patterns) {
      if (pattern.test(connectionString)) {
        return connectionString.replace(pattern, '$1***$3');
      }
    }

    // If no pattern matches, just return asterisks for safety
    return '***';
  }

  /**
   * Secure comparison of strings to prevent timing attacks
   */
  static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    const bufferA = Buffer.from(a);
    const bufferB = Buffer.from(b);
    
    return crypto.timingSafeEqual(bufferA, bufferB);
  }

  /**
   * Generate HMAC for message authentication
   */
  static generateHMAC(data: string, secret: string, algorithm: string = 'sha256'): string {
    return crypto.createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Verify HMAC
   */
  static verifyHMAC(data: string, signature: string, secret: string, algorithm: string = 'sha256'): boolean {
    const expectedSignature = this.generateHMAC(data, secret, algorithm);
    return this.secureCompare(signature, expectedSignature);
  }
}