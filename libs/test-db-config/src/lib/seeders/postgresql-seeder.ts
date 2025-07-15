import { BaseSeeder } from './base-seeder';
import {
  PostgreSQLSeedScript,
  SeedOptions,
  SeedResult,
  PostgreSQLConnection,
  UserTestData,
  SellerProfileTestData,
  ProductTestData,
  OrderTestData,
  TaskTestData,
} from '../../types';
import { RelationshipAwareFactory } from '../factories';

export class PostgreSQLSeeder
  extends BaseSeeder
  implements PostgreSQLSeedScript
{
  public readonly id = 'postgresql-seeder';
  public readonly name = 'PostgreSQL Database Seeder';
  public readonly version = '1.0.0';
  public readonly description =
    'Seeds PostgreSQL database with test data for users, sellers, products, orders, and tasks';
  public readonly dependencies: string[] = [];
  public readonly database = 'postgresql' as const;

  private relationshipFactory: RelationshipAwareFactory;

  constructor(private connection: PostgreSQLConnection, options?: SeedOptions) {
    super(options);
    this.relationshipFactory = new RelationshipAwareFactory();
  }

  async execute(options?: SeedOptions): Promise<SeedResult> {
    const validatedOptions = this.validateOptions(options);
    const startTime = Date.now();
    let totalRecords = 0;
    const errors: Error[] = [];

    this.emitEvent({
      type: 'seed_start',
      seedId: this.id,
      database: this.database,
      timestamp: new Date(),
      data: validatedOptions,
    });

    try {
      this.logInfo('Starting PostgreSQL seeding', validatedOptions);

      // Clean up if requested
      if (validatedOptions.cleanup) {
        await this.cleanup();
      }

      // Generate related dataset
      const dataset = this.relationshipFactory.generateRelatedDataSet({
        userCount: validatedOptions.userCount || 100,
        sellerRatio: 0.3, // 30% sellers
        productsPerSeller: Math.floor(
          (validatedOptions.productCount || 100) /
            ((validatedOptions.userCount || 100) * 0.3)
        ),
        ordersPerUser: Math.floor(
          (validatedOptions.orderCount || 50) /
            (validatedOptions.userCount || 100)
        ),
        tasksPerUser: Math.floor(
          (validatedOptions.taskCount || 200) /
            (validatedOptions.userCount || 100)
        ),
        messagesPerUser: 0, // PostgreSQL doesn't store messages
        vectorsPerProduct: 0, // PostgreSQL doesn't store vectors
        vectorsPerMessage: 0,
      });

      // Seed users
      const userResult = await this.seedUsers(dataset.users);
      if (!userResult.success) {
        errors.push(...(userResult.errors || []));
      }
      totalRecords += userResult.recordsCreated;

      // Seed seller profiles
      const sellerResult = await this.seedSellerProfiles(
        dataset.sellerProfiles
      );
      if (!sellerResult.success) {
        errors.push(...(sellerResult.errors || []));
      }
      totalRecords += sellerResult.recordsCreated;

      // Seed products
      const productResult = await this.seedProducts(dataset.products);
      if (!productResult.success) {
        errors.push(...(productResult.errors || []));
      }
      totalRecords += productResult.recordsCreated;

      // Seed orders
      const orderResult = await this.seedOrders(dataset.orders);
      if (!orderResult.success) {
        errors.push(...(orderResult.errors || []));
      }
      totalRecords += orderResult.recordsCreated;

      // Seed tasks
      const taskResult = await this.seedTasks(dataset.tasks);
      if (!taskResult.success) {
        errors.push(...(taskResult.errors || []));
      }
      totalRecords += taskResult.recordsCreated;

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.trackPerformance('full_seed', this.database, totalRecords, duration);

      this.emitEvent({
        type: 'seed_complete',
        seedId: this.id,
        database: this.database,
        timestamp: new Date(),
        data: { totalRecords, duration, success },
      });

      this.logInfo('PostgreSQL seeding completed', {
        totalRecords,
        duration,
        success,
        errorCount: errors.length,
      });

      return this.createSeedResult(success, totalRecords, duration, errors);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      this.emitEvent({
        type: 'seed_error',
        seedId: this.id,
        database: this.database,
        timestamp: new Date(),
        error: err,
      });

      this.logError('PostgreSQL seeding failed', err);

      return this.createSeedResult(
        false,
        totalRecords,
        Date.now() - startTime,
        errors
      );
    }
  }

  async executeSQL(sql: string): Promise<unknown> {
    const client = await this.connection.pool.connect();
    try {
      const result = await client.query(sql);
      return result;
    } finally {
      client.release();
    }
  }

  async executeBulkInsert(table: string, data: unknown[]): Promise<SeedResult> {
    if (data.length === 0) {
      return this.createSeedResult(true, 0, 0);
    }

    const startTime = Date.now();
    const errors: Error[] = [];
    let recordsCreated = 0;

    try {
      const client = await this.connection.pool.connect();

      try {
        // Begin transaction
        await client.query('BEGIN');

        // Process in batches for better performance
        const batchSize = 1000;
        const batches = this.chunkArray(data, batchSize);

        for (const batch of batches) {
          const { error } = await this.executeWithErrorHandling(
            () => this.insertBatch(client, table, batch),
            `bulk insert ${table}`
          );

          if (error) {
            errors.push(error);
          } else {
            recordsCreated += batch.length;
          }
        }

        if (errors.length === 0) {
          await client.query('COMMIT');
        } else {
          await client.query('ROLLBACK');
        }
      } finally {
        client.release();
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.trackPerformance(
        `bulk_insert_${table}`,
        this.database,
        recordsCreated,
        duration
      );

      return this.createSeedResult(success, recordsCreated, duration, errors);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err);

      return this.createSeedResult(
        false,
        recordsCreated,
        Date.now() - startTime,
        errors
      );
    }
  }

  private async insertBatch(
    client: unknown,
    table: string,
    batch: unknown[]
  ): Promise<void> {
    if (batch.length === 0) return;

    const keys = Object.keys(batch[0] as any);
    const columns = keys.join(', ');
    const placeholders = batch
      .map(
        (_, rowIndex) =>
          `(${keys
            .map((_, colIndex) => `$${rowIndex * keys.length + colIndex + 1}`)
            .join(', ')})`
      )
      .join(', ');

    const values = batch.flatMap((row) => keys.map((key) => (row as any)[key]));
    const sql = `INSERT INTO ${table} (${columns}) VALUES ${placeholders}`;

    await (client as any).query(sql, values);
  }

  private async seedUsers(users: UserTestData[]): Promise<SeedResult> {
    this.logInfo(`Seeding ${users.length} users`);

    const userData = users.map((user) => ({
      id: user.id || require('crypto').randomUUID(),
      email: user.email,
      phone_number: user.phoneNumber,
      first_name: user.firstName,
      last_name: user.lastName,
      role: user.role,
      is_active: user.isActive,
      email_verified: user.emailVerified,
      phone_verified: user.phoneVerified,
      created_at: user.createdAt || new Date(),
      updated_at: user.updatedAt || new Date(),
    }));

    return await this.executeBulkInsert('users', userData);
  }

  private async seedSellerProfiles(
    sellerProfiles: SellerProfileTestData[]
  ): Promise<SeedResult> {
    this.logInfo(`Seeding ${sellerProfiles.length} seller profiles`);

    const sellerData = sellerProfiles.map((seller) => ({
      id: seller.id || require('crypto').randomUUID(),
      user_id: seller.userId,
      business_name: seller.businessName,
      business_type: seller.businessType,
      gst_number: seller.gstNumber,
      business_address: seller.businessAddress,
      business_phone: seller.businessPhone,
      business_email: seller.businessEmail,
      is_verified: seller.isVerified,
      created_at: seller.createdAt || new Date(),
      updated_at: seller.updatedAt || new Date(),
    }));

    return await this.executeBulkInsert('seller_profiles', sellerData);
  }

  private async seedProducts(products: ProductTestData[]): Promise<SeedResult> {
    this.logInfo(`Seeding ${products.length} products`);

    const productData = products.map((product) => ({
      id: product.id || require('crypto').randomUUID(),
      seller_id: product.sellerId,
      name: product.name,
      description: product.description,
      price: product.price,
      currency: product.currency,
      stock_quantity: product.stockQuantity,
      sku: product.sku,
      category: product.category,
      images: JSON.stringify(product.images),
      is_active: product.isActive,
      created_at: product.createdAt || new Date(),
      updated_at: product.updatedAt || new Date(),
    }));

    return await this.executeBulkInsert('products', productData);
  }

  private async seedOrders(orders: OrderTestData[]): Promise<SeedResult> {
    this.logInfo(`Seeding ${orders.length} orders`);

    const orderData = orders.map((order) => ({
      id: order.id || require('crypto').randomUUID(),
      user_id: order.userId,
      seller_id: order.sellerId,
      order_number:
        order.orderNumber ||
        `ORD-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      status: order.status,
      total_amount: order.totalAmount,
      currency: order.currency,
      shipping_address: order.shippingAddress,
      billing_address: order.billingAddress,
      notes: order.notes,
      created_at: order.createdAt || new Date(),
      updated_at: order.updatedAt || new Date(),
    }));

    return await this.executeBulkInsert('orders', orderData);
  }

  private async seedTasks(tasks: TaskTestData[]): Promise<SeedResult> {
    this.logInfo(`Seeding ${tasks.length} tasks`);

    const taskData = tasks.map((task) => ({
      id: task.id || require('crypto').randomUUID(),
      user_id: task.userId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      due_date: task.dueDate,
      created_at: task.createdAt || new Date(),
      updated_at: task.updatedAt || new Date(),
    }));

    return await this.executeBulkInsert('tasks', taskData);
  }

  private async cleanup(): Promise<void> {
    this.logInfo('Cleaning up PostgreSQL database');

    const tables = ['tasks', 'orders', 'products', 'seller_profiles', 'users'];

    for (const table of tables) {
      await this.executeSQL(`TRUNCATE TABLE ${table} RESTART IDENTITY CASCADE`);
    }

    this.logInfo('PostgreSQL cleanup completed');
  }

  override async rollback(): Promise<SeedResult> {
    const startTime = Date.now();

    try {
      await this.cleanup();
      const duration = Date.now() - startTime;

      this.logInfo('PostgreSQL rollback completed', { duration });

      return this.createSeedResult(true, 0, duration);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.logError('PostgreSQL rollback failed', err);

      return this.createSeedResult(false, 0, duration, [err]);
    }
  }

  override async validate(): Promise<boolean> {
    try {
      const tables = [
        'users',
        'seller_profiles',
        'products',
        'orders',
        'tasks',
      ];

      for (const table of tables) {
        const result = await this.executeSQL(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        const count = parseInt((result as any).rows[0].count);

        if (count === 0) {
          this.logWarn(`Table ${table} is empty`);
        } else {
          this.logInfo(`Table ${table} has ${count} records`);
        }
      }

      return true;
    } catch (error) {
      this.logError('PostgreSQL validation failed', error);
      return false;
    }
  }
}
