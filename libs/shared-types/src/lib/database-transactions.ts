// Generic database client interface that can be implemented by different ORMs
export interface DatabaseClient {
  $transaction?<T>(
    operation: (client: DatabaseClient) => Promise<T>,
    options?: TransactionOptions
  ): Promise<T>;
}

// Type alias for Prisma-specific client (to be used when Prisma is available)
export type PrismaClient = DatabaseClient & {
  $transaction<T>(
    operation: (client: PrismaClient) => Promise<T>,
    options?: {
      timeout?: number;
      isolationLevel?: 'ReadUncommitted' | 'ReadCommitted' | 'RepeatableRead' | 'Serializable';
      maxWait?: number;
    }
  ): Promise<T>;
};

// ============================
// TRANSACTION TYPES
// ============================

export interface TransactionOptions {
  timeout?: number;
  isolationLevel?:
    | 'ReadUncommitted'
    | 'ReadCommitted'
    | 'RepeatableRead'
    | 'Serializable';
  maxWait?: number;
  retryAttempts?: number;
  retryDelay?: number;
}

export interface TransactionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
  retryCount?: number;
  duration?: number;
}

export interface TransactionContext {
  id: string;
  startTime: Date;
  operations: TransactionOperation[];
  metadata?: Record<string, unknown>;
}

export interface TransactionOperation {
  operation: string;
  table: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'READ';
  entityId?: string;
  timestamp: Date;
  details?: Record<string, unknown>;
}

export interface BatchOperation<T> {
  operation: () => Promise<T>;
  rollback?: () => Promise<void>;
  description?: string;
}

// ============================
// TRANSACTION MANAGER
// ============================

export class TransactionManager<TClient extends DatabaseClient = PrismaClient> {
  private client: TClient;
  private readonly defaultOptions: TransactionOptions = {
    timeout: 30000,
    isolationLevel: 'ReadCommitted',
    maxWait: 5000,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  constructor(client: TClient) {
    this.client = client;
  }

  async executeTransaction<T>(
    operation: (tx: TClient) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T>> {
    const finalOptions = { ...this.defaultOptions, ...options };
    let retryCount = 0;
    const startTime = Date.now();

    while (retryCount <= (finalOptions.retryAttempts ?? 3)) {
      try {
        if (!this.client.$transaction) {
          throw new Error('Database client does not support transactions');
        }
        
        const result = await this.client.$transaction(
          async (tx: DatabaseClient) => {
            return await operation(tx as TClient);
          },
          {
            timeout: finalOptions.timeout,
            isolationLevel: finalOptions.isolationLevel,
            maxWait: finalOptions.maxWait,
          }
        );

        return {
          success: true,
          data: result,
          retryCount,
          duration: Date.now() - startTime,
        };
      } catch (error) {
        retryCount++;

        if (retryCount > (finalOptions.retryAttempts ?? 3)) {
          return {
            success: false,
            error:
              error instanceof Error ? error.message : 'Transaction failed',
            retryCount,
            duration: Date.now() - startTime,
          };
        }

        // Check if error is retryable
        if (this.isRetryableError(error)) {
          await this.delay((finalOptions.retryDelay ?? 1000) * retryCount);
          continue;
        }

        return {
          success: false,
          error: error instanceof Error ? error.message : 'Transaction failed',
          retryCount,
          duration: Date.now() - startTime,
        };
      }
    }

    return {
      success: false,
      error: 'Maximum retry attempts exceeded',
      retryCount,
      duration: Date.now() - startTime,
    };
  }

  async executeBatchOperations<T>(
    operations: BatchOperation<T>[],
    options: TransactionOptions = {}
  ): Promise<TransactionResult<T[]>> {
    return this.executeTransaction(async () => {
      const results: T[] = [];
      const executedOperations: Array<() => Promise<void>> = [];

      try {
        for (const operation of operations) {
          const result = await operation.operation();
          results.push(result);

          if (operation.rollback) {
            executedOperations.push(operation.rollback);
          }
        }

        return results;
      } catch (error) {
        // Execute rollback operations in reverse order
        for (let i = executedOperations.length - 1; i >= 0; i--) {
          try {
            await executedOperations[i]();
          } catch (rollbackError) {
            console.error('Rollback operation failed:', rollbackError);
          }
        }
        throw error;
      }
    }, options);
  }

  async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries = 3,
    delay = 1000
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt === maxRetries) {
          throw lastError;
        }

        if (this.isRetryableError(error)) {
          await this.delay(delay * (attempt + 1));
        } else {
          throw lastError;
        }
      }
    }

    throw lastError;
  }

  private isRetryableError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    const retryableErrors = [
      'P2034', // Transaction failed due to a write conflict or a deadlock
      'P2028', // Transaction API error
      'P2024', // Timed out fetching a new connection from the connection pool
      'P2037', // Too many database connections opened
    ];

    return retryableErrors.some((code) => error.message.includes(code));
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// ============================
// TRANSACTION DECORATORS
// ============================

export function Transactional<TClient extends DatabaseClient = PrismaClient>(options: TransactionOptions = {}) {
  return function <T extends { client: TClient; transactionManager?: TransactionManager<TClient> }>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: T, ...args: unknown[]) {
      const transactionManager =
        this.transactionManager || new TransactionManager(this.client);

      return transactionManager.executeTransaction(async (tx: TClient) => {
        // Replace the client instance with the transaction instance
        const originalClient = this.client;
        this.client = tx;

        try {
          return await originalMethod.apply(this, args);
        } finally {
          // Restore the original client instance
          this.client = originalClient;
        }
      }, options);
    };

    return descriptor;
  };
}

