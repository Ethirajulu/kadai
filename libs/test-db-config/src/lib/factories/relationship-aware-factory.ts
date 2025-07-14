import { faker } from '@faker-js/faker';
import {
  UserTestData,
  SellerProfileTestData,
  ProductTestData,
  OrderTestData,
  TaskTestData,
  ChatMessageTestData,
  VectorTestData,
  TestDataFactoryConfig,
} from '../../types';
import { UserDataFactory } from './user-data-factory';
import { SellerProfileDataFactory } from './seller-profile-data-factory';
import { ProductDataFactory } from './product-data-factory';
import { OrderDataFactory } from './order-data-factory';
import { TaskDataFactory } from './task-data-factory';
import { MessageDataFactory } from './message-data-factory';
import { VectorDataFactory } from './vector-data-factory';
import { UserRole } from '@kadai/shared-types';

export interface RelatedDataSet {
  users: UserTestData[];
  sellerProfiles: SellerProfileTestData[];
  products: ProductTestData[];
  orders: OrderTestData[];
  tasks: TaskTestData[];
  messages: ChatMessageTestData[];
  vectors: VectorTestData[];
}

export interface RelationshipOptions {
  userCount: number;
  sellerRatio: number; // What percentage of users are sellers (0-1)
  productsPerSeller: number;
  ordersPerUser: number;
  tasksPerUser: number;
  messagesPerUser: number;
  vectorsPerProduct: number;
  vectorsPerMessage: number;
  ensureRelationships?: boolean;
}

export class RelationshipAwareFactory {
  private userFactory: UserDataFactory;
  private sellerFactory: SellerProfileDataFactory;
  private productFactory: ProductDataFactory;
  private orderFactory: OrderDataFactory;
  private taskFactory: TaskDataFactory;
  private messageFactory: MessageDataFactory;
  private vectorFactory: VectorDataFactory;

  constructor(private config?: TestDataFactoryConfig) {
    this.userFactory = new UserDataFactory(config);
    this.sellerFactory = new SellerProfileDataFactory(config);
    this.productFactory = new ProductDataFactory(config);
    this.orderFactory = new OrderDataFactory(config);
    this.taskFactory = new TaskDataFactory(config);
    this.messageFactory = new MessageDataFactory(config);
    this.vectorFactory = new VectorDataFactory(config);
  }

  generateRelatedDataSet(options: RelationshipOptions): RelatedDataSet {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    const {
      userCount,
      sellerRatio,
      productsPerSeller,
      ordersPerUser,
      tasksPerUser,
      messagesPerUser,
      vectorsPerProduct,
      vectorsPerMessage,
    } = options;

    // Generate users
    const users = this.generateUsers(userCount, sellerRatio);

    // Generate seller profiles for seller users
    const sellerProfiles = this.generateSellerProfiles(users);

    // Generate products for sellers
    const products = this.generateProducts(sellerProfiles, productsPerSeller);

    // Generate orders (customers buying from sellers)
    const orders = this.generateOrders(users, sellerProfiles, ordersPerUser);

    // Generate tasks for all users
    const tasks = this.generateTasks(users, tasksPerUser);

    // Generate messages for all users
    const messages = this.generateMessages(users, messagesPerUser);

    // Generate vectors for products and messages
    const vectors = this.generateVectors(
      products,
      messages,
      vectorsPerProduct,
      vectorsPerMessage
    );

    return {
      users,
      sellerProfiles,
      products,
      orders,
      tasks,
      messages,
      vectors,
    };
  }

  generateEcommerceScenario(
    customerCount = 50,
    sellerCount = 10,
    productsPerSeller = 20
  ): RelatedDataSet {
    const totalUsers = customerCount + sellerCount;
    const sellerRatio = sellerCount / totalUsers;

    return this.generateRelatedDataSet({
      userCount: totalUsers,
      sellerRatio,
      productsPerSeller,
      ordersPerUser: 3,
      tasksPerUser: 2,
      messagesPerUser: 5,
      vectorsPerProduct: 2,
      vectorsPerMessage: 1,
    });
  }

