// ============================
// CORE ENUMS
// ============================

export enum UserRole {
  CUSTOMER = 'CUSTOMER',
  SELLER = 'SELLER',
  ADMIN = 'ADMIN'
}

export enum OrderStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  PROCESSING = 'PROCESSING',
  SHIPPED = 'SHIPPED',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED'
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED'
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED'
}

export enum Platform {
  WHATSAPP = 'WHATSAPP',
  TELEGRAM = 'TELEGRAM',
  INSTAGRAM = 'INSTAGRAM',
  WEB = 'WEB'
}

// ============================
// POSTGRESQL ENTITIES
// ============================

export interface User {
  id: string;
  email: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  role: UserRole;
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  sellerProfile?: SellerProfile;
  orders?: Order[];
  sessions?: UserSession[];
  tasks?: Task[];
}

export interface SellerProfile {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  gstNumber?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  user: User;
  products?: Product[];
}

export interface UserSession {
  id: string;
  userId: string;
  sessionToken: string;
  expiresAt: Date;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  
  // Relations
  user: User;
}

export interface Product {
  id: string;
  sellerId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stockQuantity: number;
  sku?: string;
  category?: string;
  images?: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  seller: SellerProfile;
  orderItems?: OrderItem[];
}

export interface Order {
  id: string;
  userId: string;
  sellerId: string;
  orderNumber: string;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  user: User;
  seller: SellerProfile;
  items: OrderItem[];
  payments?: Payment[];
}

export interface OrderItem {
  id: string;
  orderId: string;
  productId: string;
  quantity: number;
  pricePerUnit: number;
  totalPrice: number;
  createdAt: Date;
  
  // Relations
  order: Order;
  product: Product;
}

export interface Payment {
  id: string;
  orderId: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  paymentMethod?: string;
  transactionId?: string;
  gatewayResponse?: string;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  order: Order;
}

export interface SystemMetadata {
  id: string;
  key: string;
  value: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority?: string;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
  
  // Relations
  user: User;
}

// ============================
// MONGODB ENTITIES
// ============================

export interface Message {
  _id: string;
  sessionId: string;
  userId?: string;
  content: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  platform: Platform;
  platformMessageId?: string;
  metadata?: Record<string, unknown>;
  isFromUser: boolean;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface ChatSession {
  _id: string;
  userId?: string;
  platform: Platform;
  platformUserId: string;
  sessionToken: string;
  isActive: boolean;
  language?: string;
  metadata?: Record<string, unknown>;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface ConversationHistory {
  _id: string;
  sessionId: string;
  userId?: string;
  platform: Platform;
  summary: string;
  messageCount: number;
  startTime: Date;
  endTime: Date;
  topics?: string[];
  sentiment?: string;
  analytics?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

// ============================
// QDRANT VECTOR ENTITIES
// ============================

export interface VectorPoint {
  id: string;
  vector: number[];
  payload?: Record<string, unknown>;
}

export interface ProductEmbedding {
  id: string;
  productId: string;
  sellerId: string;
  vector: number[];
  payload: {
    name: string;
    description: string;
    category: string;
    price: number;
    currency: string;
    tags?: string[];
    createdAt: string;
  };
}

export interface ConversationEmbedding {
  id: string;
  sessionId: string;
  userId?: string;
  vector: number[];
  payload: {
    content: string;
    platform: Platform;
    timestamp: string;
    intent?: string;
    entities?: Record<string, unknown>;
  };
}

export interface DocumentEmbedding {
  id: string;
  documentId: string;
  vector: number[];
  payload: {
    title: string;
    content: string;
    documentType: string;
    tags?: string[];
    createdAt: string;
  };
}

export interface ImageEmbedding {
  id: string;
  imageId: string;
  productId?: string;
  vector: number[];
  payload: {
    imageUrl: string;
    description?: string;
    tags?: string[];
    createdAt: string;
  };
}

export interface UserBehaviorEmbedding {
  id: string;
  userId: string;
  vector: number[];
  payload: {
    behaviorType: string;
    metadata: Record<string, unknown>;
    timestamp: string;
  };
}

export interface SellerCatalogEmbedding {
  id: string;
  sellerId: string;
  vector: number[];
  payload: {
    catalogSummary: string;
    productCount: number;
    categories: string[];
    tags?: string[];
    createdAt: string;
  };
}

// ============================
// REDIS CACHE ENTITIES
// ============================

export interface CacheEntry<T = unknown> {
  key: string;
  value: T;
  ttl?: number;
  createdAt: Date;
  expiresAt?: Date;
}

export interface SessionCache {
  sessionId: string;
  userId: string;
  data: Record<string, unknown>;
  expiresAt: Date;
}

export interface RateLimitEntry {
  key: string;
  count: number;
  resetTime: Date;
}

// ============================
// SHARED UTILITY TYPES
// ============================

export interface PaginationOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
  timestamp: Date;
}

export interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  statusCode: number;
  timestamp: Date;
}

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  service: string;
  timestamp: Date;
  details?: Record<string, unknown>;
  responseTime?: number;
}

// ============================
// VALIDATION HELPERS
// ============================

export type CreateUserInput = Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'sellerProfile' | 'orders' | 'sessions' | 'tasks'>;
export type UpdateUserInput = Partial<Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'sellerProfile' | 'orders' | 'sessions' | 'tasks'>>;

export type CreateProductInput = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'seller' | 'orderItems'>;
export type UpdateProductInput = Partial<Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'seller' | 'orderItems'>>;

export type CreateOrderInput = Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'user' | 'seller' | 'items' | 'payments'>;
export type UpdateOrderInput = Partial<Omit<Order, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt' | 'user' | 'seller' | 'items' | 'payments'>>;

export type CreateMessageInput = Omit<Message, '_id' | 'createdAt' | 'updatedAt' | 'expiresAt'>;
export type UpdateMessageInput = Partial<Omit<Message, '_id' | 'createdAt' | 'updatedAt' | 'expiresAt'>>;

export type CreateChatSessionInput = Omit<ChatSession, '_id' | 'createdAt' | 'updatedAt' | 'expiresAt'>;
export type UpdateChatSessionInput = Partial<Omit<ChatSession, '_id' | 'createdAt' | 'updatedAt' | 'expiresAt'>>;

// ============================
// SEARCH AND FILTER TYPES
// ============================

export interface UserFilters {
  role?: UserRole;
  isActive?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface ProductFilters {
  sellerId?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  isActive?: boolean;
  inStock?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface OrderFilters {
  userId?: string;
  sellerId?: string;
  status?: OrderStatus;
  minAmount?: number;
  maxAmount?: number;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface MessageFilters {
  sessionId?: string;
  userId?: string;
  platform?: Platform;
  messageType?: string;
  isFromUser?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface VectorSearchOptions {
  vector: number[];
  limit?: number;
  threshold?: number;
  filter?: Record<string, unknown>;
  withPayload?: boolean;
  withVector?: boolean;
}

export interface SearchResult<T = unknown> {
  id: string;
  score: number;
  payload?: T;
  vector?: number[];
}
