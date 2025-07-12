import { ValidationResult, ValidationError, ValidationRule } from '@kadai/shared-types';
import { ENV_KEYS } from '../constants';

export class ConnectionValidator {
  /**
   * Validate PostgreSQL connection configuration
   */
  static validatePostgreSQLConfig(config: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'host',
        type: 'required',
        message: 'PostgreSQL host is required',
      },
      {
        field: 'port',
        type: 'range',
        message: 'PostgreSQL port must be between 1 and 65535',
        options: { min: 1, max: 65535 },
      },
      {
        field: 'username',
        type: 'required',
        message: 'PostgreSQL username is required',
      },
      {
        field: 'password',
        type: 'required',
        message: 'PostgreSQL password is required',
      },
      {
        field: 'database',
        type: 'required',
        message: 'PostgreSQL database name is required',
      },
    ];

    return this.validateConfig(config, rules);
  }

  /**
   * Validate MongoDB connection configuration
   */
  static validateMongoDBConfig(config: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'host',
        type: 'required',
        message: 'MongoDB host is required',
      },
      {
        field: 'port',
        type: 'range',
        message: 'MongoDB port must be between 1 and 65535',
        options: { min: 1, max: 65535 },
      },
    ];

    // If URI is provided, validate it instead
    if (config.uri) {
      rules.push({
        field: 'uri',
        type: 'pattern',
        message: 'Invalid MongoDB URI format',
        options: {
          pattern: '^mongodb(?:\\+srv)?:\\/\\/.+',
        },
      });
    }

    return this.validateConfig(config, rules);
  }

  /**
   * Validate Redis connection configuration
   */
  static validateRedisConfig(config: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'host',
        type: 'required',
        message: 'Redis host is required',
      },
      {
        field: 'port',
        type: 'range',
        message: 'Redis port must be between 1 and 65535',
        options: { min: 1, max: 65535 },
      },
    ];

    if (config.db !== undefined) {
      rules.push({
        field: 'db',
        type: 'range',
        message: 'Redis database number must be between 0 and 15',
        options: { min: 0, max: 15 },
      });
    }

    return this.validateConfig(config, rules);
  }

  /**
   * Validate Qdrant connection configuration
   */
  static validateQdrantConfig(config: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'host',
        type: 'required',
        message: 'Qdrant host is required',
      },
      {
        field: 'port',
        type: 'range',
        message: 'Qdrant port must be between 1 and 65535',
        options: { min: 1, max: 65535 },
      },
    ];

    return this.validateConfig(config, rules);
  }

  /**
   * Validate environment variables for database connections
   */
  static validateEnvironmentVariables(): ValidationResult {
    const errors: ValidationError[] = [];
    const env = process.env;

    // Check required PostgreSQL variables
    if (!env[ENV_KEYS.POSTGRES_HOST] && !env[ENV_KEYS.DATABASE_URL]) {
      errors.push({
        field: ENV_KEYS.POSTGRES_HOST,
        message: 'PostgreSQL host or DATABASE_URL must be provided',
        rule: 'required',
      });
    }

    // Check required MongoDB variables
    if (!env[ENV_KEYS.MONGODB_URI] && !env[ENV_KEYS.MONGODB_HOST]) {
      errors.push({
        field: ENV_KEYS.MONGODB_URI,
        message: 'MongoDB URI or host must be provided',
        rule: 'required',
      });
    }

    // Check required Redis variables
    if (!env[ENV_KEYS.REDIS_HOST] && !env[ENV_KEYS.REDIS_URL]) {
      errors.push({
        field: ENV_KEYS.REDIS_HOST,
        message: 'Redis host or URL must be provided',
        rule: 'required',
      });
    }

    // Check required Qdrant variables
    if (!env[ENV_KEYS.QDRANT_HOST] && !env[ENV_KEYS.QDRANT_URL]) {
      errors.push({
        field: ENV_KEYS.QDRANT_HOST,
        message: 'Qdrant host or URL must be provided',
        rule: 'required',
      });
    }

    // Validate port numbers if provided
    const portFields = [
      { key: ENV_KEYS.POSTGRES_PORT, name: 'PostgreSQL' },
      { key: ENV_KEYS.MONGODB_PORT, name: 'MongoDB' },
      { key: ENV_KEYS.REDIS_PORT, name: 'Redis' },
      { key: ENV_KEYS.QDRANT_PORT, name: 'Qdrant' },
    ];

    for (const { key, name } of portFields) {
      if (env[key]) {
        const port = parseInt(env[key], 10);
        if (isNaN(port) || port < 1 || port > 65535) {
          errors.push({
            field: key,
            message: `${name} port must be a number between 1 and 65535`,
            rule: 'range',
            value: env[key],
          });
        }
      }
    }

    // Validate URLs if provided
    const urlFields = [
      { key: ENV_KEYS.DATABASE_URL, pattern: /^postgresql:\/\//, name: 'DATABASE_URL' },
      { key: ENV_KEYS.MONGODB_URI, pattern: /^mongodb(?:\+srv)?:\/\//, name: 'MONGODB_URI' },
      { key: ENV_KEYS.REDIS_URL, pattern: /^redis:\/\//, name: 'REDIS_URL' },
      { key: ENV_KEYS.QDRANT_URL, pattern: /^https?:\/\//, name: 'QDRANT_URL' },
    ];

    for (const { key, pattern, name } of urlFields) {
      if (env[key] && !pattern.test(env[key])) {
        errors.push({
          field: key,
          message: `${name} has invalid format`,
          rule: 'pattern',
          value: env[key],
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate connection pool configuration
   */
  static validatePoolConfig(config: any): ValidationResult {
    const rules: ValidationRule[] = [
      {
        field: 'min',
        type: 'range',
        message: 'Pool minimum size must be non-negative',
        options: { min: 0 },
      },
      {
        field: 'max',
        type: 'range',
        message: 'Pool maximum size must be at least 1',
        options: { min: 1 },
      },
    ];

    const result = this.validateConfig(config, rules);

    // Additional validation: min should not exceed max
    if (config.min !== undefined && config.max !== undefined && config.min > config.max) {
      result.errors.push({
        field: 'min',
        message: 'Pool minimum size cannot exceed maximum size',
        rule: 'range',
        value: config.min,
      });
      result.valid = false;
    }

    return result;
  }

  /**
   * Generic configuration validation using rules
   */
  private static validateConfig(config: any, rules: ValidationRule[]): ValidationResult {
    const errors: ValidationError[] = [];

    for (const rule of rules) {
      const value = config[rule.field];

      switch (rule.type) {
        case 'required': {
          if (value === undefined || value === null || value === '') {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'email': {
          if (value && !this.isValidEmail(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'phone': {
          if (value && !this.isValidPhone(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'uuid': {
          if (value && !this.isValidUUID(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'url': {
          if (value && !this.isValidURL(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'range': {
          if (value !== undefined && rule.options) {
            const numValue = Number(value);
            if (isNaN(numValue)) {
              errors.push({
                field: rule.field,
                message: `${rule.field} must be a number`,
                rule: rule.type,
                value,
              });
            } else {
              if (rule.options.min !== undefined && numValue < rule.options.min) {
                errors.push({
                  field: rule.field,
                  message: rule.message,
                  rule: rule.type,
                  value,
                });
              }
              if (rule.options.max !== undefined && numValue > rule.options.max) {
                errors.push({
                  field: rule.field,
                  message: rule.message,
                  rule: rule.type,
                  value,
                });
              }
            }
          }
          break;
        }
        
        case 'pattern': {
          if (value && rule.options?.pattern) {
            const regex = new RegExp(rule.options.pattern);
            if (!regex.test(value)) {
              errors.push({
                field: rule.field,
                message: rule.message,
                rule: rule.type,
                value,
              });
            }
          }
          break;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper validation functions
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s|-|\(|\)/g, ''));
  }

  private static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  private static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}