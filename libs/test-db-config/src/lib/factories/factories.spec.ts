import { faker } from '@faker-js/faker';
import {
  UserDataFactory,
  ProductDataFactory,
  OrderDataFactory,
  SellerProfileDataFactory,
  TaskDataFactory,
  MessageDataFactory,
  VectorDataFactory,
  RelationshipAwareFactory,
} from './index';
import { UserRole, OrderStatus, TaskStatus } from '@kadai/shared-types';

describe('Data Factories', () => {
  beforeEach(() => {
    faker.seed(123); // Consistent seed for predictable tests
  });

  describe('UserDataFactory', () => {
    let factory: UserDataFactory;

    beforeEach(() => {
      factory = new UserDataFactory();
    });

    it('should generate a valid user', () => {
      const user = factory.generateUser();
      
      expect(user).toBeDefined();
      expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(user.firstName).toBeDefined();
      expect(user.lastName).toBeDefined();
      expect(Object.values(UserRole)).toContain(user.role);
      expect(typeof user.isActive).toBe('boolean');
      expect(typeof user.emailVerified).toBe('boolean');
      expect(typeof user.phoneVerified).toBe('boolean');
    });

    it('should generate users with overrides', () => {
      const override = { role: UserRole.SELLER, isActive: false };
      const user = factory.generateUser(override);
      
      expect(user.role).toBe(UserRole.SELLER);
      expect(user.isActive).toBe(false);
    });

    it('should generate multiple users', () => {
      const users = factory.generateUsers(5);
      
      expect(users).toHaveLength(5);
      users.forEach(user => {
        expect(user.email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      });
    });

    it('should generate role-specific users', () => {
      const customer = factory.generateCustomer();
      const seller = factory.generateSeller();
      const admin = factory.generateAdmin();
      
      expect(customer.role).toBe(UserRole.CUSTOMER);
      expect(seller.role).toBe(UserRole.SELLER);
      expect(admin.role).toBe(UserRole.ADMIN);
    });
  });

  describe('ProductDataFactory', () => {
    let factory: ProductDataFactory;

    beforeEach(() => {
      factory = new ProductDataFactory();
    });

    it('should generate a valid product', () => {
      const product = factory.generateProduct();
      
      expect(product).toBeDefined();
      expect(product.sellerId).toBeDefined();
      expect(product.name).toBeDefined();
      expect(product.description).toBeDefined();
      expect(typeof product.price).toBe('number');
      expect(product.price).toBeGreaterThan(0);
      expect(product.currency).toBe('INR');
      expect(typeof product.stockQuantity).toBe('number');
      expect(product.stockQuantity).toBeGreaterThanOrEqual(0);
      expect(product.sku).toBeDefined();
      expect(product.category).toBeDefined();
      expect(Array.isArray(product.images)).toBe(true);
      expect(typeof product.isActive).toBe('boolean');
    });

    it('should generate category-specific products', () => {
      const electronics = factory.generateElectronicsProduct();
      const clothing = factory.generateClothingProduct();
      const book = factory.generateBookProduct();
      
      expect(electronics.category).toBe('Electronics');
      expect(clothing.category).toBe('Clothing');
      expect(book.category).toBe('Books');
    });

    it('should generate products for specific seller', () => {
      const sellerId = faker.string.uuid();
      const products = factory.generateProductsBySeller(sellerId, 3);
      
      expect(products).toHaveLength(3);
      products.forEach(product => {
        expect(product.sellerId).toBe(sellerId);
      });
    });

    it('should generate bulk products with options', () => {
      const options = {
        count: 10,
        minPrice: 100,
        maxPrice: 1000,
        ensureStock: true,
      };
      const products = factory.generateBulkProducts(options);
      
      expect(products).toHaveLength(10);
      products.forEach(product => {
        expect(product.price).toBeGreaterThanOrEqual(100);
        expect(product.price).toBeLessThanOrEqual(1000);
        expect(product.stockQuantity).toBeGreaterThan(0);
        expect(product.isActive).toBe(true);
      });
    });
  });

  describe('OrderDataFactory', () => {
    let factory: OrderDataFactory;

    beforeEach(() => {
      factory = new OrderDataFactory();
    });

    it('should generate a valid order', () => {
      const order = factory.generateOrder();
      
      expect(order).toBeDefined();
      expect(order.userId).toBeDefined();
      expect(order.sellerId).toBeDefined();
      expect(order.orderNumber).toBeDefined();
      expect(Object.values(OrderStatus)).toContain(order.status);
      expect(typeof order.totalAmount).toBe('number');
      expect(order.totalAmount).toBeGreaterThan(0);
      expect(order.currency).toBe('INR');
      expect(order.shippingAddress).toBeDefined();
    });

    it('should generate status-specific orders', () => {
      const pending = factory.generatePendingOrder();
      const confirmed = factory.generateConfirmedOrder();
      const shipped = factory.generateShippedOrder();
      const delivered = factory.generateDeliveredOrder();
      const cancelled = factory.generateCancelledOrder();
      
      expect(pending.status).toBe(OrderStatus.PENDING);
      expect(confirmed.status).toBe(OrderStatus.CONFIRMED);
      expect(shipped.status).toBe(OrderStatus.SHIPPED);
      expect(delivered.status).toBe(OrderStatus.DELIVERED);
      expect(cancelled.status).toBe(OrderStatus.CANCELLED);
      expect(cancelled.notes).toBeDefined();
    });

    it('should generate orders for specific user', () => {
      const userId = faker.string.uuid();
      const orders = factory.generateOrdersForUser(userId, 5);
      
      expect(orders).toHaveLength(5);
      orders.forEach(order => {
        expect(order.userId).toBe(userId);
      });
    });

    it('should generate bulk orders with options', () => {
      const options = {
        count: 15,
        status: OrderStatus.DELIVERED,
        minAmount: 500,
        maxAmount: 2000,
      };
      const orders = factory.generateBulkOrders(options);
      
      expect(orders).toHaveLength(15);
      orders.forEach(order => {
        expect(order.status).toBe(OrderStatus.DELIVERED);
        expect(order.totalAmount).toBeGreaterThanOrEqual(500);
        expect(order.totalAmount).toBeLessThanOrEqual(2000);
      });
    });

    it('should generate order flow', () => {
      const userId = faker.string.uuid();
      const sellerId = faker.string.uuid();
      const orderFlow = factory.generateOrderFlow(userId, sellerId);
      
      expect(orderFlow).toHaveLength(5);
      expect(orderFlow[0].status).toBe(OrderStatus.PENDING);
      expect(orderFlow[1].status).toBe(OrderStatus.CONFIRMED);
      expect(orderFlow[2].status).toBe(OrderStatus.PROCESSING);
      expect(orderFlow[3].status).toBe(OrderStatus.SHIPPED);
      expect(orderFlow[4].status).toBe(OrderStatus.DELIVERED);
    });
  });

  describe('SellerProfileDataFactory', () => {
    let factory: SellerProfileDataFactory;

    beforeEach(() => {
      factory = new SellerProfileDataFactory();
    });

    it('should generate a valid seller profile', () => {
      const profile = factory.generateSellerProfile();
      
      expect(profile).toBeDefined();
      expect(profile.userId).toBeDefined();
      expect(profile.businessName).toBeDefined();
      expect(profile.businessType).toBeDefined();
      expect(profile.businessAddress).toBeDefined();
      expect(profile.businessPhone).toBeDefined();
      expect(profile.businessEmail).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
      expect(typeof profile.isVerified).toBe('boolean');
    });

    it('should generate verified and unverified sellers', () => {
      const verified = factory.generateVerifiedSeller();
      const unverified = factory.generateUnverifiedSeller();
      
      expect(verified.isVerified).toBe(true);
      expect(verified.gstNumber).toBeDefined();
      expect(unverified.isVerified).toBe(false);
      expect(unverified.gstNumber).toBeUndefined();
    });

    it('should generate sellers with GST', () => {
      const sellers = factory.generateSellersWithGST(5);
      
      expect(sellers).toHaveLength(5);
      sellers.forEach(seller => {
        expect(seller.gstNumber).toBeDefined();
        expect(seller.gstNumber).toMatch(/^\d{2}[A-Z0-9]{13}$/);
      });
    });

    it('should generate regional sellers', () => {
      const sellers = factory.generateRegionalSellers(3, 'Maharashtra');
      
      expect(sellers).toHaveLength(3);
      sellers.forEach(seller => {
        expect(seller.gstNumber).toMatch(/^27[A-Z0-9]{13}$/); // Maharashtra code
        expect(seller.businessAddress).toContain('Maharashtra');
      });
    });
  });

  describe('TaskDataFactory', () => {
    let factory: TaskDataFactory;

    beforeEach(() => {
      factory = new TaskDataFactory();
    });

    it('should generate a valid task', () => {
      const task = factory.generateTask();
      
      expect(task).toBeDefined();
      expect(task.userId).toBeDefined();
      expect(task.title).toBeDefined();
      expect(task.description).toBeDefined();
      expect(Object.values(TaskStatus)).toContain(task.status);
      expect(['low', 'medium', 'high']).toContain(task.priority);
      expect(task.dueDate).toBeInstanceOf(Date);
    });

    it('should generate status-specific tasks', () => {
      const pending = factory.generatePendingTask();
      const inProgress = factory.generateInProgressTask();
      const completed = factory.generateCompletedTask();
      
      expect(pending.status).toBe(TaskStatus.PENDING);
      expect(inProgress.status).toBe(TaskStatus.IN_PROGRESS);
      expect(completed.status).toBe(TaskStatus.COMPLETED);
    });
  });

  describe('MessageDataFactory', () => {
    let factory: MessageDataFactory;

    beforeEach(() => {
      factory = new MessageDataFactory();
    });

    it('should generate a valid message', () => {
      const message = factory.generateMessage();
      
      expect(message).toBeDefined();
      expect(message.sessionId).toBeDefined();
      expect(message.userId).toBeDefined();
      expect(message.content).toBeDefined();
      expect(['text', 'image', 'audio', 'video', 'document']).toContain(message.messageType);
      expect(['WHATSAPP', 'TELEGRAM', 'WEB', 'MOBILE']).toContain(message.platform);
      expect(message.platformMessageId).toBeDefined();
      expect(typeof message.isFromUser).toBe('boolean');
      expect(message.timestamp).toBeInstanceOf(Date);
      expect(message.metadata).toBeDefined();
    });

    it('should generate platform-specific messages', () => {
      const whatsapp = factory.generateWhatsAppMessage();
      const telegram = factory.generateTelegramMessage();
      
      expect(whatsapp.platform).toBe('WHATSAPP');
      expect(telegram.platform).toBe('TELEGRAM');
    });

    it('should generate user and bot messages', () => {
      const userMessage = factory.generateUserMessage();
      const botMessage = factory.generateBotMessage();
      
      expect(userMessage.isFromUser).toBe(true);
      expect(botMessage.isFromUser).toBe(false);
    });
  });

  describe('VectorDataFactory', () => {
    let factory: VectorDataFactory;

    beforeEach(() => {
      factory = new VectorDataFactory();
    });

    it('should generate a valid vector', () => {
      const vector = factory.generateVector();
      
      expect(vector).toBeDefined();
      expect(vector.id).toBeDefined();
      expect(Array.isArray(vector.vector)).toBe(true);
      expect(vector.vector).toHaveLength(1536);
      expect(vector.payload).toBeDefined();
      expect(vector.payload.text).toBeDefined();
      expect(vector.payload.category).toBeDefined();
      expect(vector.payload.timestamp).toBeDefined();
    });

    it('should generate category-specific vectors', () => {
      const product = factory.generateProductVector();
      const conversation = factory.generateConversationVector();
      const document = factory.generateDocumentVector();
      const userBehavior = factory.generateUserBehaviorVector();
      
      expect(product.payload.category).toBe('product');
      expect(conversation.payload.category).toBe('conversation');
      expect(document.payload.category).toBe('document');
      expect(userBehavior.payload.category).toBe('user_behavior');
    });

    it('should generate normalized vectors', () => {
      const vector = factory.generateNormalizedVector();
      
      expect(vector.vector).toHaveLength(1536);
      
      // Check if vector is normalized (magnitude should be 1)
      const magnitude = Math.sqrt(
        vector.vector.reduce((sum, val) => sum + val * val, 0)
      );
      expect(magnitude).toBeCloseTo(1, 4);
    });
  });

  describe('RelationshipAwareFactory', () => {
    let factory: RelationshipAwareFactory;

    beforeEach(() => {
      factory = new RelationshipAwareFactory({ seed: 123 });
    });

    it('should generate a complete related dataset', () => {
      const options = {
        userCount: 10,
        sellerRatio: 0.3,
        productsPerSeller: 5,
        ordersPerUser: 2,
        tasksPerUser: 1,
        messagesPerUser: 3,
        vectorsPerProduct: 1,
        vectorsPerMessage: 1,
      };
      
      const dataset = factory.generateRelatedDataSet(options);
      
      expect(dataset.users).toHaveLength(10);
      expect(dataset.sellerProfiles).toHaveLength(3); // 30% of 10
      expect(dataset.products).toHaveLength(15); // 3 sellers * 5 products
      expect(dataset.orders).toHaveLength(20); // 10 users * 2 orders
      expect(dataset.tasks).toHaveLength(10); // 10 users * 1 task
      expect(dataset.messages).toHaveLength(30); // 10 users * 3 messages
      expect(dataset.vectors).toHaveLength(45); // 15 products + 30 messages
    });

    it('should generate ecommerce scenario', () => {
      const scenario = factory.generateEcommerceScenario(20, 5, 10);
      
      expect(scenario.users).toHaveLength(25);
      expect(scenario.sellerProfiles).toHaveLength(5);
      expect(scenario.products).toHaveLength(50);
      expect(scenario.orders.length).toBeGreaterThan(0);
      expect(scenario.tasks.length).toBeGreaterThan(0);
      expect(scenario.messages.length).toBeGreaterThan(0);
      expect(scenario.vectors.length).toBeGreaterThan(0);
    });

    it('should generate user with complete profile', () => {
      const profile = factory.generateUserWithCompleteProfile(UserRole.SELLER);
      
      expect(profile.user).toBeDefined();
      expect(profile.user.role).toBe(UserRole.SELLER);
      expect(profile.sellerProfile).toBeDefined();
      expect(profile.products).toHaveLength(10);
      expect(profile.orders).toHaveLength(5);
      expect(profile.tasks).toHaveLength(3);
      expect(profile.messages).toHaveLength(10);
    });

    it('should generate seller with inventory', () => {
      const seller = factory.generateSellerWithInventory(20);
      
      expect(seller.user.role).toBe(UserRole.SELLER);
      expect(seller.sellerProfile.isVerified).toBe(true);
      expect(seller.products).toHaveLength(20);
      expect(seller.orders.length).toBeGreaterThan(0);
      expect(seller.vectors).toHaveLength(20);
    });

    it('should maintain relationships between entities', () => {
      const dataset = factory.generateRelatedDataSet({
        userCount: 5,
        sellerRatio: 0.4,
        productsPerSeller: 3,
        ordersPerUser: 2,
        tasksPerUser: 1,
        messagesPerUser: 2,
        vectorsPerProduct: 1,
        vectorsPerMessage: 1,
      });
      
      // Check that seller profiles have corresponding users
      const sellerUsers = dataset.users.filter(u => u.role === UserRole.SELLER);
      expect(dataset.sellerProfiles).toHaveLength(sellerUsers.length);
      
      // Check that products have corresponding sellers
      const sellerIds = dataset.sellerProfiles.map(s => s.id);
      dataset.products.forEach(product => {
        expect(sellerIds).toContain(product.sellerId);
      });
      
      // Check that orders have valid user and seller references
      const userIds = dataset.users.map(u => u.id);
      dataset.orders.forEach(order => {
        expect(userIds).toContain(order.userId);
        expect(sellerIds).toContain(order.sellerId);
      });
    });
  });

  describe('Factory Configuration', () => {
    it('should respect seed configuration for reproducible data', () => {
      const config = { seed: 42 };
      const factory1 = new UserDataFactory(config);
      const factory2 = new UserDataFactory(config);
      
      const user1 = factory1.generateUser();
      const user2 = factory2.generateUser();
      
      expect(user1.email).toBe(user2.email);
      expect(user1.firstName).toBe(user2.firstName);
      expect(user1.lastName).toBe(user2.lastName);
    });

    it('should generate different data without seed', () => {
      const factory1 = new UserDataFactory();
      const factory2 = new UserDataFactory();
      
      const user1 = factory1.generateUser();
      const user2 = factory2.generateUser();
      
      // With different or no seeds, data should be different
      expect(user1.email).not.toBe(user2.email);
    });
  });
});