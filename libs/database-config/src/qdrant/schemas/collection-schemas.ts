import { QdrantCollectionConfig } from '../config/qdrant.service';

/**
 * Collection schemas for different content types in Kadai
 * These schemas define the structure and configuration for vector collections
 */

export const COLLECTION_SCHEMAS: Record<string, QdrantCollectionConfig> = {
  // Product catalog embeddings for semantic search
  PRODUCT_EMBEDDINGS: {
    name: 'product_embeddings',
    vectorSize: 1536, // OpenAI text-embedding-ada-002 dimension
    distance: 'Cosine' as const,
    payloadIndexes: {
      'product_id': 'keyword',
      'seller_id': 'keyword',
      'category': 'keyword',
      'price_range': 'keyword',
      'language': 'keyword',
      'created_at': 'datetime',
      'updated_at': 'datetime',
    },
    description: 'Product descriptions and metadata for semantic search',
  },

  // Chat conversation embeddings for context understanding
  CONVERSATION_EMBEDDINGS: {
    name: 'conversation_embeddings',
    vectorSize: 1536,
    distance: 'Cosine' as const,
    payloadIndexes: {
      'session_id': 'keyword',
      'user_id': 'keyword',
      'seller_id': 'keyword',
      'message_type': 'keyword', // 'user', 'assistant', 'system'
      'channel': 'keyword', // 'whatsapp', 'instagram', 'telegram'
      'language': 'keyword',
      'intent': 'keyword',
      'timestamp': 'datetime',
    },
    description: 'Chat messages and conversation context for AI understanding',
  },

  // Document embeddings for knowledge base and FAQ
  DOCUMENT_EMBEDDINGS: {
    name: 'document_embeddings',
    vectorSize: 1536,
    distance: 'Cosine' as const,
    payloadIndexes: {
      'document_id': 'keyword',
      'document_type': 'keyword', // 'faq', 'help', 'policy', 'guide'
      'category': 'keyword',
      'language': 'keyword',
      'priority': 'integer',
      'created_at': 'datetime',
      'updated_at': 'datetime',
    },
    description: 'Knowledge base documents and FAQ for intelligent responses',
  },

  // Image embeddings for visual product search
  IMAGE_EMBEDDINGS: {
    name: 'image_embeddings',
    vectorSize: 512, // Common dimension for image embeddings (e.g., CLIP)
    distance: 'Cosine' as const,
    payloadIndexes: {
      'image_id': 'keyword',
      'product_id': 'keyword',
      'seller_id': 'keyword',
      'image_type': 'keyword', // 'product', 'catalog', 'user_query'
      'tags': 'keyword',
      'colors': 'keyword',
      'created_at': 'datetime',
    },
    description: 'Product images and visual content for image-based search',
  },

  // User behavior embeddings for personalization
  USER_BEHAVIOR_EMBEDDINGS: {
    name: 'user_behavior_embeddings',
    vectorSize: 768, // Smaller dimension for behavioral patterns
    distance: 'Cosine' as const,
    payloadIndexes: {
      'user_id': 'keyword',
      'session_id': 'keyword',
      'behavior_type': 'keyword', // 'search', 'purchase', 'browse', 'inquiry'
      'channel': 'keyword',
      'timestamp': 'datetime',
      'interaction_count': 'integer',
    },
    description: 'User behavior patterns for personalized recommendations',
  },

  // Seller catalog embeddings for cross-seller recommendations
  SELLER_CATALOG_EMBEDDINGS: {
    name: 'seller_catalog_embeddings',
    vectorSize: 1536,
    distance: 'Cosine' as const,
    payloadIndexes: {
      'seller_id': 'keyword',
      'business_type': 'keyword',
      'location': 'keyword',
      'category_specialization': 'keyword',
      'rating': 'float',
      'active_products': 'integer',
      'created_at': 'datetime',
    },
    description: 'Seller profiles and catalog information for marketplace insights',
  },
};

/**
 * Collection initialization order - some collections may depend on others
 */
export const COLLECTION_INITIALIZATION_ORDER = [
  'PRODUCT_EMBEDDINGS',
  'DOCUMENT_EMBEDDINGS',
  'IMAGE_EMBEDDINGS',
  'CONVERSATION_EMBEDDINGS',
  'USER_BEHAVIOR_EMBEDDINGS',
  'SELLER_CATALOG_EMBEDDINGS',
];

/**
 * Default embedding dimensions for different types of content
 */
export const EMBEDDING_DIMENSIONS = {
  TEXT_LARGE: 1536,    // OpenAI text-embedding-ada-002
  TEXT_SMALL: 768,     // Sentence transformers
  IMAGE: 512,          // CLIP or similar
  MULTIMODAL: 1024,    // Combined text-image embeddings
} as const;

/**
 * Collection naming conventions
 */
export const COLLECTION_NAMING = {
  PREFIX: 'kadai_',
  SEPARATOR: '_',
  SUFFIXES: {
    EMBEDDINGS: 'embeddings',
    TEMP: 'temp',
    BACKUP: 'backup',
    TEST: 'test',
  },
} as const;

/**
 * Get collection name with environment prefix
 */
export function getCollectionName(schemaKey: string, environment = 'production'): string {
  const schema = COLLECTION_SCHEMAS[schemaKey];
  if (!schema) {
    throw new Error(`Unknown collection schema: ${schemaKey}`);
  }
  
  if (environment === 'production') {
    return schema.name;
  }
  
  return `${environment}_${schema.name}`;
}

/**
 * Get all collection names for a specific environment
 */
export function getAllCollectionNames(environment = 'production'): string[] {
  return Object.keys(COLLECTION_SCHEMAS).map(key => getCollectionName(key, environment));
}