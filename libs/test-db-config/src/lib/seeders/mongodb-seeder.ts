import { BaseSeeder } from './base-seeder';
import {
  MongoDBSeedScript,
  SeedOptions,
  SeedResult,
  MongoDBConnection,
  ChatMessageTestData,
} from '../../types';
import { RelationshipAwareFactory } from '../factories';
import { ObjectId } from 'mongodb';

export class MongoDBSeeder extends BaseSeeder implements MongoDBSeedScript {
  public readonly id = 'mongodb-seeder';
  public readonly name = 'MongoDB Database Seeder';
  public readonly version = '1.0.0';
  public readonly description =
    'Seeds MongoDB database with test data for messages, sessions, and conversation history';
  public readonly dependencies: string[] = [];
  public readonly database = 'mongodb' as const;

  private relationshipFactory: RelationshipAwareFactory;

  constructor(private connection: MongoDBConnection, options?: SeedOptions) {
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
      this.logInfo('Starting MongoDB seeding', validatedOptions);

      // Clean up if requested
      if (validatedOptions.cleanup) {
        await this.cleanup();
      }

      // Generate related dataset focused on messaging
      const dataset = this.relationshipFactory.generateRelatedDataSet({
        userCount: validatedOptions.userCount || 100,
        sellerRatio: 0.3,
        productsPerSeller: 0, // MongoDB doesn't store products
        ordersPerUser: 0, // MongoDB doesn't store orders
        tasksPerUser: 0, // MongoDB doesn't store tasks
        messagesPerUser: Math.floor(
          (validatedOptions.messageCount || 1000) /
            (validatedOptions.userCount || 100)
        ),
        vectorsPerProduct: 0,
        vectorsPerMessage: 0, // MongoDB doesn't store vectors
      });

      // Seed messages
      const messageResult = await this.seedMessages(dataset.messages);
      if (!messageResult.success) {
        errors.push(...(messageResult.errors || []));
      }
      totalRecords += messageResult.recordsCreated;

      // Seed chat sessions
      const sessionResult = await this.seedChatSessions(dataset.users);
      if (!sessionResult.success) {
        errors.push(...(sessionResult.errors || []));
      }
      totalRecords += sessionResult.recordsCreated;

      // Seed conversation history
      const historyResult = await this.seedConversationHistory(
        dataset.messages
      );
      if (!historyResult.success) {
        errors.push(...(historyResult.errors || []));
      }
      totalRecords += historyResult.recordsCreated;

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

      this.logInfo('MongoDB seeding completed', {
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

      this.logError('MongoDB seeding failed', err);

      return this.createSeedResult(
        false,
        totalRecords,
        Date.now() - startTime,
        errors
      );
    }
  }

  async executeQuery(
    collection: string,
    operation: { method: string; args: any[] }
  ): Promise<unknown> {
    const coll = this.connection.database.collection(collection);
    return await (coll as any)[operation.method](...operation.args);
  }

  async executeBulkInsert(
    collection: string,
    data: unknown[]
  ): Promise<SeedResult> {
    if (data.length === 0) {
      return this.createSeedResult(true, 0, 0);
    }

    const startTime = Date.now();
    const errors: Error[] = [];
    let recordsCreated = 0;

    try {
      const coll = this.connection.database.collection(collection);

      // Process in batches for better performance
      const batchSize = 1000;
      const batches = this.chunkArray(data, batchSize);

      for (const batch of batches) {
        const { error } = await this.executeWithErrorHandling(
          () => coll.insertMany(batch as any[], { ordered: false }),
          `bulk insert ${collection}`
        );

        if (error) {
          errors.push(error);
        } else {
          recordsCreated += batch.length;
        }
      }

      const duration = Date.now() - startTime;
      const success = errors.length === 0;

      this.trackPerformance(
        `bulk_insert_${collection}`,
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

  private async seedMessages(
    messages: ChatMessageTestData[]
  ): Promise<SeedResult> {
    this.logInfo(`Seeding ${messages.length} messages`);

    const messageData = messages.map((message) => ({
      _id: message.id || new ObjectId(),
      sessionId: message.sessionId,
      userId: message.userId,
      content: message.content,
      messageType: message.messageType,
      platform: message.platform,
      platformMessageId: message.platformMessageId,
      metadata: message.metadata || {},
      isFromUser: message.isFromUser,
      timestamp: message.timestamp || new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
    }));

    return await this.executeBulkInsert('messages', messageData);
  }

  private async seedChatSessions(users: unknown[]): Promise<SeedResult> {
    this.logInfo(`Seeding ${users.length} chat sessions`);

    const sessionData = users.map((user) => ({
      _id: new ObjectId(),
      userId: (user as any).id,
      platform: require('@faker-js/faker').faker.helpers.arrayElement([
        'WHATSAPP',
        'TELEGRAM',
        'WEB',
      ]),
      platformUserId: require('@faker-js/faker').faker.string.uuid(),
      sessionToken: require('@faker-js/faker').faker.string.alphanumeric(32),
      isActive: require('@faker-js/faker').faker.datatype.boolean({
        probability: 0.7,
      }),
      language: require('@faker-js/faker').faker.helpers.arrayElement([
        'en',
        'hi',
        'ta',
        'te',
      ]),
      metadata: {
        userAgent: require('@faker-js/faker').faker.internet.userAgent(),
        ipAddress: require('@faker-js/faker').faker.internet.ip(),
      },
      lastActivity: require('@faker-js/faker').faker.date.recent(),
      createdAt: new Date(),
      updatedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    }));

    return await this.executeBulkInsert('chat_sessions', sessionData);
  }

  private async seedConversationHistory(
    messages: ChatMessageTestData[]
  ): Promise<SeedResult> {
    // Group messages by session to create conversation summaries
    const sessionGroups = messages.reduce((groups, message) => {
      const sessionId = message.sessionId || 'default-session';
      if (!groups[sessionId]) {
        groups[sessionId] = [];
      }
      groups[sessionId].push(message);
      return groups;
    }, {} as Record<string, ChatMessageTestData[]>);

    const historyData = Object.entries(sessionGroups).map(
      ([sessionId, sessionMessages]) => {
        const sortedMessages = sessionMessages.sort(
          (a, b) =>
            new Date(a.timestamp || 0).getTime() -
            new Date(b.timestamp || 0).getTime()
        );

        return {
          _id: new ObjectId(),
          sessionId,
          userId: sessionMessages[0].userId,
          platform: sessionMessages[0].platform,
          summary: this.generateConversationSummary(sessionMessages),
          messageCount: sessionMessages.length,
          startTime: sortedMessages[0].timestamp || new Date(),
          endTime:
            sortedMessages[sortedMessages.length - 1].timestamp || new Date(),
          topics: this.extractTopics(sessionMessages),
          sentiment: require('@faker-js/faker').faker.helpers.arrayElement([
            'positive',
            'negative',
            'neutral',
          ]),
          analytics: {
            averageResponseTime: require('@faker-js/faker').faker.number.int({
              min: 1000,
              max: 30000,
            }),
            userEngagement: require('@faker-js/faker').faker.number.float({
              min: 0,
              max: 1,
              fractionDigits: 2,
            }),
            completedActions: require('@faker-js/faker').faker.number.int({
              min: 0,
              max: 5,
            }),
          },
          createdAt: new Date(),
          updatedAt: new Date(),
        };
      }
    );

    this.logInfo(`Seeding ${historyData.length} conversation histories`);

    return await this.executeBulkInsert('conversation_history', historyData);
  }

  private generateConversationSummary(messages: ChatMessageTestData[]): string {
    const topics = [
      'product inquiry',
      'order status',
      'support request',
      'general chat',
      'complaint',
    ];
    const actions = [
      'browsed products',
      'made inquiry',
      'placed order',
      'requested support',
    ];

    const topic = require('@faker-js/faker').faker.helpers.arrayElement(topics);
    const action =
      require('@faker-js/faker').faker.helpers.arrayElement(actions);

    return `User ${action} regarding ${topic}. Conversation lasted ${messages.length} messages.`;
  }

  private extractTopics(_messages: ChatMessageTestData[]): string[] {
    const allTopics = [
      'products',
      'orders',
      'payments',
      'shipping',
      'returns',
      'support',
      'account',
    ];
    return require('@faker-js/faker').faker.helpers.arrayElements(allTopics, {
      min: 1,
      max: 3,
    });
  }

  private async cleanup(): Promise<void> {
    this.logInfo('Cleaning up MongoDB database');

    const collections = ['messages', 'chat_sessions', 'conversation_history'];

    for (const collectionName of collections) {
      const collection = this.connection.database.collection(collectionName);
      await collection.deleteMany({});
    }

    this.logInfo('MongoDB cleanup completed');
  }

  override async rollback(): Promise<SeedResult> {
    const startTime = Date.now();

    try {
      await this.cleanup();
      const duration = Date.now() - startTime;

      this.logInfo('MongoDB rollback completed', { duration });

      return this.createSeedResult(true, 0, duration);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      const duration = Date.now() - startTime;

      this.logError('MongoDB rollback failed', err);

      return this.createSeedResult(false, 0, duration, [err]);
    }
  }

  override async validate(): Promise<boolean> {
    try {
      const collections = ['messages', 'chat_sessions', 'conversation_history'];

      for (const collectionName of collections) {
        const collection = this.connection.database.collection(collectionName);
        const count = await collection.countDocuments();

        if (count === 0) {
          this.logWarn(`Collection ${collectionName} is empty`);
        } else {
          this.logInfo(`Collection ${collectionName} has ${count} documents`);
        }
      }

      return true;
    } catch (error) {
      this.logError('MongoDB validation failed', error);
      return false;
    }
  }
}
