import { Pool } from 'pg';
import { MongoClient, Db } from 'mongodb';
import { Redis } from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
// Note: Import from shared-types when available
// For now, define minimal types locally to avoid import errors

// Temporary type definitions - replace with actual imports when shared-types is available
export interface PostgreSQLConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
}

export interface MongoDBConfig {
  host: string;
  port: number;
  database: string;
  username?: string;
  password?: string;
  authSource?: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export interface QdrantConfig {
  host: string;
  port: number;
  apiKey?: string;
  https?: boolean;
}

export const UserRole = {
  ADMIN: 'admin',
  SELLER: 'seller',
  CUSTOMER: 'customer',
  SUPPORT: 'support',
} as const;

export const OrderStatus = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
  REFUNDED: 'refunded',
} as const;

export const TaskStatus = {
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  BLOCKED: 'blocked',
} as const;

export type UserRole = typeof UserRole[keyof typeof UserRole];
export type OrderStatus = typeof OrderStatus[keyof typeof OrderStatus];
export type TaskStatus = typeof TaskStatus[keyof typeof TaskStatus];

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  isActive?: boolean;
  emailVerified?: boolean;
  phoneVerified?: boolean;
  sellerProfile?: SellerProfile;
  orders?: Order[];
  sessions?: any[];
  tasks?: Task[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  createdAt: Date;
  updatedAt: Date;
  dueDate?: Date;
  userId?: string;
  user?: User;
}

export interface Message {
  _id: string;
  content: string;
  sender: string;
  type: string;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
  timestamp: Date;
  sessionId?: string;
  userId?: string;
  platform?: string;
  platformMessageId?: string;
  isFromUser?: boolean;
  messageType?: string;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  sellerId?: string;
  currency?: string;
  stockQuantity?: number;
  sku?: string;
  images?: string[];
  isActive?: boolean;
  seller?: SellerProfile;
  orderItems?: any[];
}

export interface Order {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: number;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
  sellerId?: string;
  currency?: string;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  user?: User;
  seller?: SellerProfile;
  items?: any[];
  payments?: any[];
}

export interface SellerProfile {
  id: string;
  businessName: string;
  businessType: string;
  address: string;
  phone: string;
  createdAt: Date;
  updatedAt: Date;
  userId?: string;
  businessAddress?: string;
  businessPhone?: string;
  businessEmail?: string;
  gstNumber?: string;
  isVerified?: boolean;
  user?: User;
  products?: Product[];
}

// Base config type
interface BaseTestDataFactoryConfig {
  locale?: string;
  seed?: number;
}

export type TestDataFactoryConfig = BaseTestDataFactoryConfig;

// Extend shared config types with test-specific properties
export interface PostgreSQLTestConfig
  extends Omit<PostgreSQLConfig, 'host' | 'port'> {
  host?: string;
  port?: number;
  testDatabaseSuffix?: string;
  poolSize?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface MongoDBTestConfig
  extends Omit<MongoDBConfig, 'host' | 'port'> {
  host?: string;
  port?: number;
  testDatabaseSuffix?: string;
  timeout?: number;
  serverSelectionTimeoutMS?: number;
  maxPoolSize?: number;
  minPoolSize?: number;
}

export interface RedisTestConfig extends Omit<RedisConfig, 'host' | 'port'> {
  host?: string;
  port?: number;
  testKeyPrefix?: string;
  keyPrefix?: string;
  lazyConnect?: boolean;
  keepAlive?: number;
  family?: number;
}

export interface QdrantTestConfig extends Omit<QdrantConfig, 'host' | 'port'> {
  host?: string;
  port?: number;
  testCollectionPrefix?: string;
  timeout?: number;
}

// Connection wrapper types
export interface PostgreSQLConnection {
  pool: Pool;
  config: PostgreSQLTestConfig;
}

export interface MongoDBConnection {
  client: MongoClient;
  database: Db;
  config: MongoDBTestConfig;
}

export interface RedisConnection {
  client: Redis;
  config: RedisTestConfig;
}

export interface QdrantConnection {
  client: QdrantClient;
  config: QdrantTestConfig;
}

// Test-specific data types - now handled above

export interface UserTestData
  extends Omit<
    User,
    | 'id'
    | 'createdAt'
    | 'updatedAt'
    | 'sellerProfile'
    | 'orders'
    | 'sessions'
    | 'tasks'
    | 'name'
  > {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  name?: string;
}

export interface TaskTestData
  extends Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'user'> {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChatMessageTestData
  extends Omit<
    Message,
    '_id' | 'createdAt' | 'updatedAt' | 'expiresAt' | 'timestamp' | 'sender' | 'type'
  > {
  id?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
  sender?: string;
  type?: string;
}

export interface ProductTestData
  extends Omit<
    Product,
    'id' | 'createdAt' | 'updatedAt' | 'seller' | 'orderItems'
  > {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface OrderTestData
  extends Omit<
    Order,
    | 'id'
    | 'orderNumber'
    | 'createdAt'
    | 'updatedAt'
    | 'user'
    | 'seller'
    | 'items'
    | 'payments'
  > {
  id?: string;
  orderNumber?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface SellerProfileTestData
  extends Omit<
    SellerProfile,
    'id' | 'createdAt' | 'updatedAt' | 'user' | 'products' | 'address' | 'phone'
  > {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
  address?: string;
  phone?: string;
}

export type VectorTestData = VectorPoint;

// Database Manager Types
export interface DatabaseConnections {
  postgresql?: PostgreSQLConnection;
  mongodb?: MongoDBConnection;
  redis?: RedisConnection;
  qdrant?: QdrantConnection;
}

export interface TestDatabaseConfig {
  postgresql?: PostgreSQLTestConfig;
  mongodb?: MongoDBTestConfig;
  redis?: RedisTestConfig;
  qdrant?: QdrantTestConfig;
  isolation?: {
    useTransactions?: boolean;
    cleanupAfterEach?: boolean;
    resetSequences?: boolean;
  };
}
