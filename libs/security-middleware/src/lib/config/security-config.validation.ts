import * as Joi from 'joi';

/**
 * Environment-specific security configuration validation schemas
 */

// Common validation rules
const jwtSecretSchema = Joi.string()
  .min(32)
  .required()
  .description('JWT secret must be at least 32 characters');
const redisUrlSchema = Joi.string().uri().description('Redis connection URL');
const portSchema = Joi.number().port().description('Valid port number');
const ipSchema = Joi.string().ip().description('Valid IP address');
const countryCodeSchema = Joi.string()
  .length(2)
  .uppercase()
  .description('ISO 3166-1 alpha-2 country code');

/**
 * Development environment configuration schema
 */
export const developmentSecurityConfigSchema = Joi.object({
  jwt: Joi.object({
    accessTokenSecret: jwtSecretSchema,
    refreshTokenSecret: jwtSecretSchema,
    accessTokenExpiry: Joi.string()
      .default('15m')
      .description('Access token expiration time'),
    refreshTokenExpiry: Joi.string()
      .default('7d')
      .description('Refresh token expiration time'),
    issuer: Joi.string().default('kadai-auth').description('JWT issuer'),
    audience: Joi.string().default('kadai-api').description('JWT audience'),
    algorithm: Joi.string()
      .valid('HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512')
      .default('HS256'),
  }).required(),

  redis: Joi.object({
    host: Joi.string().default('localhost').description('Redis host'),
    port: portSchema.default(6379),
    password: Joi.string().allow('').optional().description('Redis password'),
    db: Joi.number()
      .integer()
      .min(0)
      .max(15)
      .default(0)
      .description('Redis database number'),
    url: redisUrlSchema
      .optional()
      .description('Redis connection URL (alternative to host/port)'),
    keyPrefix: Joi.string()
      .default('kadai:security:')
      .description('Redis key prefix'),
    connectionTimeout: Joi.number()
      .positive()
      .default(5000)
      .description('Connection timeout in ms'),
    lazyConnect: Joi.boolean()
      .default(true)
      .description('Enable lazy connection'),
    retryDelayOnFailover: Joi.number()
      .positive()
      .default(100)
      .description('Retry delay on failover'),
    maxRetriesPerRequest: Joi.number()
      .integer()
      .min(0)
      .default(3)
      .description('Max retries per request'),
  }).required(),

  rateLimit: Joi.object({
    windowMs: Joi.number()
      .positive()
      .default(60000)
      .description('Rate limit window in ms'),
    max: Joi.number()
      .positive()
      .default(100)
      .description('Maximum requests per window'),
    skipSuccessfulRequests: Joi.boolean()
      .default(false)
      .description('Skip successful requests in count'),
    skipFailedRequests: Joi.boolean()
      .default(false)
      .description('Skip failed requests in count'),
    keyGenerator: Joi.string()
      .valid('ip', 'user', 'session')
      .default('ip')
      .description('Rate limit key strategy'),
    onLimitReached: Joi.function()
      .optional()
      .description('Callback when limit is reached'),
  }).required(),

  cors: Joi.object({
    origin: Joi.alternatives()
      .try(
        Joi.string(),
        Joi.array().items(Joi.string()),
        Joi.boolean(),
        Joi.function()
      )
      .default('*')
      .description('CORS origin configuration'),
    methods: Joi.array()
      .items(Joi.string())
      .default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']),
    allowedHeaders: Joi.array()
      .items(Joi.string())
      .default(['Content-Type', 'Authorization']),
    credentials: Joi.boolean()
      .default(false)
      .description('Allow credentials in CORS'),
    maxAge: Joi.number()
      .positive()
      .default(86400)
      .description('CORS preflight cache duration'),
  }).required(),

  validation: Joi.object({
    enableXssProtection: Joi.boolean()
      .default(true)
      .description('Enable XSS protection'),
    enableSqlInjectionProtection: Joi.boolean()
      .default(true)
      .description('Enable SQL injection protection'),
    enableNoSqlInjectionProtection: Joi.boolean()
      .default(true)
      .description('Enable NoSQL injection protection'),
    maxPayloadSize: Joi.string()
      .default('10mb')
      .description('Maximum request payload size'),
    enableStrictValidation: Joi.boolean()
      .default(false)
      .description('Enable strict validation mode'),
  }).required(),

  circuitBreaker: Joi.object({
    failureThreshold: Joi.number()
      .integer()
      .min(1)
      .default(5)
      .description('Failure threshold for circuit breaker'),
    resetTimeout: Joi.number()
      .positive()
      .default(60000)
      .description('Reset timeout in ms'),
    monitoringPeriod: Joi.number()
      .positive()
      .default(10000)
      .description('Monitoring period in ms'),
    operationTimeout: Joi.number()
      .positive()
      .default(5000)
      .description('Operation timeout in ms'),
  }).required(),

  security: Joi.object({
    enableSecurityHeaders: Joi.boolean()
      .default(true)
      .description('Enable security headers'),
    contentSecurityPolicy: Joi.string()
      .default("default-src 'self'")
      .description('Content Security Policy'),
    strictTransportSecurity: Joi.string()
      .default('max-age=31536000; includeSubDomains')
      .description('HSTS header'),
    enableIpFiltering: Joi.boolean()
      .default(false)
      .description('Enable IP filtering'),
    allowedIps: Joi.array()
      .items(ipSchema)
      .default([])
      .description('Allowed IP addresses'),
    blockedIps: Joi.array()
      .items(ipSchema)
      .default([])
      .description('Blocked IP addresses'),
    enableGeoFiltering: Joi.boolean()
      .default(false)
      .description('Enable geographic filtering'),
    allowedCountries: Joi.array()
      .items(countryCodeSchema)
      .default([])
      .description('Allowed countries'),
    blockedCountries: Joi.array()
      .items(countryCodeSchema)
      .default([])
      .description('Blocked countries'),
  }).required(),

  logging: Joi.object({
    enableSecurityLogging: Joi.boolean()
      .default(true)
      .description('Enable security event logging'),
    logLevel: Joi.string()
      .valid('error', 'warn', 'info', 'debug')
      .default('info')
      .description('Security log level'),
    enableAuditTrail: Joi.boolean()
      .default(false)
      .description('Enable audit trail'),
    auditRetentionDays: Joi.number()
      .integer()
      .min(1)
      .default(90)
      .description('Audit log retention in days'),
  }).required(),
}).required();

