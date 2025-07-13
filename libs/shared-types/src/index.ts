export * from './lib/shared-types';
export * from './lib/validation-schemas';

// Export specific items from database-transactions to avoid conflicts
export type {
  DatabaseClient,
  PrismaClient,
  TransactionOptions,
  TransactionResult,
  TransactionOperation,
  BatchOperation,
  SagaStep,
  DistributedTransactionOptions,
  TransactionParticipant
} from './lib/database-transactions';

export type {
  TransactionContext as DatabaseTransactionContext
} from './lib/database-transactions';

export {
  TransactionManager,
  TransactionLogger,
  createTransactionContext,
  generateTransactionId,
  UnitOfWork,
  SagaManager,
  TwoPhaseCommitManager,
  Transactional,
  Retryable
} from './lib/database-transactions';

// Re-export repository types with explicit naming to avoid conflicts
export type {
  BaseRepository,
  SearchableRepository,
  CacheableRepository,
  TransactionalRepository,
  UserRepository,
  ProductRepository,
  OrderRepository,
  MessageRepository,
  ChatSessionRepository,
  VectorRepository,
  CacheRepository,
  SearchOptions,
  BulkOperationResult,
  RepositoryConfig,
  AuditLog
} from './lib/repositories';

export {
  BaseRepositoryImpl,
  RepositoryError,
  NotFoundError,
  ConflictError,
  ValidationError as RepositoryValidationError,
  DatabaseError,
  TransactionError
} from './lib/repositories';
