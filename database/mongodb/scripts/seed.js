const { MongoClient } = require('mongodb');

// Load environment variables from .env file
require('dotenv').config({ path: '../../../.env' });

const connectionUrl = process.env.MONGODB_URL?.split('#')[0]?.trim() || `mongodb://${process.env.MONGODB_HOST || 'localhost'}:${process.env.MONGODB_PORT || '27017'}`;
const databaseName = process.env.MONGODB_DATABASE?.split('#')[0]?.trim() || 'kadai';

async function seedDatabase() {
  const client = new MongoClient(connectionUrl);
  
  try {
    await client.connect();
    console.log('🌱 Connected to MongoDB for seeding...');
    
    const db = client.db(databaseName);
    const force = process.argv.includes('--force');
    
    // Check if already seeded (unless force flag is used)
    if (!force) {
      const existingData = await db.collection('chatsessions').countDocuments();
      if (existingData > 0) {
        console.log('✅ Database already contains data. Use --force to reseed.');
        return;
      }
    }
    
    if (force) {
      console.log('🧹 Clearing existing data...');
      await db.collection('messages').deleteMany({});
      await db.collection('chatsessions').deleteMany({});
      await db.collection('conversationhistories').deleteMany({});
    }

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Sample chat sessions
    const chatSessions = [
      {
        sessionId: 'session_001',
        userId: 'user_001',
        platform: 'whatsapp',
        status: 'completed',
        startTime: yesterday,
        endTime: new Date(yesterday.getTime() + 30 * 60 * 1000),
        messageCount: 8,
        context: { 
          productInquiry: 'smartphones',
          priceRange: '15000-25000',
          location: 'Mumbai'
        },
        userProfile: { 
          name: 'Raj Patel',
          phone: '+91-9876543210',
          preferredLanguage: 'hi'
        },
        language: 'hi',
        sessionMetadata: { 
          source: 'organic',
          campaign: null,
          referrer: 'google'
        },
        isArchived: false,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      },
      {
        sessionId: 'session_002',
        userId: 'user_002',
        platform: 'telegram',
        status: 'active',
        startTime: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        // endTime: not set for active sessions
        messageCount: 12,
        context: { 
          productInquiry: 'fashion',
          category: 'womens-clothing',
          occasion: 'wedding'
        },
        userProfile: { 
          name: 'Priya Sharma',
          phone: '+91-9876543211',
          preferredLanguage: 'en'
        },
        language: 'en',
        sessionMetadata: { 
          source: 'social_media',
          campaign: 'instagram_ad_001',
          referrer: 'instagram'
        },
        isArchived: false,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000),
      }
    ];

    // Sample messages
    const messages = [
      // Session 1 - Hindi conversation about smartphones
      {
        messageId: 'msg_001',
        sessionId: 'session_001',
        userId: 'user_001',
        sender: 'user',
        content: 'नमस्ते! मुझे एक अच्छा स्मार्टफोन चाहिए',
        messageType: 'text',
        metadata: { language: 'hi', translated: false },
        timestamp: yesterday,
        isDeleted: false,
      },
      {
        messageId: 'msg_002',
        sessionId: 'session_001',
        userId: 'user_001',
        sender: 'assistant',
        content: 'नमस्ते! मैं आपकी स्मार्टफोन की तलाश में मदद कर सकता हूं। आपका बजट क्या है?',
        messageType: 'text',
        metadata: { language: 'hi', confidence: 0.95 },
        timestamp: new Date(yesterday.getTime() + 30000),
        isDeleted: false,
      },
      {
        messageId: 'msg_003',
        sessionId: 'session_001',
        userId: 'user_001',
        sender: 'user',
        content: '15000 से 25000 के बीच में',
        messageType: 'text',
        metadata: { language: 'hi', budget_extracted: true },
        timestamp: new Date(yesterday.getTime() + 60000),
        isDeleted: false,
      },
      {
        messageId: 'msg_004',
        sessionId: 'session_001',
        userId: 'user_001',
        sender: 'assistant',
        content: 'बेहतरीन! इस बजट में मैं आपको कुछ बेहतरीन विकल्प दे सकता हूं:\n\n1. Xiaomi Redmi Note 12 Pro (₹21,999)\n2. Samsung Galaxy M34 5G (₹18,999)\n3. Realme 11 Pro (₹23,999)\n\nकौन सा फीचर आपके लिए सबसे जरूरी है?',
        messageType: 'text',
        metadata: { language: 'hi', products_suggested: 3 },
        timestamp: new Date(yesterday.getTime() + 120000),
        isDeleted: false,
      },
      
      // Session 2 - English conversation about fashion
      {
        messageId: 'msg_005',
        sessionId: 'session_002',
        userId: 'user_002',
        sender: 'user',
        content: 'Hi! I need help finding wedding outfits',
        messageType: 'text',
        metadata: { language: 'en', intent: 'shopping_inquiry' },
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        isDeleted: false,
      },
      {
        messageId: 'msg_006',
        sessionId: 'session_002',
        userId: 'user_002',
        sender: 'assistant',
        content: 'Hello! I\'d be happy to help you find the perfect wedding outfit. Are you looking for traditional or contemporary styles?',
        messageType: 'text',
        metadata: { language: 'en', intent_recognized: 'fashion_consultation' },
        timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000 + 30000),
        isDeleted: false,
      },
    ];

    // Sample conversation histories
    const conversationHistories = [
      {
        historyId: 'history_001',
        userId: 'user_001',
        sessionId: 'session_001',
        messages: [], // In real app, would contain message ObjectIds
        conversationSummary: 'Customer inquiry about smartphones in 15K-25K budget range. Provided 3 options: Xiaomi Redmi Note 12 Pro, Samsung Galaxy M34 5G, Realme 11 Pro. Customer interested in camera quality and battery life.',
        analytics: {
          totalMessages: 8,
          averageResponseTime: 45,
          sentimentScore: 0.8,
          language: 'hi',
          intents: ['product_inquiry', 'price_check', 'feature_comparison'],
          productsDiscussed: ['smartphones'],
          engagement: 'high'
        },
        summarizedAt: new Date(yesterday.getTime() + 40 * 60 * 1000),
        isProcessed: true,
        expiresAt: new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000), // 90 days
      }
    ];

    // Insert all data
    console.log('📝 Inserting chat sessions...');
    await db.collection('chatsessions').insertMany(chatSessions);
    
    console.log('💬 Inserting messages...');
    await db.collection('messages').insertMany(messages);
    
    console.log('📚 Inserting conversation histories...');
    await db.collection('conversationhistories').insertMany(conversationHistories);

    console.log('✅ Database seeding completed successfully!');
    console.log(`   - ${chatSessions.length} chat sessions`);
    console.log(`   - ${messages.length} messages`);
    console.log(`   - ${conversationHistories.length} conversation histories`);

  } catch (error) {
    console.error('❌ Seeding failed:', error);
    process.exit(1);
  } finally {
    await client.close();
  }
}

// Run seeding
seedDatabase();