import { ConfigService } from '@nestjs/config';
import { MongodbService } from '../mongodb/config/mongodb.service';
import { faker } from '@faker-js/faker';
import { ObjectId } from 'mongodb';

export interface MongoDBTestMessage {
  _id?: ObjectId;
  sessionId: string;
  userId?: string;
  content: string;
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document';
  platform: 'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM';
  platformMessageId?: string;
  metadata?: Record<string, any>;
  isFromUser: boolean;
  timestamp: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface MongoDBTestChatSession {
  _id?: ObjectId;
  userId?: string;
  platform: 'WHATSAPP' | 'INSTAGRAM' | 'TELEGRAM';
  platformUserId: string;
  sessionToken: string;
  isActive: boolean;
  language?: string;
  metadata?: Record<string, any>;
  lastActivity: Date;
  createdAt: Date;
  updatedAt: Date;
  expiresAt?: Date;
}

export interface MongoDBTestAnalyticsEvent {
  _id?: ObjectId;
  eventType: string;
  eventData: Record<string, any>;
  userId?: string;
  sessionId?: string;
  platform?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class MongoDBTestDataFactory {
  constructor(
    private mongodbService: MongodbService,
    private configService: ConfigService
  ) {}

  /**
   * Generate test message data
   */
  generateMessage(sessionId: string, overrides: Partial<MongoDBTestMessage> = {}): MongoDBTestMessage {
    const now = new Date();
    const messageTypes = ['text', 'image', 'audio', 'video', 'document'] as const;
    const platforms = ['WHATSAPP', 'INSTAGRAM', 'TELEGRAM'] as const;
    
    return {
      sessionId,
      userId: faker.datatype.boolean(0.8) ? faker.string.uuid() : undefined, // 80% chance of having userId
      content: this.generateMessageContent(),
      messageType: faker.helpers.arrayElement(messageTypes),
      platform: faker.helpers.arrayElement(platforms),
      platformMessageId: faker.string.alphanumeric({ length: 16 }),
      metadata: this.generateMessageMetadata(),
      isFromUser: faker.datatype.boolean(), // 50% chance of being from user
      timestamp: now,
      createdAt: now,
      updatedAt: now,
      expiresAt: faker.datatype.boolean(0.1) ? faker.date.future() : undefined, // 10% chance of expiration
      ...overrides,
    };
  }

  /**
   * Generate test chat session data
   */
  generateChatSession(overrides: Partial<MongoDBTestChatSession> = {}): MongoDBTestChatSession {
    const now = new Date();
    const platforms = ['WHATSAPP', 'INSTAGRAM', 'TELEGRAM'] as const;
    const languages = ['en', 'hi', 'ta', 'te', 'bn', 'mr', 'gu'];
    
    return {
      userId: faker.datatype.boolean(0.7) ? faker.string.uuid() : undefined, // 70% chance of having userId
      platform: faker.helpers.arrayElement(platforms),
      platformUserId: faker.string.alphanumeric({ length: 12 }),
      sessionToken: faker.string.alphanumeric({ length: 32 }),
      isActive: faker.datatype.boolean(0.6), // 60% chance of being active
      language: faker.helpers.arrayElement(languages),
      metadata: this.generateSessionMetadata(),
      lastActivity: faker.date.recent({ days: 1 }),
      createdAt: now,
      updatedAt: now,
      expiresAt: faker.date.future({ years: 1 }),
      ...overrides,
    };
  }

  /**
   * Generate test analytics event data
   */
  generateAnalyticsEvent(overrides: Partial<MongoDBTestAnalyticsEvent> = {}): MongoDBTestAnalyticsEvent {
    const eventTypes = [
      'message_sent',
      'message_received',
      'session_started',
      'session_ended',
      'product_viewed',
      'order_placed',
      'payment_completed',
      'user_registered',
      'error_occurred'
    ];

    return {
      eventType: faker.helpers.arrayElement(eventTypes),
      eventData: this.generateEventData(),
      userId: faker.datatype.boolean(0.8) ? faker.string.uuid() : undefined,
      sessionId: faker.datatype.boolean(0.9) ? faker.string.uuid() : undefined,
      platform: faker.helpers.arrayElement(['WHATSAPP', 'INSTAGRAM', 'TELEGRAM']),
      timestamp: faker.date.recent({ days: 7 }),
      metadata: {
        userAgent: faker.internet.userAgent(),
        ipAddress: faker.internet.ip(),
        location: faker.location.city(),
      },
      ...overrides,
    };
  }

  /**
   * Generate realistic message content based on type
   */
  private generateMessageContent(): string {
    const messageTemplates = [
      () => `Hi, I'm interested in ${faker.commerce.productName()}`,
      () => `What's the price of ${faker.commerce.productName()}?`,
      () => `Is this product available in stock?`,
      () => `Can you show me more details about this?`,
      () => `I would like to place an order`,
      () => `What are your delivery options?`,
      () => `Thank you for the information`,
      () => `Can I get a discount on bulk orders?`,
      () => faker.lorem.sentences({ min: 1, max: 3 }),
      () => `My order number is ${faker.string.alphanumeric({ length: 8 }).toUpperCase()}`,
    ];

    return faker.helpers.arrayElement(messageTemplates)();
  }

  /**
   * Generate message metadata
   */
  private generateMessageMetadata(): Record<string, any> {
    const metadata: Record<string, any> = {};

    if (faker.datatype.boolean(0.3)) { // 30% chance of having file info
      metadata.fileInfo = {
        fileName: faker.system.fileName(),
        fileSize: faker.number.int({ min: 1024, max: 10485760 }), // 1KB to 10MB
        mimeType: faker.system.mimeType(),
      };
    }

    if (faker.datatype.boolean(0.2)) { // 20% chance of having location
      metadata.location = {
        latitude: faker.location.latitude(),
        longitude: faker.location.longitude(),
        address: faker.location.streetAddress(),
      };
    }

    if (faker.datatype.boolean(0.1)) { // 10% chance of having reply info
      metadata.replyTo = {
        messageId: faker.string.alphanumeric({ length: 16 }),
        snippet: faker.lorem.words(5),
      };
    }

    return metadata;
  }

  /**
   * Generate session metadata
   */
  private generateSessionMetadata(): Record<string, any> {
    return {
      userAgent: faker.internet.userAgent(),
      deviceType: faker.helpers.arrayElement(['mobile', 'desktop', 'tablet']),
      ipAddress: faker.internet.ip(),
      timezone: faker.location.timeZone(),
      referrer: faker.datatype.boolean(0.3) ? faker.internet.url() : undefined,
      sessionDuration: faker.number.int({ min: 60, max: 7200 }), // 1 minute to 2 hours
    };
  }

  /**
   * Generate analytics event data
   */
  private generateEventData(): Record<string, any> {
    return {
      duration: faker.number.int({ min: 100, max: 30000 }), // milliseconds
      success: faker.datatype.boolean(0.9), // 90% success rate
      errorCode: faker.datatype.boolean(0.1) ? faker.string.alphanumeric({ length: 6 }) : undefined,
      userAction: faker.helpers.arrayElement(['click', 'scroll', 'type', 'voice', 'image']),
      value: faker.number.float({ min: 0, max: 10000, fractionDigits: 2 }),
      category: faker.commerce.department(),
    };
  }

  /**
   * Generate multiple messages for a session
   */
  generateConversation(sessionId: string, messageCount: number): MongoDBTestMessage[] {
    const messages: MongoDBTestMessage[] = [];
    let isFromUser = true;

    for (let i = 0; i < messageCount; i++) {
      const timestamp = faker.date.recent({ days: 1 });
      messages.push(this.generateMessage(sessionId, {
        isFromUser,
        timestamp,
        createdAt: timestamp,
        updatedAt: timestamp,
      }));
      
      // Alternate between user and system messages
      isFromUser = !isFromUser;
    }

    // Sort by timestamp
    return messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Generate multiple chat sessions
   */
  generateChatSessions(count: number, overrides: Partial<MongoDBTestChatSession> = {}): MongoDBTestChatSession[] {
    return Array.from({ length: count }, () => this.generateChatSession(overrides));
  }

  /**
   * Generate multiple analytics events
   */
  generateAnalyticsEvents(count: number, overrides: Partial<MongoDBTestAnalyticsEvent> = {}): MongoDBTestAnalyticsEvent[] {
    return Array.from({ length: count }, () => this.generateAnalyticsEvent(overrides));
  }

  /**
   * Seed complete MongoDB test dataset
   */
  async seedCompleteDataset(): Promise<{
    sessions: MongoDBTestChatSession[];
    messages: MongoDBTestMessage[];
    analytics: MongoDBTestAnalyticsEvent[];
  }> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot seed test data in production environment');
    }

    const connection = this.mongodbService.getConnection();
    const results = {
      sessions: [] as MongoDBTestChatSession[],
      messages: [] as MongoDBTestMessage[],
      analytics: [] as MongoDBTestAnalyticsEvent[],
    };

    try {
      // Generate chat sessions
      const sessions = this.generateChatSessions(10);
      const sessionsCollection = connection.collection('chat_sessions');
      const sessionResult = await sessionsCollection.insertMany(sessions);
      results.sessions = sessions.map((session, index) => ({
        ...session,
        _id: sessionResult.insertedIds[index] as ObjectId,
      }));

      // Generate messages for each session
      const allMessages: MongoDBTestMessage[] = [];
      for (const session of results.sessions) {
        const sessionMessages = this.generateConversation(session._id!.toString(), 5);
        allMessages.push(...sessionMessages);
      }
      
      const messagesCollection = connection.collection('messages');
      const messageResult = await messagesCollection.insertMany(allMessages);
      results.messages = allMessages.map((message, index) => ({
        ...message,
        _id: messageResult.insertedIds[index] as ObjectId,
      }));

      // Generate analytics events
      const analytics = this.generateAnalyticsEvents(50);
      const analyticsCollection = connection.collection('analytics_events');
      const analyticsResult = await analyticsCollection.insertMany(analytics);
      results.analytics = analytics.map((event, index) => ({
        ...event,
        _id: analyticsResult.insertedIds[index] as ObjectId,
      }));

      console.log('MongoDB test data seeding completed:', {
        sessions: results.sessions.length,
        messages: results.messages.length,
        analytics: results.analytics.length,
      });

      return results;
    } catch (error) {
      console.error('Failed to seed MongoDB test data:', error);
      throw error;
    }
  }

