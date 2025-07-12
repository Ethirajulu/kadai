import { Logger } from '@nestjs/common';

export interface RetryConfig {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
}

export interface RetryContext {
  attempt: number;
  lastError?: Error;
  totalDuration: number;
  startTime: Date;
}

export class RetryUtil {
  private static readonly logger = new Logger(RetryUtil.name);

  /**
   * Get default retry configuration for database operations
   */
  static getDefaultRetryConfig(operationType: 'connection' | 'query' | 'transaction'): RetryConfig {
    const baseConfig = {
      backoffMultiplier: 2,
      retryableErrors: [
        'ECONNREFUSED',
        'ENOTFOUND',
        'ETIMEDOUT',
        'ECONNRESET',
        'EPIPE',
        'connection timeout',
        'server selection timeout',
        'network error'
      ],
      nonRetryableErrors: [
        'authentication failed',
        'access denied',
        'permission denied',
        'invalid credentials',
        'syntax error',
        'constraint violation'
      ]
    };

    switch (operationType) {
      case 'connection':
        return {
          ...baseConfig,
          maxAttempts: 5,
          initialDelay: 1000,
          maxDelay: 10000,
        };
      case 'query':
        return {
          ...baseConfig,
          maxAttempts: 3,
          initialDelay: 100,
          maxDelay: 2000,
        };
      case 'transaction':
        return {
          ...baseConfig,
          maxAttempts: 2,
          initialDelay: 50,
          maxDelay: 500,
        };
      default:
        return {
          ...baseConfig,
          maxAttempts: 3,
          initialDelay: 1000,
          maxDelay: 5000,
        };
    }
  }

  /**
   * Execute function with retry logic
   */
  static async executeWithRetry<T>(
    fn: () => Promise<T>,
    config: RetryConfig,
    context?: Partial<RetryContext>
  ): Promise<T> {
    const ctx: RetryContext = {
      attempt: 0,
      totalDuration: 0,
      startTime: new Date(),
      ...context
    };

    let lastError: Error;

    for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
      ctx.attempt = attempt;
      
      try {
        const result = await fn();
        
        if (attempt > 1) {
          ctx.totalDuration = Date.now() - ctx.startTime.getTime();
          this.logger.log(`Operation succeeded on attempt ${attempt}/${config.maxAttempts} after ${ctx.totalDuration}ms`);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        ctx.lastError = lastError;
        ctx.totalDuration = Date.now() - ctx.startTime.getTime();

        // Check if error should not be retried
        if (!this.shouldRetryError(lastError, config)) {
          this.logger.error(`Non-retryable error encountered: ${lastError.message}`);
          throw lastError;
        }

        // Don't sleep on the last attempt
        if (attempt < config.maxAttempts) {
          const delay = this.calculateDelay(attempt, config);
          this.logger.warn(`Attempt ${attempt}/${config.maxAttempts} failed: ${lastError.message}. Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    this.logger.error(`All ${config.maxAttempts} attempts failed. Total duration: ${ctx.totalDuration}ms`);
    throw lastError!;
  }

  /**
   * Execute with exponential backoff
   */
  static async executeWithBackoff<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    initialDelay = 1000
  ): Promise<T> {
    const config = this.getDefaultRetryConfig('query');
    config.maxAttempts = maxAttempts;
    config.initialDelay = initialDelay;
    
    return this.executeWithRetry(fn, config);
  }

  /**
   * Calculate delay for next retry attempt
   */
  private static calculateDelay(attempt: number, config: RetryConfig): number {
    const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1);
    const jitteredDelay = exponentialDelay * (0.5 + Math.random() * 0.5); // Add jitter
    return Math.min(jitteredDelay, config.maxDelay);
  }

  /**
   * Check if error should be retried
   */
  private static shouldRetryError(error: Error, config: RetryConfig): boolean {
    const errorMessage = error.message.toLowerCase();
    
    // Check non-retryable errors first
    if (config.nonRetryableErrors) {
      const isNonRetryable = config.nonRetryableErrors.some(nonRetryableError =>
        errorMessage.includes(nonRetryableError.toLowerCase())
      );
      if (isNonRetryable) return false;
    }

    // Check retryable errors
    if (config.retryableErrors) {
      return config.retryableErrors.some(retryableError =>
        errorMessage.includes(retryableError.toLowerCase())
      );
    }

    // Default to retrying unknown errors
    return true;
  }

  /**
   * Sleep for specified milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create circuit breaker pattern for database operations
   */
  static createCircuitBreaker<T>(
    fn: () => Promise<T>,
    options: {
      failureThreshold: number;
      recoveryTimeout: number;
      monitoringPeriod: number;
    } = {
      failureThreshold: 5,
      recoveryTimeout: 60000,
      monitoringPeriod: 10000
    }
  ) {
    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let failureCount = 0;
    let lastFailureTime: Date | null = null;
    let successCount = 0;

    return async (): Promise<T> => {
      const now = new Date();

      // Check if we should transition from open to half-open
      if (state === 'open' && lastFailureTime) {
        const timeSinceLastFailure = now.getTime() - lastFailureTime.getTime();
        if (timeSinceLastFailure >= options.recoveryTimeout) {
          state = 'half-open';
          successCount = 0;
          this.logger.log('Circuit breaker transitioning to half-open state');
        }
      }

      // Reject immediately if circuit is open
      if (state === 'open') {
        throw new Error('Circuit breaker is open - operation rejected');
      }

      try {
        const result = await fn();
        
        // Success - handle state transitions
        if (state === 'half-open') {
          successCount++;
          if (successCount >= 3) { // Require 3 successes to close
            state = 'closed';
            failureCount = 0;
            this.logger.log('Circuit breaker closed - service recovered');
          }
        } else if (state === 'closed') {
          failureCount = 0; // Reset failure count on success
        }

        return result;
      } catch (error) {
        failureCount++;
        lastFailureTime = now;

        if (state === 'half-open') {
          state = 'open';
          this.logger.warn('Circuit breaker opened - service still failing');
        } else if (state === 'closed' && failureCount >= options.failureThreshold) {
          state = 'open';
          this.logger.warn(`Circuit breaker opened - ${failureCount} failures detected`);
        }

        throw error;
      }
    };
  }
}