import {
  BaseSeedScript,
  SeedOptions,
  SeedResult,
  SeedEvent,
  SeedEventHandler,
  SeedPerformanceMetrics,
} from '../../types';

export abstract class BaseSeeder implements BaseSeedScript {
  public abstract readonly id: string;
  public abstract readonly name: string;
  public abstract readonly version: string;
  public abstract readonly description: string;
  public abstract readonly dependencies: string[];

  protected eventHandlers: SeedEventHandler[] = [];
  protected performanceMetrics: SeedPerformanceMetrics[] = [];

  constructor(protected options?: SeedOptions) {}

  abstract execute(options?: SeedOptions): Promise<SeedResult>;

  async rollback?(): Promise<SeedResult> {
    throw new Error(`Rollback not implemented for seeder: ${this.id}`);
  }

  async validate?(): Promise<boolean> {
    return true; // Default validation passes
  }

  // Event handling
  addEventListener(handler: SeedEventHandler): void {
    this.eventHandlers.push(handler);
  }

  removeEventListener(handler: SeedEventHandler): void {
    const index = this.eventHandlers.indexOf(handler);
    if (index > -1) {
      this.eventHandlers.splice(index, 1);
    }
  }

  protected emitEvent(event: SeedEvent): void {
    this.eventHandlers.forEach((handler) => {
      try {
        handler(event);
      } catch (error) {
        console.error('Error in seed event handler:', error);
      }
    });
  }

  // Performance tracking
  protected trackPerformance(
    operation: string,
    database: string,
    recordCount: number,
    duration: number,
    memoryUsage: number = process.memoryUsage().heapUsed,
    errors = 0
  ): void {
    const metric: SeedPerformanceMetrics = {
      operation,
      database,
      recordCount,
      duration,
      recordsPerSecond: recordCount / (duration / 1000),
      memoryUsage,
      errors,
      timestamp: new Date(),
    };

    this.performanceMetrics.push(metric);
  }

  getPerformanceMetrics(): SeedPerformanceMetrics[] {
    return [...this.performanceMetrics];
  }

  clearPerformanceMetrics(): void {
    this.performanceMetrics = [];
  }

  // Utility methods
  protected async measureExecutionTime<T>(
    operation: () => Promise<T>
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await operation();
    const duration = Date.now() - startTime;
    return { result, duration };
  }

  protected createSeedResult(
    success: boolean,
    recordsCreated: number,
    duration: number,
    errors: Error[] = [],
    details?: Record<string, any>
  ): SeedResult {
    return {
      success,
      recordsCreated,
      duration,
      errors: errors.length > 0 ? errors : undefined,
      details,
    };
  }

  protected validateOptions(options: SeedOptions = {}): SeedOptions {
    return {
      userCount: 10,
      productCount: 50,
      orderCount: 30,
      taskCount: 20,
      messageCount: 100,
      vectorCount: 50,
      createRelationships: true,
      scenario: 'ecommerce',
      cleanup: false,
      validateData: true,
      ...options,
    };
  }

  protected async executeWithErrorHandling<T>(
    operation: () => Promise<T>,
    operationName: string
  ): Promise<{ result?: T; error?: Error }> {
    try {
      const result = await operation();
      return { result };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      console.error(`Error in ${operationName}:`, err);
      return { error: err };
    }
  }

  // Batch processing utilities
  protected async processBatches<T, R>(
    items: T[],
    batchSize: number,
    processor: (batch: T[]) => Promise<R>
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const result = await processor(batch);
      results.push(result);
    }

    return results;
  }

  protected chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  // Data validation utilities
  protected validateRequiredFields<T extends Record<string, any>>(
    data: T,
    requiredFields: (keyof T)[]
  ): boolean {
    return requiredFields.every(
      (field) => data[field] !== undefined && data[field] !== null
    );
  }

  protected validateDataTypes<T extends Record<string, any>>(
    data: T,
    typeMap: Record<keyof T, string>
  ): boolean {
    return Object.entries(typeMap).every(([field, expectedType]) => {
      const value = data[field as keyof T];
      return value === undefined || typeof value === expectedType;
    });
  }

  // Logging utilities
  protected log(
    level: 'info' | 'warn' | 'error',
    message: string,
    data?: unknown
  ): void {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${
      this.id
    }] ${level.toUpperCase()}: ${message}`;

    if (data) {
      console.log(logMessage, data);
    } else {
      console.log(logMessage);
    }
  }

  protected logInfo(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  protected logWarn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  protected logError(message: string, error?: unknown): void {
    this.log('error', message, error);
  }
}
