import { Pool, PoolConfig } from 'pg';
import { MongoClient, MongoClientOptions, Db } from 'mongodb';
import { Redis, RedisOptions } from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';

// PostgreSQL Types
export interface PostgreSQLTestConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  ssl?: boolean;
  poolConfig?: PoolConfig;
}

export interface PostgreSQLConnection {
  pool: Pool;
  config: PostgreSQLTestConfig;
}

// MongoDB Types
export interface MongoDBTestConfig {
  uri: string;
  database: string;
  options?: MongoClientOptions;
}

export interface MongoDBConnection {
  client: MongoClient;
  database: Db;
  config: MongoDBTestConfig;
}

// Redis Types
export interface RedisTestConfig {
  host: string;
  port: number;
  password?: string;
  keyPrefix?: string;
  db?: number;
  options?: RedisOptions;
}

export interface RedisConnection {
  client: Redis;
  config: RedisTestConfig;
}

// Qdrant Types
export interface QdrantTestConfig {
  url: string;
  apiKey?: string;
  collectionPrefix?: string;
  timeout?: number;
}

export interface QdrantConnection {
  client: QdrantClient;
  config: QdrantTestConfig;
}

// Factory Types
export interface TestDataFactoryConfig {
  locale?: string;
  seed?: number;
}

export interface UserTestData {
  id?: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ProjectTestData {
  id?: string;
  name: string;
  description: string;
  ownerId: string;
  status: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TaskTestData {
  id?: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  projectId: string;
  assigneeId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChatMessageTestData {
  id?: string;
  sessionId: string;
  userId: string;
  content: string;
  messageType: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface VectorTestData {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

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

export interface CleanupOptions {
  preserveSchema?: boolean;
  resetSequences?: boolean;
  truncateOnly?: boolean;
}

export interface SeedOptions {
  userCount?: number;
  projectCount?: number;
  taskCount?: number;
  messageCount?: number;
  createRelationships?: boolean;
}
