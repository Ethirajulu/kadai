/**
 * Redis Circuit Breaker - Implements circuit breaker pattern for Redis operations
 * Provides graceful degradation when Redis is unavailable
 */

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringWindow: number;
  expectedFailureRate: number;
}

export interface CircuitBreakerMetrics {
  totalRequests: number;
  totalFailures: number;
  lastFailureTime: number;
  state: CircuitBreakerState;
  nextAttemptTime: number;
}

export class RedisCircuitBreaker {
  private metrics: CircuitBreakerMetrics;
  private config: CircuitBreakerConfig;
  private readonly name: string;

  constructor(name: string, config: Partial<CircuitBreakerConfig> = {}) {
    this.name = name;
    this.config = {
      failureThreshold: config.failureThreshold ?? 5,
      recoveryTimeout: config.recoveryTimeout ?? 60000, // 1 minute
      monitoringWindow: config.monitoringWindow ?? 300000, // 5 minutes
      expectedFailureRate: config.expectedFailureRate ?? 0.5, // 50%
    };

    this.metrics = {
      totalRequests: 0,
      totalFailures: 0,
      lastFailureTime: 0,
      state: CircuitBreakerState.CLOSED,
      nextAttemptTime: 0,
    };
  }

  /**
   * Execute a Redis operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>, fallback?: () => T): Promise<T> {
    // Check if circuit is open
    if (this.metrics.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.metrics.nextAttemptTime) {
        if (fallback) {
          return fallback();
        }
        throw new Error(`Circuit breaker [${this.name}] is OPEN. Next attempt at: ${new Date(this.metrics.nextAttemptTime).toISOString()}`);
      } else {
        // Transition to half-open for testing
        this.metrics.state = CircuitBreakerState.HALF_OPEN;
      }
    }

    this.metrics.totalRequests++;

    try {
      const result = await operation();

      // Success - reset failure count if in half-open state
      if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
        this.reset();
      }

      return result;
    } catch (error) {
      this.recordFailure();

      // If fallback is provided, use it instead of throwing
      if (fallback) {
        return fallback();
      }

      throw error;
    }
  }

  /**
   * Record a failure and update circuit state
   */
  private recordFailure(): void {
    this.metrics.totalFailures++;
    this.metrics.lastFailureTime = Date.now();

    // Calculate failure rate within monitoring window
    const recentFailures = this.metrics.totalFailures;
    const recentRequests = this.metrics.totalRequests;

    const failureRate = recentRequests > 0 ? recentFailures / recentRequests : 0;

    // Open circuit if failure threshold exceeded
    if (this.metrics.totalFailures >= this.config.failureThreshold || 
        failureRate >= this.config.expectedFailureRate) {
      this.openCircuit();
    }
  }

  /**
   * Open the circuit breaker
   */
  private openCircuit(): void {
    this.metrics.state = CircuitBreakerState.OPEN;
    this.metrics.nextAttemptTime = Date.now() + this.config.recoveryTimeout;
  }

  /**
   * Reset the circuit breaker to closed state
   */
  private reset(): void {
    this.metrics.state = CircuitBreakerState.CLOSED;
    this.metrics.totalRequests = 0;
    this.metrics.totalFailures = 0;
    this.metrics.lastFailureTime = 0;
    this.metrics.nextAttemptTime = 0;
  }

  /**
   * Get current circuit breaker metrics
   */
  getMetrics(): CircuitBreakerMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.metrics.state;
  }

  /**
   * Check if circuit is available for operation
   */
  isAvailable(): boolean {
    if (this.metrics.state === CircuitBreakerState.CLOSED) {
      return true;
    }

    if (this.metrics.state === CircuitBreakerState.HALF_OPEN) {
      return true;
    }

    // Open state - check if recovery time has passed
    return Date.now() >= this.metrics.nextAttemptTime;
  }

  /**
   * Manually open the circuit (for testing or maintenance)
   */
  open(): void {
    this.openCircuit();
  }

  /**
   * Manually close the circuit (for testing or recovery)
   */
  close(): void {
    this.reset();
  }

  /**
   * Get health status for monitoring
   */
  getHealthStatus(): {
    name: string;
    state: CircuitBreakerState;
    isHealthy: boolean;
    metrics: CircuitBreakerMetrics;
    config: CircuitBreakerConfig;
  } {
    return {
      name: this.name,
      state: this.metrics.state,
      isHealthy: this.metrics.state !== CircuitBreakerState.OPEN,
      metrics: this.getMetrics(),
      config: this.config,
    };
  }
}