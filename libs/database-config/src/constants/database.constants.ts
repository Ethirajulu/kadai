/**
 * Database connection constants
 */
export const DATABASE_CONSTANTS = {
  // Connection timeouts (milliseconds)
  TIMEOUTS: {
    CONNECTION: 30000,
    QUERY: 10000,
    TRANSACTION: 60000,
    HEALTH_CHECK: 5000,
  },

  // Retry configurations
  RETRY: {
    MAX_ATTEMPTS: 5,
    INITIAL_DELAY: 1000,
    MAX_DELAY: 10000,
    BACKOFF_MULTIPLIER: 2,
  },

  // Pool configurations
  POOL: {
    MIN_SIZE: 2,
    MAX_SIZE: 20,
    ACQUIRE_TIMEOUT: 30000,
    IDLE_TIMEOUT: 30000,
  },

  // Health check intervals
  HEALTH_CHECK: {
    INTERVAL: 60000, // 1 minute
    TIMEOUT: 5000,   // 5 seconds
    RETRY_INTERVAL: 10000, // 10 seconds
  },

  // Monitoring intervals
  MONITORING: {
    METRICS_INTERVAL: 30000, // 30 seconds
    ALERT_RETENTION_DAYS: 7,
    METRICS_RETENTION_HOURS: 24,
  },
} as const;

/**
 * PostgreSQL specific constants
 */
export const POSTGRESQL_CONSTANTS = {
  DEFAULT_PORT: 5432,
  DEFAULT_SCHEMA: 'public',
  DEFAULT_DATABASE: 'postgres',
  
  POOL: {
    MIN: 2,
    MAX: 20,
    IDLE_TIMEOUT: 30000,
    CONNECTION_TIMEOUT: 30000,
  },

  SSL_MODES: [
    'disable',
    'allow', 
    'prefer',
    'require',
    'verify-ca',
    'verify-full'
  ] as const,

  ISOLATION_LEVELS: [
    'READ UNCOMMITTED',
    'READ COMMITTED',
    'REPEATABLE READ',
    'SERIALIZABLE'
  ] as const,
} as const;

/**
 * MongoDB specific constants
 */
export const MONGODB_CONSTANTS = {
  DEFAULT_PORT: 27017,
  DEFAULT_DATABASE: 'test',
  
  POOL: {
    MIN: 5,
    MAX: 100,
    SERVER_SELECTION_TIMEOUT: 30000,
    SOCKET_TIMEOUT: 30000,
  },

  READ_PREFERENCES: [
    'primary',
    'primaryPreferred',
    'secondary',
    'secondaryPreferred',
    'nearest'
  ] as const,

  WRITE_CONCERNS: [
    'majority',
    'acknowledged',
    'unacknowledged'
  ] as const,

  COLLECTIONS: {
    MESSAGES: 'messages',
    CHAT_SESSIONS: 'chat_sessions',
    ANALYTICS_EVENTS: 'analytics_events',
    CONVERSATION_HISTORY: 'conversation_history',
  },
} as const;

/**
 * Redis specific constants
 */
export const REDIS_CONSTANTS = {
  DEFAULT_PORT: 6379,
  DEFAULT_DB: 0,
  
  CONNECTION: {
    LAZY_CONNECT: true,
    KEEP_ALIVE: 30000,
    FAMILY: 4, // IPv4
    MAX_RETRIES_PER_REQUEST: 3,
    RETRY_DELAY_ON_FAILURE_OVER: 100,
  },

  KEY_PREFIXES: {
    SESSION: 'session:',
    CACHE: 'cache:',
    RATE_LIMIT: 'rate_limit:',
    LOCK: 'lock:',
    QUEUE: 'queue:',
    PUB_SUB: 'pubsub:',
  },

  TTL: {
    SESSION: 86400,      // 24 hours
    CACHE_SHORT: 300,    // 5 minutes
    CACHE_MEDIUM: 3600,  // 1 hour
    CACHE_LONG: 86400,   // 24 hours
    RATE_LIMIT: 3600,    // 1 hour
    LOCK: 30,            // 30 seconds
  },
} as const;

/**
 * Qdrant specific constants
 */
