import { faker } from '@faker-js/faker';
import { VectorTestData, TestDataFactoryConfig } from '../../types';

export class VectorDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateVector(
    dimensions = 1536,
    overrides?: Partial<VectorTestData>
  ): VectorTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    return {
      id: faker.string.uuid(),
      vector: this.generateRandomVector(dimensions),
      payload: {
        text: faker.lorem.sentence(),
        category: faker.helpers.arrayElement([
          'product',
          'conversation',
          'document',
          'user_behavior',
        ]),
        timestamp: faker.date.recent().toISOString(),
        metadata: {
          source: faker.helpers.arrayElement([
            'whatsapp',
            'telegram',
            'web',
            'api',
          ]),
          language: faker.helpers.arrayElement(['en', 'hi', 'ta', 'te', 'bn']),
        },
      },
      ...overrides,
    };
  }

  generateVectors(
    count: number,
    dimensions = 1536,
    overrides?: Partial<VectorTestData>
  ): VectorTestData[] {
    return Array.from({ length: count }, () =>
      this.generateVector(dimensions, overrides)
    );
  }

  generateProductVector(overrides?: Partial<VectorTestData>): VectorTestData {
    return this.generateVector(1536, {
      payload: {
        text: faker.commerce.productDescription(),
        category: 'product',
        productId: faker.string.uuid(),
        sellerId: faker.string.uuid(),
        name: faker.commerce.productName(),
        price: faker.commerce.price(),
        currency: 'INR',
        tags: faker.helpers.arrayElements(
          ['electronics', 'clothing', 'home', 'books', 'sports'],
          2
        ),
        timestamp: faker.date.recent().toISOString(),
      },
      ...overrides,
    });
  }

  generateConversationVector(
    overrides?: Partial<VectorTestData>
  ): VectorTestData {
    return this.generateVector(1536, {
      payload: {
        text: faker.lorem.paragraph(),
        category: 'conversation',
        sessionId: faker.string.uuid(),
        userId: faker.string.uuid(),
        platform: faker.helpers.arrayElement(['whatsapp', 'telegram', 'web']),
        intent: faker.helpers.arrayElement([
          'inquiry',
          'purchase',
          'support',
          'complaint',
        ]),
        entities: {
          products: faker.helpers.arrayElements(
            ['laptop', 'phone', 'book'],
            faker.number.int({ min: 0, max: 3 })
          ),
          locations: faker.helpers.arrayElements(
            ['Mumbai', 'Delhi', 'Bangalore'],
            faker.number.int({ min: 0, max: 2 })
          ),
        },
        timestamp: faker.date.recent().toISOString(),
      },
      ...overrides,
    });
  }

  generateDocumentVector(overrides?: Partial<VectorTestData>): VectorTestData {
    return this.generateVector(1536, {
      payload: {
        text: faker.lorem.paragraphs(3),
        category: 'document',
        documentId: faker.string.uuid(),
        title: faker.lorem.sentence(),
        documentType: faker.helpers.arrayElement([
          'faq',
          'manual',
          'policy',
          'guide',
        ]),
        tags: faker.helpers.arrayElements(
          ['customer-service', 'product-info', 'shipping', 'returns'],
          2
        ),
        timestamp: faker.date.recent().toISOString(),
      },
      ...overrides,
    });
  }

  generateUserBehaviorVector(
    overrides?: Partial<VectorTestData>
  ): VectorTestData {
    return this.generateVector(512, {
      payload: {
        text: JSON.stringify({
          actions: faker.helpers.arrayElements(
            ['view', 'click', 'purchase', 'search'],
            3
          ),
          duration: faker.number.int({ min: 30, max: 3600 }),
          pages: faker.number.int({ min: 1, max: 10 }),
        }),
        category: 'user_behavior',
        userId: faker.string.uuid(),
        behaviorType: faker.helpers.arrayElement([
          'session',
          'purchase_pattern',
          'search_behavior',
          'engagement',
        ]),
        timestamp: faker.date.recent().toISOString(),
      },
      ...overrides,
    });
  }

  private generateRandomVector(dimensions: number): number[] {
    return Array.from({ length: dimensions }, () =>
      faker.number.float({ min: -1, max: 1, fractionDigits: 4 })
    );
  }

  // Generate normalized vector (for cosine similarity)
  generateNormalizedVector(
    dimensions = 1536,
    overrides?: Partial<VectorTestData>
  ): VectorTestData {
    const vector = this.generateRandomVector(dimensions);
    const magnitude = Math.sqrt(
      vector.reduce((sum, val) => sum + val * val, 0)
    );
    const normalizedVector = vector.map((val) => val / magnitude);

    return this.generateVector(dimensions, {
      vector: normalizedVector,
      ...overrides,
    });
  }
}