  generateMarketplaceScenario(
    buyerCount = 100,
    sellerCount = 25,
    productsPerSeller = 15
  ): RelatedDataSet {
    const totalUsers = buyerCount + sellerCount;
    const sellerRatio = sellerCount / totalUsers;

    return this.generateRelatedDataSet({
      userCount: totalUsers,
      sellerRatio,
      productsPerSeller,
      ordersPerUser: 5,
      tasksPerUser: 1,
      messagesPerUser: 10,
      vectorsPerProduct: 3,
      vectorsPerMessage: 1,
    });
  }

  generateConversationScenario(
    userCount = 20,
    messagesPerUser = 50
  ): RelatedDataSet {
    return this.generateRelatedDataSet({
      userCount,
      sellerRatio: 0.3, // 30% sellers
      productsPerSeller: 5,
      ordersPerUser: 1,
      tasksPerUser: 1,
      messagesPerUser,
      vectorsPerProduct: 1,
      vectorsPerMessage: 2,
    });
  }

  generateUserWithCompleteProfile(role: UserRole = UserRole.CUSTOMER): {
    user: UserTestData;
    sellerProfile?: SellerProfileTestData;
    products: ProductTestData[];
    orders: OrderTestData[];
    tasks: TaskTestData[];
    messages: ChatMessageTestData[];
  } {
    const user = this.userFactory.generateUser({ role });
    const userId = user.id || faker.string.uuid();
    user.id = userId;

    let sellerProfile: SellerProfileTestData | undefined;
    let products: ProductTestData[] = [];

    if (role === UserRole.SELLER) {
      sellerProfile = this.sellerFactory.generateSellersForUser(userId);
      const sellerId = sellerProfile.id || faker.string.uuid();
      sellerProfile.id = sellerId;

      products = this.productFactory.generateProductsBySeller(sellerId, 10);
    }

    const orders = this.orderFactory.generateOrdersForUser(userId, 5);
    const tasks = this.taskFactory.generateTasks(3, { userId });
    const messages = this.messageFactory.generateMessages(10, { userId });

    return {
      user,
      sellerProfile,
      products,
      orders,
      tasks,
      messages,
    };
  }

  generateSellerWithInventory(productCount = 50): {
    user: UserTestData;
    sellerProfile: SellerProfileTestData;
    products: ProductTestData[];
    orders: OrderTestData[];
    vectors: VectorTestData[];
  } {
    const user = this.userFactory.generateSeller();
    const userId = user.id || faker.string.uuid();
    user.id = userId;

    const sellerProfile = this.sellerFactory.generateVerifiedSeller({ userId });
    const sellerId = sellerProfile.id || faker.string.uuid();
    sellerProfile.id = sellerId;

    const products = this.productFactory.generateProductsBySeller(
      sellerId,
      productCount
    );
    const orders = this.orderFactory.generateOrdersForSeller(sellerId, 20);

    // Generate product vectors for search
    const vectors = products.map((product) =>
      this.vectorFactory.generateProductVector({
        payload: {
          text: product.description,
          category: 'product',
          productId: product.id || faker.string.uuid(),
          sellerId,
          name: product.name,
          price: product.price.toString(),
          currency: product.currency,
          tags: [product.category],
          timestamp: new Date().toISOString(),
        },
      })
    );

    return {
      user,
      sellerProfile,
      products,
      orders,
      vectors,
    };
  }

  private generateUsers(count: number, sellerRatio: number): UserTestData[] {
    const sellerCount = Math.floor(count * sellerRatio);
    const customerCount = count - sellerCount;

    const customers = Array.from({ length: customerCount }, () =>
      this.userFactory.generateCustomer({ id: faker.string.uuid() })
    );

    const sellers = Array.from({ length: sellerCount }, () =>
      this.userFactory.generateSeller({ id: faker.string.uuid() })
    );

    return [...customers, ...sellers];
  }

