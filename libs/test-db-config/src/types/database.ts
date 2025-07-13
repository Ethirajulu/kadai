import { Pool } from 'pg';
import { MongoClient, Db } from 'mongodb';
import { Redis } from 'ioredis';
import { QdrantClient } from '@qdrant/js-client-rest';
import {
  PostgreSQLConfig,
  MongoDBConfig,
  RedisConfig,
  QdrantConfig,
  User,
  Task,
  Message,
  VectorPoint,
  TestDataFactoryConfig as SharedTestDataFactoryConfig
} from '@kadai/shared-types';

// Extend shared config types with test-specific properties
export interface PostgreSQLTestConfig extends PostgreSQLConfig {
  testDatabaseSuffix?: string;
}

export interface MongoDBTestConfig extends MongoDBConfig {
  testDatabaseSuffix?: string;
}

export interface RedisTestConfig extends RedisConfig {
  testKeyPrefix?: string;
}

export interface QdrantTestConfig extends QdrantConfig {
  testCollectionPrefix?: string;
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

// Test-specific data types
export interface TestDataFactoryConfig extends SharedTestDataFactoryConfig {
  locale?: string;
  seed?: number;
}

export interface UserTestData extends Omit<User, 'id' | 'createdAt' | 'updatedAt' | 'sellerProfile' | 'orders' | 'sessions' | 'tasks'> {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface TaskTestData extends Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'user'> {
  id?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface ChatMessageTestData extends Omit<Message, '_id' | 'createdAt' | 'updatedAt' | 'expiresAt'> {
  id?: string;
  timestamp?: Date;
  metadata?: Record<string, unknown>;
}

export interface VectorTestData extends VectorPoint {
  // Additional test-specific properties if needed
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
  taskCount?: number;
  messageCount?: number;
  vectorCount?: number;
  createRelationships?: boolean;
}
