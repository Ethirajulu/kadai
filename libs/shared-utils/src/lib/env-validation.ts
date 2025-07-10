import { z } from 'zod';

/**
 * Environment validation schema for common service configurations
 */
export const baseEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(3000),

  // Database
  DATABASE_URL: z.string().url(),
  DB_HOST: z.string().min(1),
  DB_PORT: z.coerce.number().min(1).max(65535).default(5432),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),

  // Redis
  REDIS_URL: z.string().url(),
  REDIS_HOST: z.string().min(1),
  REDIS_PORT: z.coerce.number().min(1).max(65535).default(6379),
  REDIS_PASSWORD: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Session
  SESSION_SECRET: z.string().min(32),
  SESSION_MAX_AGE: z.coerce.number().positive().default(86400000),

  // Encryption
  ENCRYPTION_KEY: z.string().min(32),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DEBUG: z.string().optional(),

  // Performance
  MAX_REQUEST_SIZE: z.string().default('10mb'),
  REQUEST_TIMEOUT: z.coerce.number().positive().default(30000),

  // Rate Limiting
  RATE_LIMIT_WINDOW: z.coerce.number().positive().default(900000),
  RATE_LIMIT_MAX: z.coerce.number().positive().default(100),
});

/**
 * Environment validation schema for AI service
 */
export const aiServiceEnvSchema = baseEnvSchema.extend({
  AI_SERVICE_PORT: z.coerce.number().min(1).max(65535).default(8000),

  // Vector Database
  QDRANT_URL: z.string().url(),
  QDRANT_HOST: z.string().min(1),
  QDRANT_PORT: z.coerce.number().min(1).max(65535).default(6333),
  QDRANT_GRPC_PORT: z.coerce.number().min(1).max(65535).default(6334),

  // AI APIs
  OPENAI_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
  GOOGLE_PROJECT_ID: z.string().optional(),

  // Translation
  TRANSLATION_PROVIDER: z.enum(['google', 'azure', 'aws']).default('google'),

  // Speech
  STT_PROVIDER: z.enum(['google', 'azure', 'aws']).default('google'),
  TTS_PROVIDER: z.enum(['google', 'azure', 'aws']).default('google'),
});

/**
 * Environment validation schema for services with MongoDB
 */
export const mongoServiceEnvSchema = baseEnvSchema.extend({
  MONGODB_URL: z.string().url(),
  MONGODB_HOST: z.string().min(1),
  MONGODB_PORT: z.coerce.number().min(1).max(65535).default(27017),
  MONGODB_USERNAME: z.string().min(1),
  MONGODB_PASSWORD: z.string().min(1),
  MONGODB_DATABASE: z.string().min(1),
});

/**
 * Environment validation schema for services with message queue
 */
export const messageQueueEnvSchema = baseEnvSchema.extend({
  RABBITMQ_URL: z.string().url(),
  RABBITMQ_HOST: z.string().min(1),
  RABBITMQ_PORT: z.coerce.number().min(1).max(65535).default(5672),
  RABBITMQ_MANAGEMENT_PORT: z.coerce.number().min(1).max(65535).default(15672),
  RABBITMQ_USERNAME: z.string().min(1),
  RABBITMQ_PASSWORD: z.string().min(1),
  RABBITMQ_VHOST: z.string().min(1),
});

/**
 * Environment validation schema for external API services
 */
export const externalApiEnvSchema = baseEnvSchema.extend({
  // WhatsApp
  WHATSAPP_PHONE_NUMBER_ID: z.string().optional(),
  WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  // Instagram
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),

  // Telegram
  TELEGRAM_BOT_TOKEN: z.string().optional(),

  // UPI
  UPI_MERCHANT_ID: z.string().optional(),
  UPI_MERCHANT_KEY: z.string().optional(),
  UPI_GATEWAY_URL: z.string().url().optional(),

  // SMS
  SMS_PROVIDER: z.enum(['twilio', 'msg91', 'textlocal']).default('twilio'),
  SMS_API_KEY: z.string().optional(),
  SMS_SENDER_ID: z.string().default('KADAI'),

  // Email
  EMAIL_PROVIDER: z.enum(['smtp', 'sendgrid', 'mailgun']).default('smtp'),
  EMAIL_HOST: z.string().optional(),
  EMAIL_PORT: z.coerce.number().min(1).max(65535).optional(),
  EMAIL_USERNAME: z.string().optional(),
  EMAIL_PASSWORD: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),

  // Cloud Storage
  CLOUD_STORAGE_PROVIDER: z.enum(['aws', 'gcp', 'azure']).default('aws'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  AWS_REGION: z.string().default('ap-south-1'),
  AWS_S3_BUCKET: z.string().optional(),
});

