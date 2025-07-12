import { Injectable, Logger } from '@nestjs/common';
import { 
  DatabaseConnectionConfig, 
  PostgreSQLConfig, 
  MongoDBConfig, 
  RedisConfig, 
  QdrantConfig,
  DatabaseManagerConfig 
} from '@kadai/shared-types';
import { 
  DATABASE_CONSTANTS, 
  POSTGRESQL_CONSTANTS, 
  MONGODB_CONSTANTS, 
  REDIS_CONSTANTS, 
  QDRANT_CONSTANTS, 
  ENV_KEYS 
} from '../constants';
import { ConnectionValidator } from '../validators';
import { EncryptionUtil } from '../utils';

@Injectable()
export class DatabaseConfigService {
  private readonly logger = new Logger(DatabaseConfigService.name);
  private readonly encryptionKey: string;

  constructor() {
    this.encryptionKey = process.env[ENV_KEYS.DATABASE_ENCRYPTION_KEY] || this.generateDefaultKey();
    this.validateEnvironmentVariables();
  }

  /**
   * Get PostgreSQL configuration
   */
  getPostgreSQLConfig(): PostgreSQLConfig {
    const env = process.env;
    
    // Check if DATABASE_URL is provided (takes precedence)
    if (env[ENV_KEYS.DATABASE_URL]) {
      return this.parsePostgreSQLUrl(env[ENV_KEYS.DATABASE_URL]);
    }

    const config: PostgreSQLConfig = {
      host: env[ENV_KEYS.POSTGRES_HOST] || 'localhost',
      port: parseInt(env[ENV_KEYS.POSTGRES_PORT] || String(POSTGRESQL_CONSTANTS.DEFAULT_PORT), 10),
      username: env[ENV_KEYS.POSTGRES_USER] || 'postgres',
      password: env[ENV_KEYS.POSTGRES_PASSWORD] || '',
      database: env[ENV_KEYS.POSTGRES_DB] || POSTGRESQL_CONSTANTS.DEFAULT_DATABASE,
      ssl: env[ENV_KEYS.POSTGRES_SSL] === 'true',
      schema: POSTGRESQL_CONSTANTS.DEFAULT_SCHEMA,
      poolSize: POSTGRESQL_CONSTANTS.POOL.MAX,
      connectionTimeoutMillis: POSTGRESQL_CONSTANTS.POOL.CONNECTION_TIMEOUT,
      idleTimeoutMillis: POSTGRESQL_CONSTANTS.POOL.IDLE_TIMEOUT,
      timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
      retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
      retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
    };

    this.validateConfig(config, 'PostgreSQL');
    return config;
  }

  /**
   * Get MongoDB configuration
   */
  getMongoDBConfig(): MongoDBConfig {
    const env = process.env;
    
    // Check if MONGODB_URI is provided (takes precedence)
    if (env[ENV_KEYS.MONGODB_URI]) {
      return this.parseMongoDBUri(env[ENV_KEYS.MONGODB_URI]);
    }

    const config: MongoDBConfig = {
      host: env[ENV_KEYS.MONGODB_HOST] || 'localhost',
      port: parseInt(env[ENV_KEYS.MONGODB_PORT] || String(MONGODB_CONSTANTS.DEFAULT_PORT), 10),
      username: env[ENV_KEYS.MONGODB_USER],
      password: env[ENV_KEYS.MONGODB_PASSWORD],
      database: env[ENV_KEYS.MONGODB_DB] || MONGODB_CONSTANTS.DEFAULT_DATABASE,
      maxPoolSize: MONGODB_CONSTANTS.POOL.MAX,
      minPoolSize: MONGODB_CONSTANTS.POOL.MIN,
      serverSelectionTimeoutMS: MONGODB_CONSTANTS.POOL.SERVER_SELECTION_TIMEOUT,
      timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
      retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
      retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
    };

    this.validateConfig(config, 'MongoDB');
    return config;
  }

  /**
   * Get Redis configuration
   */
  getRedisConfig(): RedisConfig {
    const env = process.env;
    
    // Check if REDIS_URL is provided (takes precedence)
    if (env[ENV_KEYS.REDIS_URL]) {
      return this.parseRedisUrl(env[ENV_KEYS.REDIS_URL]);
    }

    const config: RedisConfig = {
      host: env[ENV_KEYS.REDIS_HOST] || 'localhost',
      port: parseInt(env[ENV_KEYS.REDIS_PORT] || String(REDIS_CONSTANTS.DEFAULT_PORT), 10),
      password: env[ENV_KEYS.REDIS_PASSWORD],
      db: parseInt(env[ENV_KEYS.REDIS_DB] || String(REDIS_CONSTANTS.DEFAULT_DB), 10),
      lazyConnect: REDIS_CONSTANTS.CONNECTION.LAZY_CONNECT,
      keepAlive: REDIS_CONSTANTS.CONNECTION.KEEP_ALIVE,
      family: REDIS_CONSTANTS.CONNECTION.FAMILY,
      timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
      retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
      retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
    };

    this.validateConfig(config, 'Redis');
    return config;
  }