/**
 * Production environment configuration schema (stricter requirements)
 */
export const productionSecurityConfigSchema = Joi.object({
  jwt: Joi.object({
    accessTokenSecret: Joi.string()
      .min(64)
      .required()
      .description('JWT secret must be at least 64 characters in production'),
    refreshTokenSecret: Joi.string()
      .min(64)
      .required()
      .description(
        'JWT refresh secret must be at least 64 characters in production'
      ),
    accessTokenExpiry: Joi.string()
      .default('15m')
      .description('Access token expiration time'),
    refreshTokenExpiry: Joi.string()
      .default('7d')
      .description('Refresh token expiration time'),
    issuer: Joi.string()
      .required()
      .description('JWT issuer must be specified in production'),
    audience: Joi.string()
      .required()
      .description('JWT audience must be specified in production'),
    algorithm: Joi.string()
      .valid('RS256', 'RS384', 'RS512')
      .default('RS256')
      .description('Use RSA algorithms in production'),
  }).required(),

  redis: Joi.object({
    host: Joi.string()
      .required()
      .description('Redis host is required in production'),
    port: portSchema.required(),
    password: Joi.string()
      .min(16)
      .required()
      .description('Redis password is required in production'),
    db: Joi.number()
      .integer()
      .min(0)
      .max(15)
      .default(0)
      .description('Redis database number'),
    url: redisUrlSchema
      .optional()
      .description('Redis connection URL (alternative to host/port)'),
    keyPrefix: Joi.string()
      .default('kadai:security:')
      .description('Redis key prefix'),
    connectionTimeout: Joi.number()
      .positive()
      .default(3000)
      .description('Connection timeout in ms'),
    lazyConnect: Joi.boolean()
      .default(false)
      .description('Disable lazy connection in production'),
    retryDelayOnFailover: Joi.number()
      .positive()
      .default(500)
      .description('Retry delay on failover'),
    maxRetriesPerRequest: Joi.number()
      .integer()
      .min(0)
      .default(5)
      .description('Max retries per request'),
    enableTLS: Joi.boolean()
      .default(true)
      .description('Enable TLS for Redis connection'),
  }).required(),

  rateLimit: Joi.object({
    windowMs: Joi.number()
      .positive()
      .default(60000)
      .description('Rate limit window in ms'),
    max: Joi.number()
      .positive()
      .default(1000)
      .description('Higher limits for production'),
    skipSuccessfulRequests: Joi.boolean()
      .default(false)
      .description('Skip successful requests in count'),
    skipFailedRequests: Joi.boolean()
      .default(true)
      .description('Skip failed requests in production'),
    keyGenerator: Joi.string()
      .valid('ip', 'user', 'session')
      .default('user')
      .description('Use user-based rate limiting in production'),
    onLimitReached: Joi.function()
      .optional()
      .description('Callback when limit is reached'),
  }).required(),

  cors: Joi.object({
    origin: Joi.alternatives()
      .try(
        Joi.string().uri(),
        Joi.array().items(Joi.string().uri()),
        Joi.function()
      )
      .required()
      .description('CORS origin must be explicitly configured in production'),
    methods: Joi.array()
      .items(
        Joi.string().valid('GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS')
      )
      .default(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    allowedHeaders: Joi.array()
      .items(Joi.string())
      .default(['Content-Type', 'Authorization', 'X-Requested-With']),
    credentials: Joi.boolean()
      .default(true)
      .description('Allow credentials in production'),
    maxAge: Joi.number()
      .positive()
      .default(86400)
      .description('CORS preflight cache duration'),
  }).required(),

  validation: Joi.object({
    enableXssProtection: Joi.boolean()
      .default(true)
      .description('XSS protection must be enabled in production'),
    enableSqlInjectionProtection: Joi.boolean()
      .default(true)
      .description('SQL injection protection must be enabled'),
    enableNoSqlInjectionProtection: Joi.boolean()
      .default(true)
      .description('NoSQL injection protection must be enabled'),
    maxPayloadSize: Joi.string()
      .default('1mb')
      .description('Smaller payload size in production'),
    enableStrictValidation: Joi.boolean()
      .default(true)
      .description('Enable strict validation in production'),
  }).required(),

  circuitBreaker: Joi.object({
    failureThreshold: Joi.number()
      .integer()
      .min(1)
      .default(3)
      .description('Lower failure threshold in production'),
    resetTimeout: Joi.number()
      .positive()
      .default(30000)
      .description('Faster reset in production'),
    monitoringPeriod: Joi.number()
      .positive()
      .default(5000)
      .description('More frequent monitoring in production'),
    operationTimeout: Joi.number()
      .positive()
      .default(3000)
      .description('Shorter timeout in production'),
  }).required(),

  security: Joi.object({
    enableSecurityHeaders: Joi.boolean()
      .default(true)
      .description('Security headers must be enabled in production'),
    contentSecurityPolicy: Joi.string()
      .required()
      .description('CSP must be configured in production'),
    strictTransportSecurity: Joi.string()
      .default('max-age=31536000; includeSubDomains; preload')
      .description('Strict HSTS in production'),
    enableIpFiltering: Joi.boolean()
      .default(true)
      .description('IP filtering should be enabled in production'),
    allowedIps: Joi.array()
      .items(ipSchema)
      .min(1)
      .description('At least one allowed IP in production'),
    blockedIps: Joi.array()
      .items(ipSchema)
      .default([])
      .description('Blocked IP addresses'),
    enableGeoFiltering: Joi.boolean()
      .default(true)
      .description('Geographic filtering recommended in production'),
    allowedCountries: Joi.array()
      .items(countryCodeSchema)
      .min(1)
      .description('At least one allowed country'),
    blockedCountries: Joi.array()
      .items(countryCodeSchema)
      .default([])
      .description('Blocked countries'),
  }).required(),

  logging: Joi.object({
    enableSecurityLogging: Joi.boolean()
      .default(true)
      .description('Security logging must be enabled in production'),
    logLevel: Joi.string()
      .valid('error', 'warn', 'info')
      .default('warn')
      .description('Production log level'),
    enableAuditTrail: Joi.boolean()
      .default(true)
      .description('Audit trail must be enabled in production'),
    auditRetentionDays: Joi.number()
      .integer()
      .min(365)
      .default(365)
      .description('Minimum 1 year retention in production'),
  }).required(),
}).required();

/**
 * Test environment configuration schema (more permissive)
 */
export const testSecurityConfigSchema = Joi.object({
  jwt: Joi.object({
    accessTokenSecret: Joi.string()
      .min(16)
      .default('test-access-secret-12345678')
      .description('Test JWT secret'),
    refreshTokenSecret: Joi.string()
      .min(16)
      .default('test-refresh-secret-12345678')
      .description('Test JWT refresh secret'),
    accessTokenExpiry: Joi.string()
      .default('1h')
      .description('Longer expiry for testing'),
    refreshTokenExpiry: Joi.string()
      .default('24h')
      .description('Longer refresh expiry for testing'),
    issuer: Joi.string().default('kadai-test').description('Test JWT issuer'),
    audience: Joi.string()
      .default('kadai-test-api')
      .description('Test JWT audience'),
    algorithm: Joi.string()
      .valid('HS256', 'HS384', 'HS512')
      .default('HS256')
      .description('Simple algorithm for testing'),
  }).required(),

  redis: Joi.object({
    host: Joi.string().default('localhost').description('Test Redis host'),
    port: portSchema.default(6379),
    password: Joi.string()
      .allow('')
      .optional()
      .description('Optional password for testing'),
    db: Joi.number()
      .integer()
      .min(0)
      .max(15)
      .default(15)
      .description('Use separate DB for tests'),
    url: redisUrlSchema.optional(),
    keyPrefix: Joi.string()
      .default('kadai:test:security:')
      .description('Test key prefix'),
    connectionTimeout: Joi.number()
      .positive()
      .default(1000)
      .description('Fast timeout for tests'),
    lazyConnect: Joi.boolean().default(true),
    retryDelayOnFailover: Joi.number()
      .positive()
      .default(10)
      .description('Fast retry for tests'),
    maxRetriesPerRequest: Joi.number()
      .integer()
      .min(0)
      .default(1)
      .description('Limited retries for tests'),
  }).required(),

  rateLimit: Joi.object({
    windowMs: Joi.number()
      .positive()
      .default(1000)
      .description('Short window for testing'),
    max: Joi.number()
      .positive()
      .default(1000)
      .description('High limit for testing'),
    skipSuccessfulRequests: Joi.boolean().default(false),
    skipFailedRequests: Joi.boolean().default(false),
    keyGenerator: Joi.string().valid('ip', 'user', 'session').default('ip'),
    onLimitReached: Joi.function().optional(),
  }).required(),

  cors: Joi.object({
    origin: Joi.any().default('*').description('Permissive CORS for testing'),
    methods: Joi.array()
      .items(Joi.string())
      .default(['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH']),
    allowedHeaders: Joi.array().items(Joi.string()).default(['*']),
    credentials: Joi.boolean().default(true),
    maxAge: Joi.number().positive().default(3600),
  }).required(),

  validation: Joi.object({
    enableXssProtection: Joi.boolean()
      .default(false)
      .description('Disable for easier testing'),
    enableSqlInjectionProtection: Joi.boolean()
      .default(false)
      .description('Disable for easier testing'),
    enableNoSqlInjectionProtection: Joi.boolean()
      .default(false)
      .description('Disable for easier testing'),
    maxPayloadSize: Joi.string()
      .default('50mb')
      .description('Large payload for testing'),
    enableStrictValidation: Joi.boolean()
      .default(false)
      .description('Relaxed validation for testing'),
  }).required(),

  circuitBreaker: Joi.object({
    failureThreshold: Joi.number()
      .integer()
      .min(1)
      .default(10)
      .description('High threshold for testing'),
    resetTimeout: Joi.number()
      .positive()
      .default(1000)
      .description('Fast reset for testing'),
    monitoringPeriod: Joi.number()
      .positive()
      .default(500)
      .description('Fast monitoring for testing'),
    operationTimeout: Joi.number()
      .positive()
      .default(10000)
      .description('Long timeout for testing'),
  }).required(),

  security: Joi.object({
    enableSecurityHeaders: Joi.boolean()
      .default(false)
      .description('Disable for easier testing'),
    contentSecurityPolicy: Joi.string()
      .default("default-src 'self' 'unsafe-inline' 'unsafe-eval'")
      .description('Permissive CSP for testing'),
    strictTransportSecurity: Joi.string()
      .optional()
      .description('Optional HSTS for testing'),
    enableIpFiltering: Joi.boolean()
      .default(false)
      .description('Disable IP filtering for testing'),
    allowedIps: Joi.array().items(ipSchema).default([]),
    blockedIps: Joi.array().items(ipSchema).default([]),
    enableGeoFiltering: Joi.boolean()
      .default(false)
      .description('Disable geo filtering for testing'),
    allowedCountries: Joi.array().items(countryCodeSchema).default([]),
    blockedCountries: Joi.array().items(countryCodeSchema).default([]),
  }).required(),

  logging: Joi.object({
    enableSecurityLogging: Joi.boolean()
      .default(true)
      .description('Keep logging for test verification'),
    logLevel: Joi.string()
      .valid('error', 'warn', 'info', 'debug')
      .default('debug')
      .description('Verbose logging for testing'),
    enableAuditTrail: Joi.boolean()
      .default(false)
      .description('Disable audit trail for testing'),
    auditRetentionDays: Joi.number()
      .integer()
      .min(1)
      .default(1)
      .description('Short retention for testing'),
  }).required(),
}).required();

/**
 * Get the appropriate schema based on environment
 */
export function getSecurityConfigSchema(
  environment = 'development'
): Joi.ObjectSchema {
  switch (environment.toLowerCase()) {
    case 'production':
    case 'prod':
      return productionSecurityConfigSchema;
    case 'test':
    case 'testing':
      return testSecurityConfigSchema;
    case 'development':
    case 'dev':
    default:
      return developmentSecurityConfigSchema;
  }
}

/**
 * Validate security configuration
 */
export function validateSecurityConfig(
  config: any,
  environment?: string
): { error?: Joi.ValidationError; value?: any } {
  const schema = getSecurityConfigSchema(
    environment || process.env.NODE_ENV || 'development'
  );
  return schema.validate(config, {
    allowUnknown: false,
    abortEarly: false,
    stripUnknown: true,
  });
}

/**
 * Configuration validation middleware for NestJS
 */
export function securityConfigValidation() {
  return (config: Record<string, any>) => {
    const environment = config.NODE_ENV || 'development';
    const securityConfig = config.security || {};

    const { error, value } = validateSecurityConfig(
      securityConfig,
      environment
    );

    if (error) {
      throw new Error(
        `Security configuration validation failed: ${error.message}`
      );
    }

    return {
      ...config,
      security: value,
    };
  };
}