/**
 * Environment validation schema for monitoring services
 */
export const monitoringEnvSchema = baseEnvSchema.extend({
  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
  NEW_RELIC_LICENSE_KEY: z.string().optional(),

  // Analytics
  MIXPANEL_TOKEN: z.string().optional(),
  GOOGLE_ANALYTICS_ID: z.string().optional(),

  // Code Quality
  SONAR_TOKEN: z.string().optional(),
  SONAR_HOST_URL: z.string().url().optional(),
  SNYK_TOKEN: z.string().optional(),
});

/**
 * Environment validation schema for frontend applications
 */
export const frontendEnvSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'staging', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().min(1).max(65535).default(4200),

  // Public API URLs
  NEXT_PUBLIC_API_URL: z.string().url(),
  NEXT_PUBLIC_WS_URL: z.string().url().optional(),

  // Public analytics
  NEXT_PUBLIC_GA_ID: z.string().optional(),
  NEXT_PUBLIC_MIXPANEL_TOKEN: z.string().optional(),

  // Feature flags
  NEXT_PUBLIC_ENABLE_ANALYTICS: z.coerce.boolean().default(true),
  NEXT_PUBLIC_ENABLE_SENTRY: z.coerce.boolean().default(false),
});

/**
 * Type inference helpers
 */
export type BaseEnv = z.infer<typeof baseEnvSchema>;
export type AiServiceEnv = z.infer<typeof aiServiceEnvSchema>;
export type MongoServiceEnv = z.infer<typeof mongoServiceEnvSchema>;
export type MessageQueueEnv = z.infer<typeof messageQueueEnvSchema>;
export type ExternalApiEnv = z.infer<typeof externalApiEnvSchema>;
export type MonitoringEnv = z.infer<typeof monitoringEnvSchema>;
export type FrontendEnv = z.infer<typeof frontendEnvSchema>;

/**
 * Validate environment variables against a schema
 */
export function validateEnv<T extends z.ZodType>(
  schema: T,
  env: Record<string, string | undefined> = process.env
): z.infer<T> {
  const result = schema.safeParse(env);

  if (!result.success) {
    const errors = result.error.issues.map(
      (err) => `${err.path.join('.')}: ${err.message}`
    );

    throw new Error(`Environment validation failed:\n${errors.join('\n')}`);
  }

  return result.data;
}

/**
 * Get service-specific environment configuration
 */
export function getServiceEnv(serviceName: string): BaseEnv {
  const schema = getServiceSchema(serviceName);
  return validateEnv(schema) as BaseEnv;
}

/**
 * Get schema for a specific service
 */
function getServiceSchema(serviceName: string): z.ZodSchema {
  switch (serviceName) {
    case 'ai-service':
      return aiServiceEnvSchema;
    case 'product-service':
    case 'analytics-service':
      return mongoServiceEnvSchema;
    case 'notification-service':
    case 'broadcast-service':
      return messageQueueEnvSchema.merge(externalApiEnvSchema);
    case 'payment-service':
      return externalApiEnvSchema;
    case 'seller-dashboard':
      return frontendEnvSchema;
    default:
      return baseEnvSchema;
  }
}

/**
 * Check if all required environment variables are present
 */
export function checkRequiredEnvVars(requiredVars: string[]): void {
  const missing = requiredVars.filter((varName) => !process.env[varName]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}`
    );
  }
}

/**
 * Get environment-specific configuration
 */
export function getEnvConfig() {
  const env = process.env.NODE_ENV || 'development';

  return {
    isDevelopment: env === 'development',
    isProduction: env === 'production',
    isTest: env === 'test',
    isStaging: env === 'staging',
    environment: env,
  };
}
