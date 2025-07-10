import { Logger } from '@nestjs/common';
import {
  checkRequiredEnvVars,
  getEnvConfig,
  getServiceEnv,
} from './env-validation.js';

/**
 * Service startup configuration
 */
export interface ServiceStartupConfig {
  serviceName: string;
  requiredEnvVars?: string[];
  skipEnvValidation?: boolean;
  customValidation?: () => void;
}

/**
 * Initialize service with environment validation and basic setup
 */
export function initializeService(config: ServiceStartupConfig): void {
  const logger = new Logger('ServiceStartup');
  const {
    serviceName,
    requiredEnvVars = [],
    skipEnvValidation = false,
    customValidation,
  } = config;

  try {
    logger.log(`Initializing ${serviceName}...`);

    // Log environment info
    const envConfig = getEnvConfig();
    logger.log(`Environment: ${envConfig.environment}`);
    logger.log(`Node version: ${process.version}`);

    // Validate environment variables
    if (!skipEnvValidation) {
      logger.log('Validating environment configuration...');

      // Check required variables
      if (requiredEnvVars.length > 0) {
        checkRequiredEnvVars(requiredEnvVars);
      }

      // Validate service-specific environment
      getServiceEnv(serviceName);

      logger.log('Environment validation passed');
    }

    // Run custom validation if provided
    if (customValidation) {
      logger.log('Running custom validation...');
      customValidation();
      logger.log('Custom validation passed');
    }

    logger.log(`${serviceName} initialized successfully`);
  } catch (error) {
    logger.error(`Failed to initialize ${serviceName}:`, error);
    process.exit(1);
  }
}

/**
 * Graceful shutdown handler
 */
export function setupGracefulShutdown(
  serviceName: string,
  cleanup?: () => Promise<void>
): void {
  const logger = new Logger('ServiceShutdown');

  const shutdown = async (signal: string) => {
    logger.log(
      `Received ${signal}, shutting down ${serviceName} gracefully...`
    );

    try {
      if (cleanup) {
        await cleanup();
      }

      logger.log(`${serviceName} shutdown complete`);
      process.exit(0);
    } catch (error) {
      logger.error(`Error during shutdown:`, error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGQUIT', () => shutdown('SIGQUIT'));
}

/**
 * Health check endpoint data
 */
export interface HealthCheckData {
  service: string;
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  environment: string;
  version?: string;
  dependencies?: Record<string, 'healthy' | 'unhealthy'>;
}

/**
 * Generate health check response
 */
export function generateHealthCheck(
  serviceName: string,
  version?: string
): HealthCheckData {
  const envConfig = getEnvConfig();

  return {
    service: serviceName,
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: envConfig.environment,
    version: version || 'unknown',
  };
}

/**
 * Check database connection health
 */
export async function checkDatabaseHealth(
  connectionCheck: () => Promise<boolean>
): Promise<boolean> {
  try {
    return await connectionCheck();
  } catch {
    return false;
  }
}

/**
 * Check external service health
 */
export async function checkExternalServiceHealth(
  serviceName: string,
  healthCheck: () => Promise<boolean>
): Promise<{ [key: string]: 'healthy' | 'unhealthy' }> {
  try {
    const isHealthy = await healthCheck();
    return { [serviceName]: isHealthy ? 'healthy' : 'unhealthy' };
  } catch {
    return { [serviceName]: 'unhealthy' };
  }
}