  private generateSellerProfiles(
    users: UserTestData[]
  ): SellerProfileTestData[] {
    const sellers = users.filter((user) => user.role === UserRole.SELLER);

    return sellers.map((seller) =>
      this.sellerFactory.generateSellersForUser(
        seller.id || faker.string.uuid(),
        {
          id: faker.string.uuid(),
        }
      )
    );
  }

  private generateProducts(
    sellerProfiles: SellerProfileTestData[],
    productsPerSeller: number
  ): ProductTestData[] {
    const products: ProductTestData[] = [];

    for (const seller of sellerProfiles) {
      const sellerProducts = this.productFactory.generateProductsBySeller(
        seller.id || faker.string.uuid(),
        productsPerSeller,
        { id: faker.string.uuid() }
      );
      products.push(...sellerProducts);
    }

    return products;
  }

  private generateOrders(
    users: UserTestData[],
    sellerProfiles: SellerProfileTestData[],
    ordersPerUser: number
  ): OrderTestData[] {
    const orders: OrderTestData[] = [];

    for (const user of users) {
      for (let i = 0; i < ordersPerUser; i++) {
        const randomSeller = faker.helpers.arrayElement(sellerProfiles);
        const order = this.orderFactory.generateOrder({
          id: faker.string.uuid(),
          userId: user.id || faker.string.uuid(),
          sellerId: randomSeller.id || faker.string.uuid(),
        });
        orders.push(order);
      }
    }

    return orders;
  }

  private generateTasks(
    users: UserTestData[],
    tasksPerUser: number
  ): TaskTestData[] {
    const tasks: TaskTestData[] = [];

    for (const user of users) {
      const userTasks = this.taskFactory.generateTasks(tasksPerUser, {
        id: faker.string.uuid(),
        userId: user.id || faker.string.uuid(),
      });
      tasks.push(...userTasks);
    }

    return tasks;
  }

  private generateMessages(
    users: UserTestData[],
    messagesPerUser: number
  ): ChatMessageTestData[] {
    const messages: ChatMessageTestData[] = [];

    for (const user of users) {
      const userMessages = this.messageFactory.generateMessages(
        messagesPerUser,
        {
          id: faker.string.uuid(),
          userId: user.id || faker.string.uuid(),
        }
      );
      messages.push(...userMessages);
    }

    return messages;
  }

  private generateVectors(
    products: ProductTestData[],
    messages: ChatMessageTestData[],
    vectorsPerProduct: number,
    vectorsPerMessage: number
  ): VectorTestData[] {
    const vectors: VectorTestData[] = [];

    // Generate product vectors
    for (const product of products) {
      for (let i = 0; i < vectorsPerProduct; i++) {
        const vector = this.vectorFactory.generateProductVector({
          payload: {
            text: product.description,
            category: 'product',
            productId: product.id || faker.string.uuid(),
            sellerId: product.sellerId,
            name: product.name,
            price: product.price.toString(),
            currency: product.currency,
            tags: [product.category],
            timestamp: new Date().toISOString(),
          },
        });
        vectors.push(vector);
      }
    }

    // Generate message vectors
    for (const message of messages) {
      for (let i = 0; i < vectorsPerMessage; i++) {
        const vector = this.vectorFactory.generateConversationVector({
          payload: {
            text: message.content,
            category: 'conversation',
            sessionId: message.sessionId,
            userId: message.userId,
            platform: message.platform.toLowerCase(),
            intent: faker.helpers.arrayElement([
              'inquiry',
              'purchase',
              'support',
            ]),
            entities: {
              products: [],
              locations: [],
            },
            timestamp: new Date().toISOString(),
          },
        });
        vectors.push(vector);
      }
    }

    return vectors;
  }
}
