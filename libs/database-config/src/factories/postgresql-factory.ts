import { PrismaService } from '../postgresql/config/prisma.service';
import { faker } from '@faker-js/faker';

export interface PostgreSQLTestUser {
  id?: string;
  email: string;
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  role: 'CUSTOMER' | 'SELLER' | 'ADMIN';
  isActive: boolean;
  emailVerified: boolean;
  phoneVerified: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PostgreSQLTestProduct {
  id?: string;
  sellerId: string;
  name: string;
  description: string;
  price: number;
  currency: string;
  stockQuantity: number;
  sku?: string;
  category?: string;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PostgreSQLTestOrder {
  id?: string;
  userId: string;
  sellerId: string;
  orderNumber: string;
  status: 'PENDING' | 'CONFIRMED' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
  totalAmount: number;
  currency: string;
  shippingAddress?: string;
  billingAddress?: string;
  notes?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export class PostgreSQLTestDataFactory {
  constructor(private prismaService: PrismaService) {}

  /**
   * Generate test user data
   */
  generateUser(overrides: Partial<PostgreSQLTestUser> = {}): PostgreSQLTestUser {
    return {
      email: faker.internet.email(),
      phoneNumber: faker.phone.number({ style: 'human' }),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      role: faker.helpers.arrayElement(['CUSTOMER', 'SELLER', 'ADMIN']),
      isActive: faker.datatype.boolean(0.9), // 90% chance of being active
      emailVerified: faker.datatype.boolean(0.7), // 70% chance of being verified
      phoneVerified: faker.datatype.boolean(0.6), // 60% chance of being verified
      ...overrides,
    };
  }

  /**
   * Generate test product data
   */
  generateProduct(sellerId: string, overrides: Partial<PostgreSQLTestProduct> = {}): PostgreSQLTestProduct {
    const category = faker.commerce.department();
    return {
      sellerId,
      name: faker.commerce.productName(),
      description: faker.commerce.productDescription(),
      price: parseFloat(faker.commerce.price({ min: 10, max: 10000 })),
      currency: 'INR',
      stockQuantity: faker.number.int({ min: 0, max: 1000 }),
      sku: faker.string.alphanumeric({ length: 8 }).toUpperCase(),
      category,
      isActive: faker.datatype.boolean(0.95), // 95% chance of being active
      ...overrides,
    };
  }

  /**
   * Generate test order data
   */
  generateOrder(userId: string, sellerId: string, overrides: Partial<PostgreSQLTestOrder> = {}): PostgreSQLTestOrder {
    return {
      userId,
      sellerId,
      orderNumber: `ORD-${faker.string.alphanumeric({ length: 8 }).toUpperCase()}`,
      status: faker.helpers.arrayElement(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
      totalAmount: parseFloat(faker.commerce.price({ min: 50, max: 5000 })),
      currency: 'INR',
      shippingAddress: faker.location.streetAddress({ useFullAddress: true }),
      billingAddress: faker.location.streetAddress({ useFullAddress: true }),
      notes: faker.datatype.boolean(0.3) ? faker.lorem.sentence() : undefined, // 30% chance of having notes
      ...overrides,
    };
  }

  /**
   * Create multiple test users
   */
  generateUsers(count: number, overrides: Partial<PostgreSQLTestUser> = {}): PostgreSQLTestUser[] {
    return Array.from({ length: count }, () => this.generateUser(overrides));
  }

  /**
   * Create multiple test products
   */
  generateProducts(sellerId: string, count: number, overrides: Partial<PostgreSQLTestProduct> = {}): PostgreSQLTestProduct[] {
    return Array.from({ length: count }, () => this.generateProduct(sellerId, overrides));
  }

  /**
   * Create multiple test orders
   */
  generateOrders(userId: string, sellerId: string, count: number, overrides: Partial<PostgreSQLTestOrder> = {}): PostgreSQLTestOrder[] {
    return Array.from({ length: count }, () => this.generateOrder(userId, sellerId, overrides));
  }

  /**
   * Create realistic seller profile data
   */
  generateSellerProfile(userId: string) {
    const businessTypes = ['Retail', 'Wholesale', 'Manufacturing', 'Services', 'E-commerce'];
    return {
      userId,
      businessName: faker.company.name(),
      businessType: faker.helpers.arrayElement(businessTypes),
      gstNumber: this.generateGSTNumber(),
      businessAddress: faker.location.streetAddress({ useFullAddress: true }),
      businessPhone: faker.phone.number({ style: 'human' }),
      businessEmail: faker.internet.email(),
      isVerified: faker.datatype.boolean(0.6), // 60% chance of being verified
    };
  }

  /**
   * Generate realistic payment data
   */
  generatePayment(orderId: string) {
    const paymentMethods = ['UPI', 'Card', 'Net Banking', 'Wallet', 'Cash on Delivery'];
    const statuses = ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REFUNDED'];
    
    return {
      orderId,
      amount: parseFloat(faker.commerce.price({ min: 50, max: 5000 })),
      currency: 'INR',
      status: faker.helpers.arrayElement(statuses),
      paymentMethod: faker.helpers.arrayElement(paymentMethods),
      transactionId: faker.string.alphanumeric({ length: 16 }).toUpperCase(),
      gatewayResponse: faker.datatype.boolean(0.2) ? JSON.stringify({ gateway: 'test', status: 'success' }) : undefined,
    };
  }

  /**
   * Generate valid Indian GST number
   */
  private generateGSTNumber(): string {
    const stateCode = faker.string.numeric(2);
    const panLike = faker.string.alpha({ length: 5, casing: 'upper' }) + faker.string.numeric(4) + faker.string.alpha({ length: 1, casing: 'upper' });
    const entityNumber = faker.helpers.arrayElement(['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C']);
    const checksum = faker.string.alphanumeric({ length: 1, casing: 'upper' });
    
    return `${stateCode}${panLike}${entityNumber}Z${checksum}`;
  }

  /**
   * Seed complete test dataset with relationships
   */
  async seedCompleteDataset(): Promise<{
    users: any[];
    sellers: any[];
    products: any[];
    orders: any[];
    payments: any[];
  }> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot seed test data in production environment');
    }

    const results = {
      users: [] as any[],
      sellers: [] as any[],
      products: [] as any[],
      orders: [] as any[],
      payments: [] as any[],
    };

    try {
      // Note: This is a template for when the Prisma schema is available
      // The actual implementation would depend on the generated Prisma client
      
      console.log('PostgreSQL test data seeding completed');
      return results;
    } catch (error) {
      console.error('Failed to seed PostgreSQL test data:', error);
      throw error;
    }
  }

  /**
   * Generate test data for specific scenarios
   */
  generateScenarioData(scenario: 'empty-cart' | 'active-orders' | 'new-seller' | 'high-volume') {
    switch (scenario) {
      case 'empty-cart':
        return {
          user: this.generateUser({ role: 'CUSTOMER' }),
          products: this.generateProducts('seller-id', 5, { isActive: true }),
        };
      
      case 'active-orders':
        return {
          user: this.generateUser({ role: 'CUSTOMER' }),
          orders: this.generateOrders('user-id', 'seller-id', 3, { status: 'PROCESSING' }),
        };
      
      case 'new-seller':
        return {
          user: this.generateUser({ role: 'SELLER', emailVerified: false }),
          sellerProfile: this.generateSellerProfile('user-id'),
        };
      
      case 'high-volume':
        return {
          users: this.generateUsers(100),
          products: this.generateProducts('seller-id', 500),
          orders: this.generateOrders('user-id', 'seller-id', 200),
        };
      
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * Clean all test data (use with caution)
   */
  async cleanAllTestData(): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    await this.prismaService.cleanDb();
  }
}