export const QDRANT_CONSTANTS = {
  DEFAULT_PORT: 6333,
  
  VECTOR_SIZES: {
    OPENAI_ADA: 1536,
    OPENAI_SMALL: 1536,
    BERT_BASE: 768,
    BERT_LARGE: 1024,
    CLIP_VIT: 512,
    CUSTOM_SMALL: 256,
    CUSTOM_LARGE: 2048,
  },

  DISTANCE_METRICS: [
    'Cosine',
    'Euclid', 
    'Dot',
    'Manhattan'
  ] as const,

  COLLECTIONS: {
    PRODUCTS: 'products',
    IMAGES: 'images', 
    TEXT: 'text',
    USER_PREFERENCES: 'user_preferences',
    CONVERSATIONS: 'conversations',
    DOCUMENTS: 'documents',
  },

  SEARCH: {
    DEFAULT_LIMIT: 10,
    MAX_LIMIT: 100,
    DEFAULT_THRESHOLD: 0.7,
    MIN_THRESHOLD: 0.0,
    MAX_THRESHOLD: 1.0,
  },

  PAYLOAD_INDEXES: {
    CATEGORY: 'keyword',
    PRICE: 'float',
    CURRENCY: 'keyword',
    SELLER_ID: 'keyword',
    PRODUCT_ID: 'keyword',
    CREATED_AT: 'datetime',
    IN_STOCK: 'bool',
    BRAND: 'keyword',
    CONDITION: 'keyword',
    LANGUAGE: 'keyword',
    SOURCE: 'keyword',
    SENTIMENT: 'keyword',
  },
} as const;

/**
 * Environment variable keys
 */
export const ENV_KEYS = {
  // PostgreSQL
  POSTGRES_HOST: 'POSTGRES_HOST',
  POSTGRES_PORT: 'POSTGRES_PORT',
  POSTGRES_USER: 'POSTGRES_USER',
  POSTGRES_PASSWORD: 'POSTGRES_PASSWORD',
  POSTGRES_DB: 'POSTGRES_DB',
  POSTGRES_SSL: 'POSTGRES_SSL',
  DATABASE_URL: 'DATABASE_URL',

  // MongoDB
  MONGODB_URI: 'MONGODB_URI',
  MONGODB_HOST: 'MONGODB_HOST',
  MONGODB_PORT: 'MONGODB_PORT',
  MONGODB_USER: 'MONGODB_USER',
  MONGODB_PASSWORD: 'MONGODB_PASSWORD',
  MONGODB_DB: 'MONGODB_DB',

  // Redis
  REDIS_HOST: 'REDIS_HOST',
  REDIS_PORT: 'REDIS_PORT',
  REDIS_PASSWORD: 'REDIS_PASSWORD',
  REDIS_DB: 'REDIS_DB',
  REDIS_URL: 'REDIS_URL',

  // Qdrant
  QDRANT_HOST: 'QDRANT_HOST',
  QDRANT_PORT: 'QDRANT_PORT',
  QDRANT_API_KEY: 'QDRANT_API_KEY',
  QDRANT_URL: 'QDRANT_URL',

  // General
  NODE_ENV: 'NODE_ENV',
  LOG_LEVEL: 'LOG_LEVEL',
  DATABASE_ENCRYPTION_KEY: 'DATABASE_ENCRYPTION_KEY',
} as const;

/**
 * Error codes and messages
 */
export const ERROR_CODES = {
  CONNECTION_FAILED: 'DB_CONNECTION_FAILED',
  CONNECTION_TIMEOUT: 'DB_CONNECTION_TIMEOUT',
  QUERY_FAILED: 'DB_QUERY_FAILED',
  QUERY_TIMEOUT: 'DB_QUERY_TIMEOUT',
  TRANSACTION_FAILED: 'DB_TRANSACTION_FAILED',
  POOL_EXHAUSTED: 'DB_POOL_EXHAUSTED',
  VALIDATION_ERROR: 'DB_VALIDATION_ERROR',
  CONFIGURATION_ERROR: 'DB_CONFIGURATION_ERROR',
  HEALTH_CHECK_FAILED: 'DB_HEALTH_CHECK_FAILED',
  MIGRATION_FAILED: 'DB_MIGRATION_FAILED',
  SEED_FAILED: 'DB_SEED_FAILED',
} as const;

/**
 * Log levels for database operations
 */
export const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn', 
  INFO: 'info',
  DEBUG: 'debug',
  VERBOSE: 'verbose',
} as const;

/**
 * Database operation types
 */
export const OPERATION_TYPES = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  MIGRATE: 'migrate',
  SEED: 'seed',
  BACKUP: 'backup',
  RESTORE: 'restore',
} as const;

/**
 * Health status constants
 */
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  DEGRADED: 'degraded',
  UNKNOWN: 'unknown',
} as const;

/**
 * Monitoring alert levels
 */
export const ALERT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
} as const;