  /**
   * Get Qdrant configuration
   */
  getQdrantConfig(): QdrantConfig {
    const env = process.env;
    
    // Check if QDRANT_URL is provided (takes precedence)
    if (env[ENV_KEYS.QDRANT_URL]) {
      return this.parseQdrantUrl(env[ENV_KEYS.QDRANT_URL]);
    }

    const config: QdrantConfig = {
      host: env[ENV_KEYS.QDRANT_HOST] || 'localhost',
      port: parseInt(env[ENV_KEYS.QDRANT_PORT] || String(QDRANT_CONSTANTS.DEFAULT_PORT), 10),
      apiKey: env[ENV_KEYS.QDRANT_API_KEY],
      timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
      retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
      retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
      retries: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
    };

    this.validateConfig(config, 'Qdrant');
    return config;
  }

  /**
   * Get database manager configuration
   */
  getDatabaseManagerConfig(): DatabaseManagerConfig {
    return {
      reconnectAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
      reconnectDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
      connectionTimeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
      enableGracefulShutdown: true,
      enableHealthMonitoring: true,
      healthCheckInterval: DATABASE_CONSTANTS.HEALTH_CHECK.INTERVAL,
    };
  }

  /**
   * Get all database configurations
   */
  getAllConfigs() {
    return {
      postgresql: this.getPostgreSQLConfig(),
      mongodb: this.getMongoDBConfig(),
      redis: this.getRedisConfig(),
      qdrant: this.getQdrantConfig(),
      manager: this.getDatabaseManagerConfig(),
    };
  }

