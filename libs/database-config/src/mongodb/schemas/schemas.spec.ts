import {
  ChatSessionSchema,
  ConversationHistorySchema,
  MessageSchema,
} from './schemas';

describe('MongoDB Schemas', () => {
  describe('Message Schema', () => {
    it('should create Message schema with correct properties', () => {
      const schema = MessageSchema;

      expect(schema.paths.messageId).toBeDefined();
      expect(schema.paths.sessionId).toBeDefined();
      expect(schema.paths.userId).toBeDefined();
      expect(schema.paths.sender).toBeDefined();
      expect(schema.paths.content).toBeDefined();
      expect(schema.paths.messageType).toBeDefined();
      expect(schema.paths.metadata).toBeDefined();
      expect(schema.paths.timestamp).toBeDefined();
      expect(schema.paths.isDeleted).toBeDefined();
    });

    it('should have correct enum values for sender field', () => {
      const senderField = MessageSchema.paths.sender as any;
      expect(senderField.enumValues).toEqual(['user', 'assistant', 'system']);
    });

    it('should have correct enum values for messageType field', () => {
      const messageTypeField = MessageSchema.paths.messageType as any;
      expect(messageTypeField.enumValues).toEqual([
        'text',
        'image',
        'audio',
        'file',
      ]);
    });

    it('should have required fields marked as required', () => {
      expect(MessageSchema.paths.messageId.isRequired).toBe(true);
      expect(MessageSchema.paths.sessionId.isRequired).toBe(true);
      expect(MessageSchema.paths.userId.isRequired).toBe(true);
      expect(MessageSchema.paths.sender.isRequired).toBe(true);
      expect(MessageSchema.paths.content.isRequired).toBe(true);
    });
  });

  describe('ChatSession Schema', () => {
    it('should create ChatSession schema with correct properties', () => {
      const schema = ChatSessionSchema;

      expect(schema.paths.sessionId).toBeDefined();
      expect(schema.paths.userId).toBeDefined();
      expect(schema.paths.platform).toBeDefined();
      expect(schema.paths.status).toBeDefined();
      expect(schema.paths.startTime).toBeDefined();
      expect(schema.paths.endTime).toBeDefined();
      expect(schema.paths.messageCount).toBeDefined();
      expect(schema.paths.context).toBeDefined();
      expect(schema.paths.userProfile).toBeDefined();
      expect(schema.paths.language).toBeDefined();
      expect(schema.paths.sessionMetadata).toBeDefined();
      expect(schema.paths.isArchived).toBeDefined();
      expect(schema.paths.expiresAt).toBeDefined();
    });

    it('should have correct enum values for platform field', () => {
      const platformField = ChatSessionSchema.paths.platform as any;
      expect(platformField.enumValues).toEqual([
        'whatsapp',
        'telegram',
        'instagram',
        'web',
      ]);
    });

    it('should have correct enum values for status field', () => {
      const statusField = ChatSessionSchema.paths.status as any;
      expect(statusField.enumValues).toEqual([
        'active',
        'inactive',
        'completed',
        'abandoned',
      ]);
    });

    it('should have required fields marked as required', () => {
      expect(ChatSessionSchema.paths.sessionId.isRequired).toBe(true);
      expect(ChatSessionSchema.paths.userId.isRequired).toBe(true);
      expect(ChatSessionSchema.paths.platform.isRequired).toBe(true);
      expect(ChatSessionSchema.paths.status.isRequired).toBe(true);
    });
  });

  describe('ConversationHistory Schema', () => {
    it('should create ConversationHistory schema with correct properties', () => {
      const schema = ConversationHistorySchema;

      expect(schema.paths.historyId).toBeDefined();
      expect(schema.paths.userId).toBeDefined();
      expect(schema.paths.sessionId).toBeDefined();
      expect(schema.paths.messages).toBeDefined();
      expect(schema.paths.conversationSummary).toBeDefined();
      expect(schema.paths.analytics).toBeDefined();
      expect(schema.paths.summarizedAt).toBeDefined();
      expect(schema.paths.isProcessed).toBeDefined();
      expect(schema.paths.expiresAt).toBeDefined();
    });

    it('should have required fields marked as required', () => {
      expect(ConversationHistorySchema.paths.historyId.isRequired).toBe(true);
      expect(ConversationHistorySchema.paths.userId.isRequired).toBe(true);
      expect(ConversationHistorySchema.paths.sessionId.isRequired).toBe(true);
      expect(
        ConversationHistorySchema.paths.conversationSummary.isRequired
      ).toBe(true);
    });
  });

  describe('Schema Indexes', () => {
    it('should have indexes configured on Message schema', () => {
      const indexes = MessageSchema.indexes();
      expect(indexes.length).toBeGreaterThan(0);

      const indexFields = indexes.map((index) => index[0]);
      expect(indexFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sessionId: 1, timestamp: 1 }),
          expect.objectContaining({ userId: 1, timestamp: -1 }),
          expect.objectContaining({ messageId: 1 }),
          expect.objectContaining({ timestamp: 1 }),
        ])
      );
    });

    it('should have indexes configured on ChatSession schema', () => {
      const indexes = ChatSessionSchema.indexes();
      expect(indexes.length).toBeGreaterThan(0);

      const indexFields = indexes.map((index) => index[0]);
      expect(indexFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ sessionId: 1 }),
          expect.objectContaining({ userId: 1, startTime: -1 }),
          expect.objectContaining({ platform: 1, status: 1 }),
          expect.objectContaining({ status: 1, startTime: -1 }),
        ])
      );
    });

    it('should have indexes configured on ConversationHistory schema', () => {
      const indexes = ConversationHistorySchema.indexes();
      expect(indexes.length).toBeGreaterThan(0);

      const indexFields = indexes.map((index) => index[0]);
      expect(indexFields).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ historyId: 1 }),
          expect.objectContaining({ userId: 1, summarizedAt: -1 }),
          expect.objectContaining({ sessionId: 1 }),
          expect.objectContaining({ isProcessed: 1 }),
        ])
      );
    });
  });
});