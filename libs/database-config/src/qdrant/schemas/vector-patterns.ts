/**
 * Vector storage patterns and utilities for Kadai
 * Defines consistent patterns for storing and retrieving vectors
 */

export interface VectorPoint {
  id: string | number;
  vector: number[];
  payload?: Record<string, any>;
}

export interface VectorSearchParams {
  collection: string;
  vector: number[];
  filter?: Record<string, any>;
  limit?: number;
  offset?: number;
  score_threshold?: number;
  with_payload?: boolean;
  with_vector?: boolean;
}

export interface VectorSearchResult {
  id: string | number;
  score: number;
  payload?: Record<string, any>;
  vector?: number[];
}

/**
 * Standard payload structure for different content types
 */
export interface ProductPayload {
  product_id: string;
  seller_id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  price_range: string; // 'budget', 'mid', 'premium'
  language: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ConversationPayload {
  session_id: string;
  user_id: string;
  seller_id: string;
  message_id: string;
  message_type: 'user' | 'assistant' | 'system';
  channel: 'whatsapp' | 'instagram' | 'telegram';
  language: string;
  intent?: string;
  confidence?: number;
  timestamp: string;
  original_text: string;
  processed_text: string;
}

export interface DocumentPayload {
  document_id: string;
  document_type: 'faq' | 'help' | 'policy' | 'guide';
  title: string;
  content: string;
  category: string;
  language: string;
  priority: number;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface ImagePayload {
  image_id: string;
  product_id: string;
  seller_id: string;
  image_type: 'product' | 'catalog' | 'user_query';
  image_url: string;
  tags: string[];
  colors: string[];
  alt_text?: string;
  created_at: string;
}

export interface UserBehaviorPayload {
  user_id: string;
  session_id: string;
  behavior_type: 'search' | 'purchase' | 'browse' | 'inquiry';
  channel: string;
  timestamp: string;
  interaction_count: number;
  context?: Record<string, any>;
}

export interface SellerCatalogPayload {
  seller_id: string;
  business_name: string;
  business_type: string;
  location: string;
  category_specialization: string[];
  rating: number;
  active_products: number;
  description: string;
  created_at: string;
}

/**
 * Vector ID generation patterns
 */
export class VectorIdGenerator {
  static product(productId: string): string {
    return `product_${productId}`;
  }

  static conversation(sessionId: string, messageId: string): string {
    return `conv_${sessionId}_${messageId}`;
  }

  static document(documentId: string): string {
    return `doc_${documentId}`;
  }

  static image(imageId: string): string {
    return `img_${imageId}`;
  }

  static userBehavior(userId: string, timestamp: string): string {
    return `behavior_${userId}_${timestamp}`;
  }

  static sellerCatalog(sellerId: string): string {
    return `seller_${sellerId}`;
  }

  static custom(type: string, identifier: string): string {
    return `${type}_${identifier}`;
  }
}

/**
 * Filter patterns for common search scenarios
 */
export class VectorFilterPatterns {
  static byCategory(category: string): Record<string, any> {
    return {
      must: [
        { key: 'category', match: { value: category } }
      ]
    };
  }

  static bySeller(sellerId: string): Record<string, any> {
    return {
      must: [
        { key: 'seller_id', match: { value: sellerId } }
      ]
    };
  }

  static byLanguage(language: string): Record<string, any> {
    return {
      must: [
        { key: 'language', match: { value: language } }
      ]
    };
  }

  static byPriceRange(minPrice: number, maxPrice: number): Record<string, any> {
    return {
      must: [
        { key: 'price', range: { gte: minPrice, lte: maxPrice } }
      ]
    };
  }

  static byDateRange(startDate: string, endDate: string): Record<string, any> {
    return {
      must: [
        { key: 'created_at', range: { gte: startDate, lte: endDate } }
      ]
    };
  }

  static byChannel(channel: string): Record<string, any> {
    return {
      must: [
        { key: 'channel', match: { value: channel } }
      ]
    };
  }

  static byMessageType(messageType: string): Record<string, any> {
    return {
      must: [
        { key: 'message_type', match: { value: messageType } }
      ]
    };
  }

  static multipleFilters(filters: Record<string, any>[]): Record<string, any> {
    return {
      must: filters
    };
  }

  static anyOf(filters: Record<string, any>[]): Record<string, any> {
    return {
      should: filters
    };
  }

  static exclude(filters: Record<string, any>[]): Record<string, any> {
    return {
      must_not: filters
    };
  }
}

/**
 * Vector batch operations utilities
 */
export class VectorBatchOperations {
  static createBatch(points: VectorPoint[], batchSize = 100): VectorPoint[][] {
    const batches: VectorPoint[][] = [];
    for (let i = 0; i < points.length; i += batchSize) {
      batches.push(points.slice(i, i + batchSize));
    }
    return batches;
  }

  static validateVector(vector: number[], expectedDimension: number): boolean {
    return vector.length === expectedDimension && vector.every(v => typeof v === 'number');
  }

  static normalizeVector(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? vector.map(val => val / magnitude) : vector;
  }

  static calculateSimilarity(vec1: number[], vec2: number[]): number {
    if (vec1.length !== vec2.length) {
      throw new Error('Vectors must have the same dimension');
    }
    
    const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);
    const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
    const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));
    
    return dotProduct / (magnitude1 * magnitude2);
  }
}

/**
 * Collection management utilities
 */
export class CollectionUtils {
  static generateBackupName(collectionName: string): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${collectionName}_backup_${timestamp}`;
  }

  static generateTempName(collectionName: string): string {
    const timestamp = Date.now();
    return `${collectionName}_temp_${timestamp}`;
  }

  static parseCollectionName(fullName: string): { environment: string; name: string } {
    const parts = fullName.split('_');
    if (parts.length >= 2) {
      return {
        environment: parts[0],
        name: parts.slice(1).join('_')
      };
    }
    return {
      environment: 'production',
      name: fullName
    };
  }
}