  /**
   * Generate test data for specific scenarios
   */
  generateScenarioData(scenario: 'active-chat' | 'message-history' | 'analytics-spike' | 'multi-platform') {
    switch (scenario) {
      case 'active-chat': {
        const session = this.generateChatSession({ isActive: true });
        return {
          session,
          messages: this.generateConversation(session._id?.toString() || 'temp-id', 10),
        };
      }
      
      case 'message-history': {
        return {
          messages: Array.from({ length: 100 }, () => 
            this.generateMessage(faker.string.uuid(), {
              timestamp: faker.date.past({ years: 1 }),
            })
          ),
        };
      }
      
      case 'analytics-spike': {
        return {
          analytics: Array.from({ length: 1000 }, () => 
            this.generateAnalyticsEvent({
              timestamp: faker.date.recent({ days: 1 }),
            })
          ),
        };
      }
      
      case 'multi-platform': {
        return {
          whatsappSessions: this.generateChatSessions(5, { platform: 'WHATSAPP' }),
          instagramSessions: this.generateChatSessions(3, { platform: 'INSTAGRAM' }),
          telegramSessions: this.generateChatSessions(2, { platform: 'TELEGRAM' }),
        };
      }
      
      default:
        throw new Error(`Unknown scenario: ${scenario}`);
    }
  }

  /**
   * Clean all test data from MongoDB
   */
  async cleanAllTestData(): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    await this.mongodbService.cleanDb();
  }

  /**
   * Clean specific collections
   */
  async cleanCollections(collectionNames: string[]): Promise<void> {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean test data in production environment');
    }

    const connection = this.mongodbService.getConnection();
    
    for (const collectionName of collectionNames) {
      const collection = connection.collection(collectionName);
      await collection.deleteMany({});
      console.log(`Cleaned collection: ${collectionName}`);
    }
  }
}