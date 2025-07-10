import { PrismaClient } from '../generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user (upsert to handle existing data)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@kadai.ai' },
    update: {},
    create: {
      email: 'admin@kadai.ai',
      name: 'Admin User',
      role: 'ADMIN',
      phone: '+919999999999',
    },
  });

  console.log('✅ Created/Updated admin user:', admin.email);

  // Create sample sellers
  const seller1 = await prisma.user.create({
    data: {
      email: 'seller1@example.com',
      name: 'Raj Electronics',
      role: 'SELLER',
      phone: '+919876543210',
      sellerProfile: {
        create: {
          businessName: 'Raj Electronics Store',
          businessType: 'Electronics',
          description: 'Premium electronics and gadgets store in Mumbai',
          isVerified: true,
        },
      },
    },
    include: {
      sellerProfile: true,
    },
  });

  const seller2 = await prisma.user.create({
    data: {
      email: 'seller2@example.com',
      name: 'Priya Fashion',
      role: 'SELLER',
      phone: '+919876543211',
      sellerProfile: {
        create: {
          businessName: 'Priya Fashion Hub',
          businessType: 'Fashion',
          description: 'Trendy clothing and accessories for women',
          isVerified: true,
        },
      },
    },
    include: {
      sellerProfile: true,
    },
  });

  console.log('✅ Created sellers:', seller1.email, seller2.email);

  // Create sample customers
  const customer1 = await prisma.user.create({
    data: {
      email: 'customer1@example.com',
      name: 'Amit Kumar',
      role: 'CUSTOMER',
      phone: '+919876543212',
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      email: 'customer2@example.com',
      name: 'Sneha Patel',
      role: 'CUSTOMER',
      phone: '+919876543213',
    },
  });

  console.log('✅ Created customers:', customer1.email, customer2.email);

  // Create sample products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: 'iPhone 15 Pro',
        description: 'Latest iPhone with A17 Pro chip and titanium design',
        price: 134900,
        category: 'Smartphones',
        stockCount: 50,
        sellerId: seller1.sellerProfile!.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Samsung Galaxy S24',
        description: 'Premium Android smartphone with AI features',
        price: 79999,
        category: 'Smartphones',
        stockCount: 30,
        sellerId: seller1.sellerProfile!.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Sony WH-1000XM5',
        description: 'Industry-leading noise canceling headphones',
        price: 29990,
        category: 'Audio',
        stockCount: 25,
        sellerId: seller1.sellerProfile!.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Designer Kurti Set',
        description: 'Elegant cotton kurti with matching dupatta',
        price: 2999,
        category: 'Women Fashion',
        stockCount: 100,
        sellerId: seller2.sellerProfile!.id,
      },
    }),
    prisma.product.create({
      data: {
        name: 'Silk Saree',
        description: 'Premium silk saree with intricate embroidery',
        price: 8999,
        category: 'Women Fashion',
        stockCount: 20,
        sellerId: seller2.sellerProfile!.id,
      },
    }),
  ]);

  console.log('✅ Created products:', products.length);

  // Create sample orders
  const order1 = await prisma.order.create({
    data: {
      customerId: customer1.id,
      totalAmount: 164890,
      status: 'CONFIRMED',
      orderItems: {
        create: [
          {
            productId: products[0].id, // iPhone 15 Pro
            quantity: 1,
            price: 134900,
          },
          {
            productId: products[2].id, // Sony Headphones
            quantity: 1,
            price: 29990,
          },
        ],
      },
    },
    include: {
      orderItems: true,
    },
  });

  const order2 = await prisma.order.create({
    data: {
      customerId: customer2.id,
      totalAmount: 11998,
      status: 'DELIVERED',
      orderItems: {
        create: [
          {
            productId: products[3].id, // Designer Kurti Set
            quantity: 4,
            price: 2999,
          },
        ],
      },
    },
    include: {
      orderItems: true,
    },
  });

  console.log('✅ Created orders:', order1.id, order2.id);

  // Create sample payments
  await prisma.payment.create({
    data: {
      orderId: order1.id,
      amount: 164890,
      status: 'COMPLETED',
      paymentMethod: 'UPI',
      transactionId: 'TXN001234567890',
    },
  });

  await prisma.payment.create({
    data: {
      orderId: order2.id,
      amount: 11998,
      status: 'COMPLETED',
      paymentMethod: 'Card',
      transactionId: 'TXN001234567891',
    },
  });

  console.log('✅ Created payments');

  // Create system metadata
  await prisma.systemMetadata.createMany({
    data: [
      {
        key: 'app_version',
        value: '1.0.0',
      },
      {
        key: 'maintenance_mode',
        value: 'false',
      },
      {
        key: 'supported_languages',
        value: 'en,hi,ta,te,mr,gu,bn',
      },
      {
        key: 'payment_methods',
        value: 'UPI,Card,NetBanking,Wallet',
      },
    ],
  });

  console.log('✅ Created system metadata');

  // Create sample tasks
  await prisma.task.createMany({
    data: [
      {
        title: 'Setup user authentication',
        description: 'Implement JWT-based authentication system',
        status: 'COMPLETED',
        priority: 'high',
      },
      {
        title: 'Create product catalog API',
        description: 'Build REST API for product management',
        status: 'IN_PROGRESS',
        priority: 'high',
      },
      {
        title: 'Implement payment gateway',
        description: 'Integrate UPI and card payment methods',
        status: 'PENDING',
        priority: 'medium',
      },
      {
        title: 'Setup notification system',
        description: 'Configure WhatsApp and SMS notifications',
        status: 'PENDING',
        priority: 'low',
      },
    ],
  });

  console.log('✅ Created sample tasks');

  console.log('🎉 Database seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });