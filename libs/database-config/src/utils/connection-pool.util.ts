import { Logger } from '@nestjs/common';

export interface ConnectionPoolConfig {
  max: number;
  min: number;
  acquireTimeoutMillis: number;
  createTimeoutMillis: number;
  destroyTimeoutMillis: number;
  idleTimeoutMillis: number;
  reapIntervalMillis: number;
  createRetryIntervalMillis: number;
}

export interface PoolStatistics {
  size: number;
  available: number;
  borrowed: number;
  invalid: number;
  pending: number;
  max: number;
  min: number;
}

export class ConnectionPoolUtil {
  private static readonly logger = new Logger(ConnectionPoolUtil.name);

  /**
   * Get default pool configuration based on database type
   */
  static getDefaultPoolConfig(databaseType: 'postgresql' | 'mongodb' | 'redis'): ConnectionPoolConfig {
    const baseConfig = {
      acquireTimeoutMillis: 30000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      reapIntervalMillis: 1000,
      createRetryIntervalMillis: 200,
    };

    switch (databaseType) {
      case 'postgresql':
        return {
          ...baseConfig,
          max: 20,
          min: 2,
        };
      case 'mongodb':
        return {
          ...baseConfig,
          max: 100,
          min: 5,
        };
      case 'redis':
        return {
          ...baseConfig,
          max: 10,
          min: 1,
        };
      default:
        return {
          ...baseConfig,
          max: 10,
          min: 1,
        };
    }
  }

  /**
   * Validate pool configuration
   */
  static validatePoolConfig(config: Partial<ConnectionPoolConfig>): string[] {
    const errors: string[] = [];

    if (config.max !== undefined && config.max < 1) {
      errors.push('Pool max size must be at least 1');
    }

    if (config.min !== undefined && config.min < 0) {
      errors.push('Pool min size must be non-negative');
    }

    if (config.max !== undefined && config.min !== undefined && config.min > config.max) {
      errors.push('Pool min size cannot exceed max size');
    }

    if (config.acquireTimeoutMillis !== undefined && config.acquireTimeoutMillis < 1000) {
      errors.push('Acquire timeout should be at least 1000ms');
    }

    if (config.createTimeoutMillis !== undefined && config.createTimeoutMillis < 1000) {
      errors.push('Create timeout should be at least 1000ms');
    }

    return errors;
  }

  /**
   * Calculate pool health score (0-100)
   */
  static calculatePoolHealth(stats: PoolStatistics): number {
    if (stats.size === 0) return 0;

    const utilizationRatio = stats.borrowed / stats.max;
    const availabilityRatio = stats.available / stats.size;
    const invalidRatio = stats.invalid / stats.size;

    // Optimal utilization is around 60-80%
    let utilizationScore = 100;
    if (utilizationRatio > 0.9) {
      utilizationScore = Math.max(0, 100 - (utilizationRatio - 0.9) * 500);
    } else if (utilizationRatio < 0.1) {
      utilizationScore = Math.max(50, utilizationRatio * 500);
    }

    // High availability is good
    const availabilityScore = availabilityRatio * 100;

    // Low invalid connections is good
    const validityScore = Math.max(0, 100 - invalidRatio * 200);

    // Pending connections should be minimal
    const pendingScore = Math.max(0, 100 - (stats.pending / stats.max) * 100);

    return Math.round((utilizationScore + availabilityScore + validityScore + pendingScore) / 4);
  }

  /**
   * Generate pool status report
   */
  static generatePoolReport(stats: PoolStatistics): string {
    const health = this.calculatePoolHealth(stats);
    const utilizationPercent = Math.round((stats.borrowed / stats.max) * 100);
    
    return `Pool Health: ${health}% | Utilization: ${utilizationPercent}% (${stats.borrowed}/${stats.max}) | Available: ${stats.available} | Invalid: ${stats.invalid} | Pending: ${stats.pending}`;
  }

  /**
   * Check if pool needs scaling
   */
  static shouldScalePool(stats: PoolStatistics, config: ConnectionPoolConfig): {
    shouldScale: boolean;
    direction: 'up' | 'down' | 'none';
    reason: string;
  } {
    const utilizationRatio = stats.borrowed / stats.max;
    const availabilityRatio = stats.available / stats.size;

    // Scale up conditions
    if (utilizationRatio > 0.8 && stats.pending > 0) {
      return {
        shouldScale: true,
        direction: 'up',
        reason: 'High utilization with pending connections'
      };
    }

    if (availabilityRatio < 0.1 && stats.size < config.max) {
      return {
        shouldScale: true,
        direction: 'up',
        reason: 'Low availability'
      };
    }

    // Scale down conditions
    if (utilizationRatio < 0.2 && stats.size > config.min && stats.available > config.min) {
      return {
        shouldScale: true,
        direction: 'down',
        reason: 'Low utilization'
      };
    }

    return {
      shouldScale: false,
      direction: 'none',
      reason: 'Pool is optimally sized'
    };
  }

  /**
   * Log pool statistics
   */
  static logPoolStats(serviceName: string, stats: PoolStatistics): void {
    const report = this.generatePoolReport(stats);
    const health = this.calculatePoolHealth(stats);

    if (health < 50) {
      this.logger.warn(`${serviceName} - ${report}`);
    } else if (health < 80) {
      this.logger.log(`${serviceName} - ${report}`);
    } else {
      this.logger.debug(`${serviceName} - ${report}`);
    }
  }
}