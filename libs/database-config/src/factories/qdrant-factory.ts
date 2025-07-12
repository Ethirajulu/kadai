import { QdrantService } from '../qdrant/config/qdrant.service';
import { faker } from '@faker-js/faker';

export interface QdrantTestCollection {
  name: string;
  vectorSize: number;
  distance: 'Cosine' | 'Euclid' | 'Dot' | 'Manhattan';
  description?: string;
  payloadIndexes?: Record<string, string>;
}

export interface QdrantTestPoint {
  id: string;
  vector: number[];
  payload: Record<string, any>;
}

export interface QdrantTestProductEmbedding extends QdrantTestPoint {
  payload: {
    productId: string;
    sellerId: string;
    name: string;
    description: string;
    category: string;
    price: number;
    currency: string;
    tags: string[];
    createdAt: string;
    metadata?: Record<string, any>;
  };
}

export interface QdrantTestImageEmbedding extends QdrantTestPoint {
  payload: {
    imageId: string;
    productId?: string;
    imageUrl: string;
    description?: string;
    tags: string[];
    createdAt: string;
    metadata?: Record<string, any>;
  };
}

export class QdrantTestDataFactory {
  constructor(private qdrantService: QdrantService) {}

  /**
   * Generate test collection configuration
   */
  generateCollection(overrides: Partial<QdrantTestCollection> = {}): QdrantTestCollection {
    const collectionTypes = [
      { name: 'products', vectorSize: 1536, description: 'Product embeddings for semantic search' },
      { name: 'images', vectorSize: 512, description: 'Image embeddings for visual search' },
      { name: 'text', vectorSize: 768, description: 'Text embeddings for content search' },
      { name: 'user_preferences', vectorSize: 256, description: 'User preference vectors' },
    ];

    const template = faker.helpers.arrayElement(collectionTypes);
    
    return {
      name: `${template.name}_${faker.string.alphanumeric({ length: 6 })}`,
      vectorSize: template.vectorSize,
      distance: faker.helpers.arrayElement(['Cosine', 'Euclid', 'Dot', 'Manhattan']),
      description: template.description,
      payloadIndexes: this.generatePayloadIndexes(),
      ...overrides,
    };
  }

  /**
   * Generate product embedding
   */
  generateProductEmbedding(overrides: Partial<QdrantTestProductEmbedding> = {}): QdrantTestProductEmbedding {
    const productId = faker.string.uuid();
    const sellerId = faker.string.uuid();
    const category = faker.commerce.department();
    const tags = this.generateProductTags(category);

    return {
      id: productId,
      vector: this.generateVector(1536), // OpenAI embedding size
      payload: {
        productId,
        sellerId,
        name: faker.commerce.productName(),
        description: faker.commerce.productDescription(),
        category,
        price: parseFloat(faker.commerce.price({ min: 10, max: 10000 })),
        currency: 'INR',
        tags,
        createdAt: faker.date.recent({ days: 30 }).toISOString(),
        metadata: {
          brand: faker.company.name(),
          condition: faker.helpers.arrayElement(['new', 'used', 'refurbished']),
          weight: faker.number.float({ min: 0.1, max: 50, fractionDigits: 2 }),
          dimensions: {
            length: faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
            width: faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
            height: faker.number.float({ min: 1, max: 100, fractionDigits: 1 }),
          },
          inStock: faker.datatype.boolean(0.8),
          stockQuantity: faker.number.int({ min: 0, max: 1000 }),
        },
      },
      ...overrides,
    };
  }

