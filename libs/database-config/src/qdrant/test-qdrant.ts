#!/usr/bin/env tsx
/**
 * Test script to verify Qdrant connection and collection creation
 * Run with: npx tsx libs/database-config/src/qdrant/test-qdrant.ts
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { COLLECTION_SCHEMAS } from './schemas/collection-schemas';

async function testQdrantConnection() {
  console.log('🔍 Testing Qdrant connection...');
  
  const client = new QdrantClient({
    host: 'localhost',
    port: 6333,
    https: false,
  });

  try {
    // Test basic connection
    console.log('📡 Testing basic connection...');
    const collections = await client.getCollections();
    console.log('✅ Connected to Qdrant successfully!');
    console.log(`📊 Found ${collections.collections.length} existing collections`);
    
    // List existing collections
    if (collections.collections.length > 0) {
      console.log('📋 Existing collections:');
      for (const collection of collections.collections) {
        console.log(`  - ${collection.name}`);
      }
    }

    // Test creating a simple collection
    console.log('\n🛠️ Testing collection creation...');
    const testCollectionName = 'test_collection_' + Date.now();
    
    await client.createCollection(testCollectionName, {
      vectors: {
        size: 384,
        distance: 'Cosine',
      },
    });
    
    console.log(`✅ Created test collection: ${testCollectionName}`);
    
    // Verify collection was created
    const info = await client.getCollection(testCollectionName);
    console.log(`📊 Collection info:`, {
      name: info.config?.params?.vectors?.distance,
      vectorSize: info.config?.params?.vectors?.size,
      status: info.status,
    });
    
    // Clean up test collection
    await client.deleteCollection(testCollectionName);
    console.log(`🗑️ Cleaned up test collection: ${testCollectionName}`);
    
    console.log('\n✅ All Qdrant tests passed!');
    
  } catch (error) {
    console.error('❌ Qdrant test failed:', error);
    console.error('💡 Make sure Qdrant is running: docker-compose up qdrant');
    process.exit(1);
  }
}

async function testCollectionSchemas() {
  console.log('\n🔍 Testing collection schemas...');
  
  const client = new QdrantClient({
    host: 'localhost',
    port: 6333,
    https: false,
  });

  try {
    // Test creating collections from our schemas
    const testCollections = [];
    
    for (const [_schemaKey, schema] of Object.entries(COLLECTION_SCHEMAS)) {
      const testName = `test_${schema.name}_${Date.now()}`;
      console.log(`🛠️ Creating collection: ${testName}`);
      
      await client.createCollection(testName, {
        vectors: {
          size: schema.vectorSize,
          distance: schema.distance,
        },
      });
      
      testCollections.push(testName);
      console.log(`✅ Created: ${testName} (${schema.vectorSize}D, ${schema.distance})`);
    }
    
    console.log(`\n📊 Created ${testCollections.length} test collections successfully!`);
    
    // Clean up all test collections
    console.log('🗑️ Cleaning up test collections...');
    for (const collectionName of testCollections) {
      await client.deleteCollection(collectionName);
      console.log(`✅ Deleted: ${collectionName}`);
    }
    
    console.log('\n✅ All collection schema tests passed!');
    
  } catch (error) {
    console.error('❌ Collection schema test failed:', error);
    throw error;
  }
}

async function main() {
  console.log('🚀 Starting Qdrant integration tests...\n');
  
  try {
    await testQdrantConnection();
    await testCollectionSchemas();
    
    console.log('\n🎉 All Qdrant integration tests completed successfully!');
    console.log('✅ Qdrant vector database is ready for use in Kadai');
    
  } catch (error) {
    console.error('\n💥 Integration tests failed:', error);
    process.exit(1);
  }
}

// Run the tests
if (require.main === module) {
  main();
}