// ============================
// BASE REPOSITORY INTERFACES
// ============================

export interface BaseRepository<T, ID = string> {
  findById(id: ID): Promise<T | null>;
  findAll(options?: PaginationOptions): Promise<PaginatedResponse<T>>;
  create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  update(id: ID, updates: Partial<T>): Promise<T | null>;
  delete(id: ID): Promise<boolean>;
  exists(id: ID): Promise<boolean>;
  count(filters?: Record<string, unknown>): Promise<number>;
}

export interface SearchableRepository<T, ID = string> extends BaseRepository<T, ID> {
  search(query: string, options?: SearchOptions): Promise<PaginatedResponse<T>>;
  findByFilters(filters: Record<string, unknown>, options?: PaginationOptions): Promise<PaginatedResponse<T>>;
}

export interface CacheableRepository<T, ID = string> extends BaseRepository<T, ID> {
  findByIdCached(id: ID, ttl?: number): Promise<T | null>;
  invalidateCache(id: ID): Promise<void>;
  invalidateAllCache(): Promise<void>;
}

export interface TransactionalRepository<T, ID = string> extends BaseRepository<T, ID> {
  createWithTransaction(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>, transaction?: unknown): Promise<T>;
  updateWithTransaction(id: ID, updates: Partial<T>, transaction?: unknown): Promise<T | null>;
  deleteWithTransaction(id: ID, transaction?: unknown): Promise<boolean>;
}

// ============================
// SPECIALIZED REPOSITORY INTERFACES
// ============================

export interface UserRepository extends SearchableRepository<User>, CacheableRepository<User>, TransactionalRepository<User> {
  findByEmail(email: string): Promise<User | null>;
  findByPhoneNumber(phoneNumber: string): Promise<User | null>;
  findByRole(role: UserRole, options?: PaginationOptions): Promise<PaginatedResponse<User>>;
  findActiveUsers(options?: PaginationOptions): Promise<PaginatedResponse<User>>;
  findByFilters(filters: UserFilters, options?: PaginationOptions): Promise<PaginatedResponse<User>>;
  updateLastLogin(id: string): Promise<void>;
  verifyEmail(id: string): Promise<void>;
  verifyPhone(id: string): Promise<void>;
}

export interface ProductRepository extends SearchableRepository<Product>, CacheableRepository<Product> {
  findBySellerId(sellerId: string, options?: PaginationOptions): Promise<PaginatedResponse<Product>>;
  findByCategory(category: string, options?: PaginationOptions): Promise<PaginatedResponse<Product>>;
  findBySku(sku: string): Promise<Product | null>;
  findByFilters(filters: ProductFilters, options?: PaginationOptions): Promise<PaginatedResponse<Product>>;
  findInStockProducts(options?: PaginationOptions): Promise<PaginatedResponse<Product>>;
  findByPriceRange(minPrice: number, maxPrice: number, options?: PaginationOptions): Promise<PaginatedResponse<Product>>;
  updateStock(id: string, quantity: number): Promise<void>;
  bulkUpdateStock(updates: Array<{ id: string; quantity: number }>): Promise<void>;
}

export interface OrderRepository extends SearchableRepository<Order>, TransactionalRepository<Order> {
  findByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResponse<Order>>;
  findBySellerId(sellerId: string, options?: PaginationOptions): Promise<PaginatedResponse<Order>>;
  findByStatus(status: OrderStatus, options?: PaginationOptions): Promise<PaginatedResponse<Order>>;
  findByOrderNumber(orderNumber: string): Promise<Order | null>;
  findByFilters(filters: OrderFilters, options?: PaginationOptions): Promise<PaginatedResponse<Order>>;
  findRecentOrders(days: number, options?: PaginationOptions): Promise<PaginatedResponse<Order>>;
  updateStatus(id: string, status: OrderStatus): Promise<void>;
  addOrderItem(orderId: string, item: Omit<OrderItem, 'id' | 'orderId' | 'createdAt'>): Promise<OrderItem>;
  removeOrderItem(orderId: string, itemId: string): Promise<void>;
  calculateTotal(orderId: string): Promise<number>;
}

export interface MessageRepository extends SearchableRepository<Message, string> {
  findBySessionId(sessionId: string, options?: PaginationOptions): Promise<PaginatedResponse<Message>>;
  findByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResponse<Message>>;
  findByPlatform(platform: Platform, options?: PaginationOptions): Promise<PaginatedResponse<Message>>;
  findByFilters(filters: MessageFilters, options?: PaginationOptions): Promise<PaginatedResponse<Message>>;
  findRecentMessages(sessionId: string, limit: number): Promise<Message[]>;
  markAsRead(messageId: string): Promise<void>;
  bulkDelete(messageIds: string[]): Promise<void>;
  deleteExpiredMessages(): Promise<number>;
}