  /**
   * Generate image embedding
   */
  generateImageEmbedding(overrides: Partial<QdrantTestImageEmbedding> = {}): QdrantTestImageEmbedding {
    const imageId = faker.string.uuid();
    const imageTypes = ['product', 'banner', 'profile', 'catalog'];
    const imageType = faker.helpers.arrayElement(imageTypes);

    return {
      id: imageId,
      vector: this.generateVector(512), // Common image embedding size
      payload: {
        imageId,
        productId: faker.datatype.boolean(0.7) ? faker.string.uuid() : undefined, // 70% chance of being associated with a product
        imageUrl: faker.image.url({ width: 800, height: 600 }),
        description: faker.lorem.sentence(),
        tags: this.generateImageTags(imageType),
        createdAt: faker.date.recent({ days: 7 }).toISOString(),
        metadata: {
          imageType,
          format: faker.helpers.arrayElement(['jpg', 'png', 'webp']),
          size: faker.number.int({ min: 10240, max: 5242880 }), // 10KB to 5MB
          dimensions: {
            width: faker.number.int({ min: 100, max: 2000 }),
            height: faker.number.int({ min: 100, max: 2000 }),
          },
          uploadedBy: faker.string.uuid(),
          processedAt: faker.date.recent().toISOString(),
        },
      },
      ...overrides,
    };
  }

  /**
   * Generate text embedding
   */
  generateTextEmbedding(text?: string): QdrantTestPoint {
    const id = faker.string.uuid();
    const textContent = text || faker.lorem.paragraphs({ min: 1, max: 3 });
    
    return {
      id,
      vector: this.generateVector(768), // Common text embedding size
      payload: {
        textId: id,
        content: textContent,
        language: faker.helpers.arrayElement(['en', 'hi', 'ta', 'te', 'bn']),
        source: faker.helpers.arrayElement(['product_description', 'user_review', 'support_ticket', 'chat_message']),
        sentiment: faker.helpers.arrayElement(['positive', 'negative', 'neutral']),
        keywords: this.extractKeywords(textContent),
        createdAt: faker.date.recent({ days: 14 }).toISOString(),
        metadata: {
          wordCount: textContent.split(' ').length,
          characterCount: textContent.length,
          processedAt: faker.date.recent().toISOString(),
        },
      },
    };
  }

  /**
   * Generate user preference embedding
   */
  generateUserPreferenceEmbedding(userId?: string): QdrantTestPoint {
    const id = userId || faker.string.uuid();
    
    return {
      id,
      vector: this.generateVector(256), // Smaller vector for preferences
      payload: {
        userId: id,
        preferences: {
          categories: faker.helpers.arrayElements([
            'Electronics', 'Clothing', 'Home', 'Sports', 'Books', 'Automotive'
          ], { min: 1, max: 4 }),
          priceRange: {
            min: faker.number.int({ min: 0, max: 1000 }),
            max: faker.number.int({ min: 1000, max: 50000 }),
          },
          brands: faker.helpers.arrayElements([
            'Samsung', 'Apple', 'Nike', 'Adidas', 'Sony', 'LG'
          ], { min: 0, max: 3 }),
          colors: faker.helpers.arrayElements([
            'red', 'blue', 'green', 'black', 'white', 'yellow'
          ], { min: 1, max: 3 }),
        },
        behavior: {
          avgSessionDuration: faker.number.int({ min: 300, max: 3600 }), // 5 minutes to 1 hour
          avgOrderValue: faker.number.float({ min: 500, max: 5000, fractionDigits: 2 }),
          purchaseFrequency: faker.helpers.arrayElement(['low', 'medium', 'high']),
          lastActivity: faker.date.recent({ days: 7 }).toISOString(),
        },
        demographics: {
          ageGroup: faker.helpers.arrayElement(['18-24', '25-34', '35-44', '45-54', '55+']),
          location: faker.location.city(),
          deviceType: faker.helpers.arrayElement(['mobile', 'desktop', 'tablet']),
        },
        createdAt: faker.date.recent({ days: 30 }).toISOString(),
        updatedAt: faker.date.recent({ days: 1 }).toISOString(),
      },
    };
  }

  /**
   * Generate normalized vector of specified size
   */
  private generateVector(size: number): number[] {
    // Generate random vector
    const vector = Array.from({ length: size }, () => faker.number.float({ min: -1, max: 1 }));
    
    // Normalize to unit vector for better similarity search
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude > 0) {
      return vector.map(val => val / magnitude);
    }
    
