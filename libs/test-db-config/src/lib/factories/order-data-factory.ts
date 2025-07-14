import { faker } from '@faker-js/faker';
import { OrderTestData, TestDataFactoryConfig } from '../../types';
import { OrderStatus } from '@kadai/shared-types';

export class OrderDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    const orderNumber = this.generateOrderNumber();
    const totalAmount = faker.number.float({ min: 100, max: 50000, fractionDigits: 2 });
    const status = faker.helpers.arrayElement(Object.values(OrderStatus));

    return {
      userId: faker.string.uuid(),
      sellerId: faker.string.uuid(),
      orderNumber,
      status,
      totalAmount,
      currency: 'INR',
      shippingAddress: this.generateIndianAddress(),
      billingAddress: faker.datatype.boolean({ probability: 0.7 }) 
        ? this.generateIndianAddress() 
        : undefined,
      notes: faker.datatype.boolean({ probability: 0.3 }) 
        ? faker.lorem.sentence() 
        : undefined,
      ...overrides,
    };
  }

  generateOrders(count: number, overrides?: Partial<OrderTestData>): OrderTestData[] {
    return Array.from({ length: count }, () => this.generateOrder(overrides));
  }

  generatePendingOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      status: OrderStatus.PENDING,
      ...overrides,
    });
  }

  generateConfirmedOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      status: OrderStatus.CONFIRMED,
      ...overrides,
    });
  }

  generateShippedOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      status: OrderStatus.SHIPPED,
      ...overrides,
    });
  }

  generateDeliveredOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      status: OrderStatus.DELIVERED,
      ...overrides,
    });
  }

  generateCancelledOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      status: OrderStatus.CANCELLED,
      notes: faker.helpers.arrayElement([
        'Customer requested cancellation',
        'Product out of stock',
        'Payment failed',
        'Seller cancelled',
      ]),
      ...overrides,
    });
  }

  generateHighValueOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      totalAmount: faker.number.float({ min: 10000, max: 100000, fractionDigits: 2 }),
      ...overrides,
    });
  }

  generateLowValueOrder(overrides?: Partial<OrderTestData>): OrderTestData {
    return this.generateOrder({
      totalAmount: faker.number.float({ min: 50, max: 1000, fractionDigits: 2 }),
      ...overrides,
    });
  }

  generateOrdersForUser(
    userId: string,
    count: number,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    return Array.from({ length: count }, () =>
      this.generateOrder({
        userId,
        ...overrides,
      })
    );
  }

  generateOrdersForSeller(
    sellerId: string,
    count: number,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    return Array.from({ length: count }, () =>
      this.generateOrder({
        sellerId,
        ...overrides,
      })
    );
  }

  generateOrdersByStatus(
    status: OrderStatus,
    count: number,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    return Array.from({ length: count }, () =>
      this.generateOrder({
        status,
        ...overrides,
      })
    );
  }

  generateOrdersWithinDateRange(
    count: number,
    startDate: Date,
    endDate: Date,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    return Array.from({ length: count }, () =>
      this.generateOrder({
        createdAt: faker.date.between({ from: startDate, to: endDate }),
        ...overrides,
      })
    );
  }

  generateOrdersWithPriceRange(
    count: number,
    minAmount: number,
    maxAmount: number,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    return Array.from({ length: count }, () =>
      this.generateOrder({
        totalAmount: faker.number.float({ min: minAmount, max: maxAmount, fractionDigits: 2 }),
        ...overrides,
      })
    );
  }

  generateBulkOrders(
    options: {
      count: number;
      userId?: string;
      sellerId?: string;
      status?: OrderStatus;
      minAmount?: number;
      maxAmount?: number;
      dateRange?: { start: Date; end: Date };
    },
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    const { count, userId, sellerId, status, minAmount, maxAmount, dateRange } = options;

    return Array.from({ length: count }, () => {
      const baseOrder = this.generateOrder({
        userId,
        sellerId,
        status,
        ...overrides,
      });

      if (minAmount !== undefined || maxAmount !== undefined) {
        baseOrder.totalAmount = faker.number.float({
          min: minAmount || 50,
          max: maxAmount || 50000,
          fractionDigits: 2,
        });
      }

      if (dateRange) {
        baseOrder.createdAt = faker.date.between({
          from: dateRange.start,
          to: dateRange.end,
        });
      }

      return baseOrder;
    });
  }

  generateOrderFlow(
    userId: string,
    sellerId: string,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    const baseOrder = this.generateOrder({
      userId,
      sellerId,
      ...overrides,
    });

    // Generate order progression through different statuses
    const statuses = [
      OrderStatus.PENDING,
      OrderStatus.CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
    ];

    return statuses.map((status, index) => ({
      ...baseOrder,
      status,
      orderNumber: `${baseOrder.orderNumber}-${index + 1}`,
      createdAt: new Date(Date.now() + index * 24 * 60 * 60 * 1000), // 1 day apart
    }));
  }

  generateRelatedOrders(
    baseOrder: OrderTestData,
    count: number,
    overrides?: Partial<OrderTestData>
  ): OrderTestData[] {
    return Array.from({ length: count }, () =>
      this.generateOrder({
        userId: baseOrder.userId,
        sellerId: baseOrder.sellerId,
        totalAmount: baseOrder.totalAmount! * faker.number.float({ min: 0.5, max: 2.0, fractionDigits: 2 }),
        ...overrides,
      })
    );
  }

  private generateOrderNumber(): string {
    const timestamp = Date.now().toString();
    const random = faker.string.alphanumeric(4).toUpperCase();
    return `ORD-${timestamp.slice(-8)}-${random}`;
  }

  private generateIndianAddress(): string {
    const cities = [
      'Mumbai', 'Delhi', 'Bangalore', 'Chennai', 'Kolkata', 'Hyderabad',
      'Pune', 'Ahmedabad', 'Surat', 'Lucknow', 'Kanpur', 'Nagpur',
      'Patna', 'Indore', 'Bhopal', 'Ludhiana', 'Agra', 'Nashik',
    ];

    const states = [
      'Maharashtra', 'Delhi', 'Karnataka', 'Tamil Nadu', 'West Bengal',
      'Telangana', 'Gujarat', 'Uttar Pradesh', 'Madhya Pradesh', 'Punjab',
      'Rajasthan', 'Haryana', 'Kerala', 'Andhra Pradesh', 'Odisha',
    ];

    const city = faker.helpers.arrayElement(cities);
    const state = faker.helpers.arrayElement(states);
    const pincode = faker.string.numeric(6);

    return `${faker.location.streetAddress()}, ${city}, ${state} - ${pincode}`;
  }
}