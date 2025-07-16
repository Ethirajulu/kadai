import { PrismaClient } from './generated/prisma';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create RBAC roles first
  const adminRole = await prisma.role.upsert({
    where: { name: 'ADMIN' },
    update: {},
    create: {
      name: 'ADMIN',
      description: 'System administrator with full access',
    },
  });

  const sellerRole = await prisma.role.upsert({
    where: { name: 'SELLER' },
    update: {},
    create: {
      name: 'SELLER',
      description: 'Seller with product and order management access',
    },
  });

  const customerRole = await prisma.role.upsert({
    where: { name: 'CUSTOMER' },
    update: {},
    create: {
      name: 'CUSTOMER',
      description: 'Customer with order and profile access',
    },
  });

  console.log('✅ Created/Updated RBAC roles');

  // Create permissions
  const permissions = await Promise.all([
    prisma.permission.upsert({
      where: { name: 'user:read' },
      update: {},
      create: {
        name: 'user:read',
        description: 'Read user information',
        resource: 'user',
        action: 'read',
      },
    }),
    prisma.permission.upsert({
      where: { name: 'user:write' },
      update: {},
      create: {
        name: 'user:write',
        description: 'Create and update user information',
        resource: 'user',
        action: 'write',
      },
    }),
    prisma.permission.upsert({
      where: { name: 'product:read' },
      update: {},
      create: {
        name: 'product:read',
        description: 'Read product information',
        resource: 'product',
        action: 'read',
      },
    }),
    prisma.permission.upsert({
      where: { name: 'product:write' },
      update: {},
      create: {
        name: 'product:write',
        description: 'Create and update product information',
        resource: 'product',
        action: 'write',
      },
    }),
    prisma.permission.upsert({
      where: { name: 'order:read' },
      update: {},
      create: {
        name: 'order:read',
        description: 'Read order information',
        resource: 'order',
        action: 'read',
      },
    }),
    prisma.permission.upsert({
      where: { name: 'order:write' },
      update: {},
      create: {
        name: 'order:write',
        description: 'Create and update order information',
        resource: 'order',
        action: 'write',
      },
    }),
    prisma.permission.upsert({
      where: { name: 'admin:all' },
      update: {},
      create: {
        name: 'admin:all',
        description: 'Full system administration access',
        resource: 'admin',
        action: 'all',
      },
    }),
  ]);

  console.log('✅ Created/Updated permissions');

  // Assign permissions to roles
  await Promise.all([
    // Admin gets all permissions
    ...permissions.map(permission => 
      prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: adminRole.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      })
    ),
    // Seller gets product and order permissions
    prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: sellerRole.id,
          permissionId: permissions.find(p => p.name === 'product:read')!.id,
        },
      },
      update: {},
      create: {
        roleId: sellerRole.id,
        permissionId: permissions.find(p => p.name === 'product:read')!.id,
      },
    }),
    prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: sellerRole.id,
          permissionId: permissions.find(p => p.name === 'product:write')!.id,
        },
      },
      update: {},
      create: {
        roleId: sellerRole.id,
        permissionId: permissions.find(p => p.name === 'product:write')!.id,
      },
    }),
    prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: sellerRole.id,
          permissionId: permissions.find(p => p.name === 'order:read')!.id,
        },
      },
      update: {},
      create: {
        roleId: sellerRole.id,
        permissionId: permissions.find(p => p.name === 'order:read')!.id,
      },
    }),
    // Customer gets basic read permissions
    prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: customerRole.id,
          permissionId: permissions.find(p => p.name === 'product:read')!.id,
        },
      },
      update: {},
      create: {
        roleId: customerRole.id,
        permissionId: permissions.find(p => p.name === 'product:read')!.id,
      },
    }),
    prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: customerRole.id,
          permissionId: permissions.find(p => p.name === 'order:read')!.id,
        },
      },
      update: {},
      create: {
        roleId: customerRole.id,
        permissionId: permissions.find(p => p.name === 'order:read')!.id,
      },
    }),
  ]);

  console.log('✅ Assigned permissions to roles');

  // Create admin user (upsert to handle existing data)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@kadai.ai' },
    update: {},
    create: {
      email: 'admin@kadai.ai',
      name: 'Admin User',
      password: '$2b$10$1234567890abcdef1234567890abcdef1234567890abcdef12',
      phone: '+919999999999',
    },
  });

  // Assign admin role to admin user
  await prisma.userRole.upsert({
    where: {
      userId_roleId: {
        userId: admin.id,
        roleId: adminRole.id,
      },
    },
    update: {},
    create: {
      userId: admin.id,
      roleId: adminRole.id,
    },
  });

  console.log('✅ Created/Updated admin user:', admin.email);

  // Create sample sellers
  const seller1 = await prisma.user.create({
    data: {
      email: 'seller1@example.com',
      name: 'Raj Electronics',
      password: '$2b$10$1234567890abcdef1234567890abcdef1234567890abcdef12',
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

  // Assign seller role to seller1
  await prisma.userRole.create({
    data: {
      userId: seller1.id,
      roleId: sellerRole.id,
    },
  });

  const seller2 = await prisma.user.create({
    data: {
      email: 'seller2@example.com',
      name: 'Priya Fashion',
      password: '$2b$10$1234567890abcdef1234567890abcdef1234567890abcdef12',
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

  // Assign seller role to seller2
  await prisma.userRole.create({
    data: {
      userId: seller2.id,
      roleId: sellerRole.id,
    },
  });

  console.log('✅ Created sellers:', seller1.email, seller2.email);

  // Create sample customers
  const customer1 = await prisma.user.create({
    data: {
      email: 'customer1@example.com',
      name: 'Amit Kumar',
      password: '$2b$10$1234567890abcdef1234567890abcdef1234567890abcdef12',
      phone: '+919876543212',
    },
  });

  // Assign customer role to customer1
  await prisma.userRole.create({
    data: {
      userId: customer1.id,
      roleId: customerRole.id,
    },
  });

  const customer2 = await prisma.user.create({
    data: {
      email: 'customer2@example.com',
      name: 'Sneha Patel',
      password: '$2b$10$1234567890abcdef1234567890abcdef1234567890abcdef12',
      phone: '+919876543213',
    },
  });

  // Assign customer role to customer2
  await prisma.userRole.create({
    data: {
      userId: customer2.id,
      roleId: customerRole.id,
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