    return vector;
  }

  /**
   * Generate payload indexes for collections
   */
  private generatePayloadIndexes(): Record<string, string> {
    const possibleIndexes = {
      'category': 'keyword',
      'price': 'float',
      'currency': 'keyword',
      'sellerId': 'keyword',
      'productId': 'keyword',
      'createdAt': 'datetime',
      'inStock': 'bool',
      'brand': 'keyword',
      'condition': 'keyword',
      'language': 'keyword',
      'source': 'keyword',
      'sentiment': 'keyword',
    };

    const selectedFields = faker.helpers.arrayElements(
      Object.keys(possibleIndexes),
      { min: 2, max: 5 }
    );

    const indexes: Record<string, string> = {};
    selectedFields.forEach((field: string) => {
      indexes[field] = possibleIndexes[field as keyof typeof possibleIndexes];
    });

    return indexes;
  }

  /**
   * Generate product tags
   */
  private generateProductTags(category: string): string[] {
    const baseTags = [category.toLowerCase()];
    const additionalTags = [
      'featured', 'bestseller', 'new-arrival', 'on-sale', 'premium',
      'eco-friendly', 'handmade', 'limited-edition', 'trending', 'recommended'
    ];

    const selectedTags = faker.helpers.arrayElements(additionalTags, { min: 0, max: 3 });
    return [...baseTags, ...selectedTags];
  }

  /**
   * Generate image tags
   */
  private generateImageTags(imageType: string): string[] {
    const baseTags = [imageType];
    const additionalTags = [
      'high-resolution', 'professional', 'user-generated', 'edited',
      'thumbnail', 'gallery', 'hero', 'lifestyle', 'product-shot'
    ];

    const selectedTags = faker.helpers.arrayElements(additionalTags, { min: 0, max: 2 });
    return [...baseTags, ...selectedTags];
  }

  /**
   * Extract keywords from text (simplified)
   */
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    return [...new Set(words)].slice(0, 10); // Top 10 unique words
  }

  /**
   * Generate multiple embeddings
   */
  generateProductEmbeddings(count: number): QdrantTestProductEmbedding[] {
    return Array.from({ length: count }, () => this.generateProductEmbedding());
  }

  generateImageEmbeddings(count: number): QdrantTestImageEmbedding[] {
    return Array.from({ length: count }, () => this.generateImageEmbedding());
  }

  generateTextEmbeddings(count: number): QdrantTestPoint[] {
    return Array.from({ length: count }, () => this.generateTextEmbedding());
  }

  generateUserPreferenceEmbeddings(count: number): QdrantTestPoint[] {
    return Array.from({ length: count }, () => this.generateUserPreferenceEmbedding());
  }

  /**
   * Seed complete Qdrant test dataset
   */
  async seedCompleteDataset(): Promise<{
    collections: string[];
    productEmbeddings: number;
    imageEmbeddings: number;
    textEmbeddings: number;
    userPreferences: number;
  }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot seed test data in production environment');
    }

    const results = {
      collections: [] as string[],
      productEmbeddings: 0,
      imageEmbeddings: 0,
      textEmbeddings: 0,
      userPreferences: 0,
    };

    try {
      const client = this.qdrantService.getClient();

      // Create product collection
      const productCollection = this.generateCollection({
        name: 'test_products',
        vectorSize: 1536,
        distance: 'Cosine',
        payloadIndexes: {
          'category': 'keyword',
          'price': 'float',
          'sellerId': 'keyword',
          'inStock': 'bool',
        },
      });

      const productCreated = await this.qdrantService.createCollection(productCollection);
      if (productCreated) {
        results.collections.push(productCollection.name);
        
        // Add product embeddings
        const productEmbeddings = this.generateProductEmbeddings(100);
        await client.upsert(productCollection.name, {
          wait: true,
          points: productEmbeddings.map(embedding => ({
            id: embedding.id,
            vector: embedding.vector,
            payload: embedding.payload,
          })),
        });
        results.productEmbeddings = productEmbeddings.length;
      }

      // Create image collection
      const imageCollection = this.generateCollection({
        name: 'test_images',
        vectorSize: 512,
        distance: 'Cosine',
        payloadIndexes: {
          'imageType': 'keyword',
          'format': 'keyword',
          'productId': 'keyword',
        },
      });

      const imageCreated = await this.qdrantService.createCollection(imageCollection);
      if (imageCreated) {
        results.collections.push(imageCollection.name);
        
        // Add image embeddings
        const imageEmbeddings = this.generateImageEmbeddings(50);
        await client.upsert(imageCollection.name, {
          wait: true,
          points: imageEmbeddings.map(embedding => ({
            id: embedding.id,
            vector: embedding.vector,
            payload: embedding.payload,
          })),
        });
        results.imageEmbeddings = imageEmbeddings.length;
      }

      // Create text collection
      const textCollection = this.generateCollection({
        name: 'test_text',
        vectorSize: 768,
        distance: 'Cosine',
        payloadIndexes: {
          'language': 'keyword',
          'source': 'keyword',
          'sentiment': 'keyword',
        },
      });

      const textCreated = await this.qdrantService.createCollection(textCollection);
      if (textCreated) {
        results.collections.push(textCollection.name);
        
        // Add text embeddings
        const textEmbeddings = this.generateTextEmbeddings(75);
        await client.upsert(textCollection.name, {
          wait: true,
          points: textEmbeddings.map(embedding => ({
            id: embedding.id,
            vector: embedding.vector,
            payload: embedding.payload,
          })),
        });
        results.textEmbeddings = textEmbeddings.length;
      }

      console.log('Qdrant test data seeding completed:', results);
      return results;
    } catch (error) {
      console.error('Failed to seed Qdrant test data:', error);
      throw error;
    }
  }

  /**
   * Generate test data for specific scenarios
   */
  generateScenarioData(scenario: 'product-search' | 'image-similarity' | 'user-recommendations' | 'multilingual') {
    switch (scenario) {
      case 'product-search': {
        return {
          collection: this.generateCollection({
            name: 'product_search_test',
            vectorSize: 1536,
            distance: 'Cosine',
          }),
          embeddings: this.generateProductEmbeddings(200),
        };
      }
      
      case 'image-similarity': {
        return {
          collection: this.generateCollection({
            name: 'image_similarity_test',
            vectorSize: 512,
            distance: 'Cosine',
          }),
          embeddings: this.generateImageEmbeddings(100),
        };
      }
      
      case 'user-recommendations': {
        return {
          collection: this.generateCollection({
            name: 'user_preferences_test',
            vectorSize: 256,
            distance: 'Cosine',
          }),
          embeddings: this.generateUserPreferenceEmbeddings(50),
        };
      }
      
      case 'multilingual': {
        const languages = ['en', 'hi', 'ta', 'te', 'bn'];
        return {
          collection: this.generateCollection({
            name: 'multilingual_test',
            vectorSize: 768,
            distance: 'Cosine',
          }),
          embeddings: languages.flatMap(lang => 
            Array.from({ length: 20 }, () => {
              const embedding = this.generateTextEmbedding();
              embedding.payload.language = lang;
              return embedding;
            })
          ),
        };
      }
      
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * Clean all test data from Qdrant
   */
  async cleanAllTestData(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    await this.qdrantService.cleanDb();
  }

  /**
   * Clean specific test collections
   */
  async cleanTestCollections(collectionNames: string[]): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    for (const collectionName of collectionNames) {
      try {
        await this.qdrantService.deleteCollection(collectionName);
        console.log(`Cleaned collection: ${collectionName}`);
      } catch (error) {
        console.warn(`Failed to clean collection ${collectionName}:`, error);
      }
    }
  }
}