export interface ChatSessionRepository extends SearchableRepository<ChatSession, string> {
  findByUserId(userId: string, options?: PaginationOptions): Promise<PaginatedResponse<ChatSession>>;
  findByPlatform(platform: Platform, options?: PaginationOptions): Promise<PaginatedResponse<ChatSession>>;
  findByPlatformUserId(platform: Platform, platformUserId: string): Promise<ChatSession | null>;
  findActiveSessions(options?: PaginationOptions): Promise<PaginatedResponse<ChatSession>>;
  updateLastActivity(sessionId: string): Promise<void>;
  closeSession(sessionId: string): Promise<void>;
  findExpiredSessions(): Promise<ChatSession[]>;
  deleteExpiredSessions(): Promise<number>;
}

export interface VectorRepository<T extends VectorPoint> {
  upsert(points: T[]): Promise<void>;
  search(options: VectorSearchOptions): Promise<SearchResult<T>[]>;
  get(id: string): Promise<T | null>;
  delete(id: string): Promise<boolean>;
  deleteMany(ids: string[]): Promise<number>;
  count(): Promise<number>;
  createIndex(indexName: string, vectorSize: number): Promise<void>;
  deleteIndex(indexName: string): Promise<void>;
}

export interface CacheRepository<T = unknown> {
  get<K extends T>(key: string): Promise<K | null>;
  set<K extends T>(key: string, value: K, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteMany(keys: string[]): Promise<number>;
  exists(key: string): Promise<boolean>;
  expire(key: string, ttl: number): Promise<void>;
  clear(): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
  increment(key: string, value?: number): Promise<number>;
  decrement(key: string, value?: number): Promise<number>;
}

// ============================
// REPOSITORY IMPLEMENTATIONS
// ============================

export abstract class BaseRepositoryImpl<T, ID = string> implements BaseRepository<T, ID> {
  abstract findById(id: ID): Promise<T | null>;
  abstract findAll(options?: PaginationOptions): Promise<PaginatedResponse<T>>;
  abstract create(entity: Omit<T, 'id' | 'createdAt' | 'updatedAt'>): Promise<T>;
  abstract update(id: ID, updates: Partial<T>): Promise<T | null>;
  abstract delete(id: ID): Promise<boolean>;
  abstract exists(id: ID): Promise<boolean>;
  abstract count(filters?: Record<string, unknown>): Promise<number>;

  protected buildPaginationResponse<K>(
    data: K[],
    total: number,
    page: number,
    limit: number
  ): PaginatedResponse<K> {
    const totalPages = Math.ceil(total / limit);
    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  protected validatePaginationOptions(options?: PaginationOptions): Required<PaginationOptions> {
    const page = Math.max(1, options?.page || 1);
    const limit = Math.min(100, Math.max(1, options?.limit || 10));
    const sortBy = options?.sortBy || 'createdAt';
    const sortOrder = options?.sortOrder || 'desc';
    
    return { page, limit, sortBy, sortOrder };
  }

  protected calculateOffset(page: number, limit: number): number {
    return (page - 1) * limit;
  }
}

// ============================
// ERROR HANDLING
// ============================

export class RepositoryError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'RepositoryError';
  }
}

export class NotFoundError extends RepositoryError {
  constructor(entity: string, id: string) {
    super(`${entity} with id ${id} not found`, 'NOT_FOUND', { entity, id });
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends RepositoryError {
  constructor(entity: string, field: string, value: string) {
    super(`${entity} with ${field} '${value}' already exists`, 'CONFLICT', { entity, field, value });
    this.name = 'ConflictError';
  }
}

export class ValidationError extends RepositoryError {
  constructor(message: string, field?: string) {
    super(message, 'VALIDATION_ERROR', { field });
    this.name = 'ValidationError';
  }
}

export class DatabaseError extends RepositoryError {
  constructor(message: string, originalError?: Error) {
    super(message, 'DATABASE_ERROR', { originalError: originalError?.message });
    this.name = 'DatabaseError';
  }
}

export class TransactionError extends RepositoryError {
  constructor(message: string, operation: string) {
    super(message, 'TRANSACTION_ERROR', { operation });
    this.name = 'TransactionError';
  }
}

// ============================
// UTILITY TYPES
// ============================

export interface SearchOptions {
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  fields?: string[];
  highlight?: boolean;
}

export interface BulkOperationResult {
  successful: number;
  failed: number;
  errors: Array<{
    index: number;
    error: string;
  }>;
}

export interface RepositoryConfig {
  defaultPageSize: number;
  maxPageSize: number;
  cacheEnabled: boolean;
  cacheTtl: number;
  enableSoftDelete: boolean;
  enableAuditLog: boolean;
}

export interface AuditLog {
  id: string;
  entityType: string;
  entityId: string;
  operation: 'CREATE' | 'UPDATE' | 'DELETE';
  oldData?: Record<string, unknown>;
  newData?: Record<string, unknown>;
  userId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

// Import types from shared-types
import type {
  User, Product, Order, Message, ChatSession, VectorPoint, OrderItem,
  UserRole, Platform, OrderStatus, UserFilters, ProductFilters, OrderFilters, MessageFilters,
  PaginationOptions, PaginatedResponse, SearchResult, VectorSearchOptions
} from './shared-types.js';