  /**
   * Validate environment variables
   */
  private validateEnvironmentVariables(): void {
    const result = ConnectionValidator.validateEnvironmentVariables();
    
    if (!result.valid) {
      this.logger.error('Environment validation failed:');
      result.errors.forEach(error => {
        this.logger.error(`- ${error.field}: ${error.message}`);
      });
      
      if (process.env[ENV_KEYS.NODE_ENV] === 'production') {
        throw new Error('Invalid environment configuration for production');
      } else {
        this.logger.warn('Using default values for missing environment variables');
      }
    }
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: DatabaseConnectionConfig, type: string): void {
    let result;
    
    switch (type) {
      case 'PostgreSQL':
        result = ConnectionValidator.validatePostgreSQLConfig(config);
        break;
      case 'MongoDB':
        result = ConnectionValidator.validateMongoDBConfig(config);
        break;
      case 'Redis':
        result = ConnectionValidator.validateRedisConfig(config);
        break;
      case 'Qdrant':
        result = ConnectionValidator.validateQdrantConfig(config);
        break;
      default:
        return;
    }

    if (!result.valid) {
      this.logger.error(`${type} configuration validation failed:`);\n      result.errors.forEach(error => {\n        this.logger.error(`- ${error.field}: ${error.message}`);\n      });\n      throw new Error(`Invalid ${type} configuration`);\n    }\n  }\n\n  /**\n   * Parse PostgreSQL URL\n   */\n  private parsePostgreSQLUrl(url: string): PostgreSQLConfig {\n    try {\n      const parsed = new URL(url);\n      \n      return {\n        host: parsed.hostname,\n        port: parseInt(parsed.port, 10) || POSTGRESQL_CONSTANTS.DEFAULT_PORT,\n        username: parsed.username,\n        password: parsed.password,\n        database: parsed.pathname.slice(1) || POSTGRESQL_CONSTANTS.DEFAULT_DATABASE,\n        ssl: parsed.searchParams.get('ssl') === 'true' || parsed.searchParams.get('sslmode') !== 'disable',\n        schema: parsed.searchParams.get('schema') || POSTGRESQL_CONSTANTS.DEFAULT_SCHEMA,\n        poolSize: POSTGRESQL_CONSTANTS.POOL.MAX,\n        connectionTimeoutMillis: POSTGRESQL_CONSTANTS.POOL.CONNECTION_TIMEOUT,\n        idleTimeoutMillis: POSTGRESQL_CONSTANTS.POOL.IDLE_TIMEOUT,\n        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,\n        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,\n        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,\n      };\n    } catch (error) {\n      this.logger.error('Failed to parse PostgreSQL URL:', error);\n      throw new Error('Invalid PostgreSQL URL format');\n    }\n  }\n\n  /**\n   * Parse MongoDB URI\n   */\n  private parseMongoDBUri(uri: string): MongoDBConfig {\n    try {\n      const parsed = new URL(uri);\n      \n      return {\n        host: parsed.hostname,\n        port: parseInt(parsed.port, 10) || MONGODB_CONSTANTS.DEFAULT_PORT,\n        username: parsed.username,\n        password: parsed.password,\n        database: parsed.pathname.slice(1) || MONGODB_CONSTANTS.DEFAULT_DATABASE,\n        authSource: parsed.searchParams.get('authSource') || undefined,\n        replicaSet: parsed.searchParams.get('replicaSet') || undefined,\n        maxPoolSize: parseInt(parsed.searchParams.get('maxPoolSize') || String(MONGODB_CONSTANTS.POOL.MAX), 10),\n        minPoolSize: parseInt(parsed.searchParams.get('minPoolSize') || String(MONGODB_CONSTANTS.POOL.MIN), 10),\n        serverSelectionTimeoutMS: MONGODB_CONSTANTS.POOL.SERVER_SELECTION_TIMEOUT,\n        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,\n        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,\n        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,\n      };\n    } catch (error) {\n      this.logger.error('Failed to parse MongoDB URI:', error);\n      throw new Error('Invalid MongoDB URI format');\n    }\n  }\n\n  /**\n   * Parse Redis URL\n   */\n  private parseRedisUrl(url: string): RedisConfig {\n    try {\n      const parsed = new URL(url);\n      \n      return {\n        host: parsed.hostname,\n        port: parseInt(parsed.port, 10) || REDIS_CONSTANTS.DEFAULT_PORT,\n        password: parsed.password || undefined,\n        db: parseInt(parsed.pathname.slice(1), 10) || REDIS_CONSTANTS.DEFAULT_DB,\n        lazyConnect: REDIS_CONSTANTS.CONNECTION.LAZY_CONNECT,\n        keepAlive: REDIS_CONSTANTS.CONNECTION.KEEP_ALIVE,\n        family: REDIS_CONSTANTS.CONNECTION.FAMILY,\n        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,\n        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,\n        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,\n      };\n    } catch (error) {\n      this.logger.error('Failed to parse Redis URL:', error);\n      throw new Error('Invalid Redis URL format');\n    }\n  }\n\n  /**\n   * Parse Qdrant URL\n   */\n  private parseQdrantUrl(url: string): QdrantConfig {\n    try {\n      const parsed = new URL(url);\n      \n      return {\n        host: parsed.hostname,\n        port: parseInt(parsed.port, 10) || QDRANT_CONSTANTS.DEFAULT_PORT,\n        apiKey: parsed.searchParams.get('api_key') || undefined,\n        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,\n        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,\n        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,\n        retries: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,\n      };\n    } catch (error) {\n      this.logger.error('Failed to parse Qdrant URL:', error);\n      throw new Error('Invalid Qdrant URL format');\n    }\n  }\n\n  /**\n   * Generate default encryption key for sensitive data\n   */\n  private generateDefaultKey(): string {\n    this.logger.warn('No DATABASE_ENCRYPTION_KEY provided, generating default key (not secure for production)');\n    return EncryptionUtil.generateSecureToken(32);\n  }\n\n  /**\n   * Encrypt sensitive configuration data\n   */\n  encryptSensitiveData(data: string): string {\n    return JSON.stringify(EncryptionUtil.encrypt(data, this.encryptionKey));\n  }\n\n  /**\n   * Decrypt sensitive configuration data\n   */\n  decryptSensitiveData(encryptedData: string): string {\n    try {\n      const parsed = JSON.parse(encryptedData);\n      return EncryptionUtil.decrypt(parsed, this.encryptionKey);\n    } catch (error) {\n      this.logger.error('Failed to decrypt data:', error);\n      throw new Error('Failed to decrypt configuration data');\n    }\n  }\n\n  /**\n   * Get masked connection strings for logging\n   */\n  getMaskedConfigs() {\n    const configs = this.getAllConfigs();\n    \n    return {\n      postgresql: {\n        ...configs.postgresql,\n        password: configs.postgresql.password ? '***' : undefined,\n      },\n      mongodb: {\n        ...configs.mongodb,\n        password: configs.mongodb.password ? '***' : undefined,\n      },\n      redis: {\n        ...configs.redis,\n        password: configs.redis.password ? '***' : undefined,\n      },\n      qdrant: {\n        ...configs.qdrant,\n        apiKey: configs.qdrant.apiKey ? '***' : undefined,\n      },\n      manager: configs.manager,\n    };\n  }\n}