export function Retryable<TClient extends DatabaseClient = PrismaClient>(maxRetries = 3, delay = 1000) {
  return function <T extends { client: TClient; transactionManager?: TransactionManager<TClient> }>(
    target: T,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (this: T, ...args: unknown[]) {
      const transactionManager =
        this.transactionManager || new TransactionManager(this.client);

      return transactionManager.executeWithRetry(
        () => originalMethod.apply(this, args),
        maxRetries,
        delay
      );
    };

    return descriptor;
  };
}

// ============================
// TRANSACTION UTILITIES
// ============================

export class TransactionLogger {
  private context: TransactionContext;

  constructor(context: TransactionContext) {
    this.context = context;
  }

  logOperation(operation: Omit<TransactionOperation, 'timestamp'>) {
    const fullOperation: TransactionOperation = {
      ...operation,
      timestamp: new Date(),
    };

    this.context.operations.push(fullOperation);

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[Transaction ${this.context.id}] ${operation.action} ${operation.table}`,
        {
          operation: operation.operation,
          entityId: operation.entityId,
          details: operation.details,
        }
      );
    }
  }

  getContext(): TransactionContext {
    return { ...this.context };
  }

  getDuration(): number {
    return Date.now() - this.context.startTime.getTime();
  }
}

export function createTransactionContext(
  metadata?: Record<string, unknown>
): TransactionContext {
  return {
    id: generateTransactionId(),
    startTime: new Date(),
    operations: [],
    metadata,
  };
}

export function generateTransactionId(): string {
  return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// ============================
// TRANSACTION PATTERNS
// ============================

export class UnitOfWork {
  private operations: Array<() => Promise<void>> = [];
  private rollbackOperations: Array<() => Promise<void>> = [];
  private transactionManager: TransactionManager;

  constructor(transactionManager: TransactionManager) {
    this.transactionManager = transactionManager;
  }

  addOperation(operation: () => Promise<void>, rollback?: () => Promise<void>) {
    this.operations.push(operation);
    if (rollback) {
      this.rollbackOperations.unshift(rollback); // Add to front for reverse order
    }
  }

  async commit(): Promise<TransactionResult<void>> {
    return this.transactionManager.executeTransaction(async () => {
      for (const operation of this.operations) {
        await operation();
      }
    });
  }

  async rollback(): Promise<void> {
    for (const rollbackOperation of this.rollbackOperations) {
      try {
        await rollbackOperation();
      } catch (error) {
        console.error('Rollback operation failed:', error);
      }
    }
  }

  clear() {
    this.operations = [];
    this.rollbackOperations = [];
  }
}

// ============================
// SAGA PATTERN IMPLEMENTATION
// ============================

export interface SagaStep<T = unknown> {
  name: string;
  action: () => Promise<T>;
  compensation: (result?: T) => Promise<void>;
}

export class SagaManager {
  private steps: SagaStep[] = [];
  private executedSteps: Array<{ step: SagaStep; result: unknown }> = [];

  addStep(step: SagaStep) {
    this.steps.push(step);
  }

  async execute(): Promise<TransactionResult<unknown[]>> {
    const results: unknown[] = [];
    const startTime = Date.now();

    try {
      for (const step of this.steps) {
        const result = await step.action();
        results.push(result);
        this.executedSteps.push({ step, result });
      }

      return {
        success: true,
        data: results,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Execute compensation actions in reverse order
      for (let i = this.executedSteps.length - 1; i >= 0; i--) {
        const { step, result } = this.executedSteps[i];
        try {
          await step.compensation(result);
        } catch (compensationError) {
          console.error(
            `Compensation for step ${step.name} failed:`,
            compensationError
          );
        }
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Saga execution failed',
        duration: Date.now() - startTime,
      };
    }
  }

  clear() {
    this.steps = [];
    this.executedSteps = [];
  }
}

// ============================
// DISTRIBUTED TRANSACTION PATTERNS
// ============================

export interface DistributedTransactionOptions {
  timeout: number;
  participantTimeout: number;
  maxRetries: number;
}

export interface TransactionParticipant {
  id: string;
  prepare: () => Promise<boolean>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

export class TwoPhaseCommitManager {
  private participants: TransactionParticipant[] = [];
  private options: DistributedTransactionOptions;

  constructor(options: DistributedTransactionOptions) {
    this.options = options;
  }

  addParticipant(participant: TransactionParticipant) {
    this.participants.push(participant);
  }

  async execute(): Promise<TransactionResult<void>> {
    const startTime = Date.now();
    const preparedParticipants: TransactionParticipant[] = [];

    try {
      // Phase 1: Prepare
      for (const participant of this.participants) {
        const prepared = await this.executeWithTimeout(
          participant.prepare(),
          this.options.participantTimeout
        );

        if (!prepared) {
          throw new Error(`Participant ${participant.id} failed to prepare`);
        }

        preparedParticipants.push(participant);
      }

      // Phase 2: Commit
      for (const participant of preparedParticipants) {
        await this.executeWithTimeout(
          participant.commit(),
          this.options.participantTimeout
        );
      }

      return {
        success: true,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      // Rollback all prepared participants
      for (const participant of preparedParticipants) {
        try {
          await participant.rollback();
        } catch (rollbackError) {
          console.error(
            `Rollback for participant ${participant.id} failed:`,
            rollbackError
          );
        }
      }

      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Two-phase commit failed',
        duration: Date.now() - startTime,
      };
    }
  }

  private async executeWithTimeout<T>(
    promise: Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Operation timed out')), timeout);
      }),
    ]);
  }
}

// All exports are already declared above with their class/function definitions
