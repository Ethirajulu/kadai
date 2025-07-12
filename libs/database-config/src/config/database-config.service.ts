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
      return this.parsePostgreSQLUrl(env[ENV_KEYS.DATABASE_URL]!);
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
      return this.parseMongoDBUri(env[ENV_KEYS.MONGODB_URI]!);
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
      return this.parseRedisUrl(env[ENV_KEYS.REDIS_URL]!);
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
      return this.parseQdrantUrl(env[ENV_KEYS.QDRANT_URL]!);
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
      result.errors.forEach((error: any) => {
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
      this.logger.error(`${type} configuration validation failed:`);
      result.errors.forEach((error: any) => {
        this.logger.error(`- ${error.field}: ${error.message}`);
      });
      throw new Error(`Invalid ${type} configuration`);
    }
  }

  /**
   * Parse PostgreSQL URL
   */
  private parsePostgreSQLUrl(url: string): PostgreSQLConfig {
    try {
      const parsed = new URL(url);
      
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || POSTGRESQL_CONSTANTS.DEFAULT_PORT,
        username: parsed.username,
        password: parsed.password,
        database: parsed.pathname.slice(1) || POSTGRESQL_CONSTANTS.DEFAULT_DATABASE,
        ssl: parsed.searchParams.get('ssl') === 'true' || parsed.searchParams.get('sslmode') !== 'disable',
        schema: parsed.searchParams.get('schema') || POSTGRESQL_CONSTANTS.DEFAULT_SCHEMA,
        poolSize: POSTGRESQL_CONSTANTS.POOL.MAX,
        connectionTimeoutMillis: POSTGRESQL_CONSTANTS.POOL.CONNECTION_TIMEOUT,
        idleTimeoutMillis: POSTGRESQL_CONSTANTS.POOL.IDLE_TIMEOUT,
        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
      };
    } catch (error) {
      this.logger.error('Failed to parse PostgreSQL URL:', error);
      throw new Error('Invalid PostgreSQL URL format');
    }
  }

  /**
   * Parse MongoDB URI
   */
  private parseMongoDBUri(uri: string): MongoDBConfig {
    try {
      const parsed = new URL(uri);
      
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || MONGODB_CONSTANTS.DEFAULT_PORT,
        username: parsed.username,
        password: parsed.password,
        database: parsed.pathname.slice(1) || MONGODB_CONSTANTS.DEFAULT_DATABASE,
        authSource: parsed.searchParams.get('authSource') || undefined,
        replicaSet: parsed.searchParams.get('replicaSet') || undefined,
        maxPoolSize: parseInt(parsed.searchParams.get('maxPoolSize') || String(MONGODB_CONSTANTS.POOL.MAX), 10),
        minPoolSize: parseInt(parsed.searchParams.get('minPoolSize') || String(MONGODB_CONSTANTS.POOL.MIN), 10),
        serverSelectionTimeoutMS: MONGODB_CONSTANTS.POOL.SERVER_SELECTION_TIMEOUT,
        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
      };
    } catch (error) {
      this.logger.error('Failed to parse MongoDB URI:', error);
      throw new Error('Invalid MongoDB URI format');
    }
  }

  /**
   * Parse Redis URL
   */
  private parseRedisUrl(url: string): RedisConfig {
    try {
      const parsed = new URL(url);
      
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || REDIS_CONSTANTS.DEFAULT_PORT,
        password: parsed.password || undefined,
        db: parseInt(parsed.pathname.slice(1), 10) || REDIS_CONSTANTS.DEFAULT_DB,
        lazyConnect: REDIS_CONSTANTS.CONNECTION.LAZY_CONNECT,
        keepAlive: REDIS_CONSTANTS.CONNECTION.KEEP_ALIVE,
        family: REDIS_CONSTANTS.CONNECTION.FAMILY,
        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
      };
    } catch (error) {
      this.logger.error('Failed to parse Redis URL:', error);
      throw new Error('Invalid Redis URL format');
    }
  }

  /**
   * Parse Qdrant URL
   */
  private parseQdrantUrl(url: string): QdrantConfig {
    try {
      const parsed = new URL(url);
      
      return {
        host: parsed.hostname,
        port: parseInt(parsed.port, 10) || QDRANT_CONSTANTS.DEFAULT_PORT,
        apiKey: parsed.searchParams.get('api_key') || undefined,
        timeout: DATABASE_CONSTANTS.TIMEOUTS.CONNECTION,
        retryAttempts: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
        retryDelay: DATABASE_CONSTANTS.RETRY.INITIAL_DELAY,
        retries: DATABASE_CONSTANTS.RETRY.MAX_ATTEMPTS,
      };
    } catch (error) {
      this.logger.error('Failed to parse Qdrant URL:', error);
      throw new Error('Invalid Qdrant URL format');
    }
  }

  /**
   * Generate default encryption key for sensitive data
   */
  private generateDefaultKey(): string {
    this.logger.warn('No DATABASE_ENCRYPTION_KEY provided, generating default key (not secure for production)');
    return EncryptionUtil.generateSecureToken(32);
  }

  /**
   * Encrypt sensitive configuration data
   */
  encryptSensitiveData(data: string): string {
    return JSON.stringify(EncryptionUtil.encrypt(data, this.encryptionKey));
  }

  /**
   * Decrypt sensitive configuration data
   */
  decryptSensitiveData(encryptedData: string): string {
    try {
      const parsed = JSON.parse(encryptedData);
      return EncryptionUtil.decrypt(parsed, this.encryptionKey);
    } catch (error) {
      this.logger.error('Failed to decrypt data:', error);
      throw new Error('Failed to decrypt configuration data');
    }
  }

  /**
   * Get masked connection strings for logging
   */
  getMaskedConfigs() {
    const configs = this.getAllConfigs();
    
    return {
      postgresql: {
        ...configs.postgresql,
        password: configs.postgresql.password ? '***' : undefined,
      },
      mongodb: {
        ...configs.mongodb,
        password: configs.mongodb.password ? '***' : undefined,
      },
      redis: {
        ...configs.redis,
        password: configs.redis.password ? '***' : undefined,
      },
      qdrant: {
        ...configs.qdrant,
        apiKey: configs.qdrant.apiKey ? '***' : undefined,
      },
      manager: configs.manager,
    };
  }
}