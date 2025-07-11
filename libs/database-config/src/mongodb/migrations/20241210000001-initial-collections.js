module.exports = {
  async up(db, client) {
    // Create collections with validators
    await db.createCollection('messages', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['messageId', 'sessionId', 'userId', 'sender', 'content'],
          properties: {
            messageId: { bsonType: 'string' },
            sessionId: { bsonType: 'string' },
            userId: { bsonType: 'string' },
            sender: { 
              bsonType: 'string',
              enum: ['user', 'assistant', 'system']
            },
            content: { bsonType: 'string' },
            messageType: {
              bsonType: 'string',
              enum: ['text', 'image', 'audio', 'file']
            },
            metadata: { bsonType: 'object' },
            timestamp: { bsonType: 'date' },
            isDeleted: { bsonType: 'bool' }
          }
        }
      }
    });

    await db.createCollection('chatsessions', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['sessionId', 'userId', 'platform', 'status'],
          properties: {
            sessionId: { bsonType: 'string' },
            userId: { bsonType: 'string' },
            platform: {
              bsonType: 'string',
              enum: ['whatsapp', 'telegram', 'instagram', 'web']
            },
            status: {
              bsonType: 'string',
              enum: ['active', 'inactive', 'completed', 'abandoned']
            },
            startTime: { bsonType: 'date' },
            endTime: { bsonType: 'date' },
            messageCount: { bsonType: 'number' },
            context: { bsonType: 'object' },
            userProfile: { bsonType: 'object' },
            language: { bsonType: 'string' },
            sessionMetadata: { bsonType: 'object' },
            isArchived: { bsonType: 'bool' },
            expiresAt: { bsonType: 'date' }
          }
        }
      }
    });

    await db.createCollection('conversationhistories', {
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['historyId', 'userId', 'sessionId', 'conversationSummary'],
          properties: {
            historyId: { bsonType: 'string' },
            userId: { bsonType: 'string' },
            sessionId: { bsonType: 'string' },
            messages: { 
              bsonType: 'array',
              items: { bsonType: 'objectId' }
            },
            conversationSummary: { bsonType: 'string' },
            analytics: { bsonType: 'object' },
            summarizedAt: { bsonType: 'date' },
            isProcessed: { bsonType: 'bool' },
            expiresAt: { bsonType: 'date' }
          }
        }
      }
    });

    // Create indexes for messages collection
    await db.collection('messages').createIndex(
      { sessionId: 1, timestamp: 1 },
      { background: true, name: 'sessionId_timestamp' }
    );
    
    await db.collection('messages').createIndex(
      { userId: 1, timestamp: -1 },
      { background: true, name: 'userId_timestamp_desc' }
    );
    
    await db.collection('messages').createIndex(
      { messageId: 1 },
      { unique: true, background: true, name: 'messageId_unique' }
    );
    
    await db.collection('messages').createIndex(
      { timestamp: 1 },
      { expireAfterSeconds: 2592000, background: true, name: 'timestamp_ttl' }
    );

    // Create indexes for chatsessions collection
    await db.collection('chatsessions').createIndex(
      { sessionId: 1 },
      { unique: true, background: true, name: 'sessionId_unique' }
    );
    
    await db.collection('chatsessions').createIndex(
      { userId: 1, startTime: -1 },
      { background: true, name: 'userId_startTime_desc' }
    );
    
    await db.collection('chatsessions').createIndex(
      { platform: 1, status: 1 },
      { background: true, name: 'platform_status' }
    );
    
    await db.collection('chatsessions').createIndex(
      { status: 1, startTime: -1 },
      { background: true, name: 'status_startTime_desc' }
    );

    // Create indexes for conversationhistories collection
    await db.collection('conversationhistories').createIndex(
      { historyId: 1 },
      { unique: true, background: true, name: 'historyId_unique' }
    );
    
    await db.collection('conversationhistories').createIndex(
      { userId: 1, summarizedAt: -1 },
      { background: true, name: 'userId_summarizedAt_desc' }
    );
    
    await db.collection('conversationhistories').createIndex(
      { sessionId: 1 },
      { background: true, name: 'sessionId' }
    );
    
    await db.collection('conversationhistories').createIndex(
      { isProcessed: 1 },
      { background: true, name: 'isProcessed' }
    );

    console.log('✅ Created collections and indexes for chat system');
  },

  async down(db, client) {
    // Drop collections
    await db.dropCollection('messages');
    await db.dropCollection('chatsessions');
    await db.dropCollection('conversationhistories');
    
    console.log('✅ Dropped chat system collections');
  }
};