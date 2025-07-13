import { faker } from '@faker-js/faker';
import { ChatMessageTestData, TestDataFactoryConfig } from '../../types';

export class MessageDataFactory {
  constructor(private config?: TestDataFactoryConfig) {}

  generateMessage(
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData {
    if (this.config?.seed) {
      faker.seed(this.config.seed);
    }

    return {
      sessionId: faker.string.uuid(),
      userId: faker.string.uuid(),
      content: faker.lorem.sentence(),
      messageType: faker.helpers.arrayElement([
        'text',
        'image',
        'audio',
        'video',
        'document',
      ]),
      platform: faker.helpers.arrayElement([
        'WHATSAPP',
        'TELEGRAM',
        'WEB',
        'MOBILE',
      ]),
      platformMessageId: faker.string.uuid(),
      isFromUser: faker.datatype.boolean(),
      timestamp: faker.date.recent(),
      metadata: {
        sentiment: faker.helpers.arrayElement([
          'positive',
          'negative',
          'neutral',
        ]),
        intent: faker.helpers.arrayElement([
          'inquiry',
          'purchase',
          'support',
          'complaint',
        ]),
      },
      ...overrides,
    };
  }

  generateMessages(
    count: number,
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData[] {
    return Array.from({ length: count }, () => this.generateMessage(overrides));
  }

  generateTextMessage(
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData {
    return this.generateMessage({
      messageType: 'text',
      content: faker.lorem.sentences(faker.number.int({ min: 1, max: 3 })),
      ...overrides,
    });
  }

  generateUserMessage(
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData {
    return this.generateMessage({
      isFromUser: true,
      ...overrides,
    });
  }

  generateBotMessage(
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData {
    return this.generateMessage({
      isFromUser: false,
      ...overrides,
    });
  }

  generateWhatsAppMessage(
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData {
    return this.generateMessage({
      platform: 'WHATSAPP',
      ...overrides,
    });
  }

  generateTelegramMessage(
    overrides?: Partial<ChatMessageTestData>
  ): ChatMessageTestData {
    return this.generateMessage({
      platform: 'TELEGRAM',
      ...overrides,
    });
  }
}
