import { z } from 'zod';
import { UserRole, OrderStatus, PaymentStatus, TaskStatus, Platform } from './shared-types.js';

// ============================
// CORE VALIDATION SCHEMAS
// ============================

export const userRoleSchema = z.nativeEnum(UserRole);
export const orderStatusSchema = z.nativeEnum(OrderStatus);
export const paymentStatusSchema = z.nativeEnum(PaymentStatus);
export const taskStatusSchema = z.nativeEnum(TaskStatus);
export const platformSchema = z.nativeEnum(Platform);

// ============================
// USER VALIDATION SCHEMAS
// ============================

export const userSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  role: userRoleSchema,
  isActive: z.boolean(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createUserSchema = z.object({
  email: z.string().email(),
  phoneNumber: z.string().optional(),
  firstName: z.string().min(1, 'First name is required').optional(),
  lastName: z.string().min(1, 'Last name is required').optional(),
  role: userRoleSchema.default(UserRole.CUSTOMER),
  isActive: z.boolean().default(true),
  emailVerified: z.boolean().default(false),
  phoneVerified: z.boolean().default(false),
});

export const updateUserSchema = createUserSchema.partial();

export const userFiltersSchema = z.object({
  role: userRoleSchema.optional(),
  isActive: z.boolean().optional(),
  emailVerified: z.boolean().optional(),
  phoneVerified: z.boolean().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
});

// ============================
// SELLER PROFILE VALIDATION SCHEMAS
// ============================

export const sellerProfileSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  businessName: z.string().min(1, 'Business name is required'),
  businessType: z.string().min(1, 'Business type is required'),
  gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format').optional(),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  businessEmail: z.string().email().optional(),
  isVerified: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createSellerProfileSchema = z.object({
  userId: z.string().uuid(),
  businessName: z.string().min(1, 'Business name is required'),
  businessType: z.string().min(1, 'Business type is required'),
  gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format').optional(),
  businessAddress: z.string().optional(),
  businessPhone: z.string().optional(),
  businessEmail: z.string().email().optional(),
  isVerified: z.boolean().default(false),
});

export const updateSellerProfileSchema = createSellerProfileSchema.partial().omit({ userId: true });

// ============================
// PRODUCT VALIDATION SCHEMAS
// ============================

export const productSchema = z.object({
  id: z.string().uuid(),
  sellerId: z.string().uuid(),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().min(1, 'Product description is required'),
  price: z.number().positive('Price must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters'),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative'),
  sku: z.string().optional(),
  category: z.string().optional(),
  images: z.array(z.string().url()).optional(),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createProductSchema = z.object({
  sellerId: z.string().uuid(),
  name: z.string().min(1, 'Product name is required'),
  description: z.string().min(1, 'Product description is required'),
  price: z.number().positive('Price must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('INR'),
  stockQuantity: z.number().int().min(0, 'Stock quantity must be non-negative'),
  sku: z.string().optional(),
  category: z.string().optional(),
  images: z.array(z.string().url()).optional(),
  isActive: z.boolean().default(true),
});

export const updateProductSchema = createProductSchema.partial().omit({ sellerId: true });

export const productFiltersSchema = z.object({
  sellerId: z.string().uuid().optional(),
  category: z.string().optional(),
  minPrice: z.number().positive().optional(),
  maxPrice: z.number().positive().optional(),
  isActive: z.boolean().optional(),
  inStock: z.boolean().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
});

// ============================
// ORDER VALIDATION SCHEMAS
// ============================

export const orderItemSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.number().int().positive('Quantity must be positive'),
  pricePerUnit: z.number().positive('Price per unit must be positive'),
  totalPrice: z.number().positive('Total price must be positive'),
  createdAt: z.date(),
});

export const createOrderItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().positive('Quantity must be positive'),
  pricePerUnit: z.number().positive('Price per unit must be positive'),
  totalPrice: z.number().positive('Total price must be positive'),
});

export const orderSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  sellerId: z.string().uuid(),
  orderNumber: z.string().min(1, 'Order number is required'),
  status: orderStatusSchema,
  totalAmount: z.number().positive('Total amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters'),
  shippingAddress: z.string().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createOrderSchema = z.object({
  userId: z.string().uuid(),
  sellerId: z.string().uuid(),
  status: orderStatusSchema.default(OrderStatus.PENDING),
  totalAmount: z.number().positive('Total amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('INR'),
  shippingAddress: z.string().optional(),
  billingAddress: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(createOrderItemSchema).min(1, 'At least one item is required'),
});

export const updateOrderSchema = createOrderSchema.partial().omit({ userId: true, sellerId: true, items: true });

export const orderFiltersSchema = z.object({
  userId: z.string().uuid().optional(),
  sellerId: z.string().uuid().optional(),
  status: orderStatusSchema.optional(),
  minAmount: z.number().positive().optional(),
  maxAmount: z.number().positive().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
});

// ============================
// PAYMENT VALIDATION SCHEMAS
// ============================

export const paymentSchema = z.object({
  id: z.string().uuid(),
  orderId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters'),
  status: paymentStatusSchema,
  paymentMethod: z.string().optional(),
  transactionId: z.string().optional(),
  gatewayResponse: z.string().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const createPaymentSchema = z.object({
  orderId: z.string().uuid(),
  amount: z.number().positive('Amount must be positive'),
  currency: z.string().length(3, 'Currency must be 3 characters').default('INR'),
  status: paymentStatusSchema.default(PaymentStatus.PENDING),
  paymentMethod: z.string().optional(),
  transactionId: z.string().optional(),
  gatewayResponse: z.string().optional(),
});

export const updatePaymentSchema = createPaymentSchema.partial().omit({ orderId: true });

// ============================
// MESSAGE VALIDATION SCHEMAS
// ============================

export const messageSchema = z.object({
  _id: z.string(),
  sessionId: z.string(),
  userId: z.string().uuid().optional(),
  content: z.string().min(1, 'Message content is required'),
  messageType: z.enum(['text', 'image', 'audio', 'video', 'document']),
  platform: platformSchema,
  platformMessageId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isFromUser: z.boolean(),
  timestamp: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date().optional(),
});

export const createMessageSchema = z.object({
  sessionId: z.string(),
  userId: z.string().uuid().optional(),
  content: z.string().min(1, 'Message content is required'),
  messageType: z.enum(['text', 'image', 'audio', 'video', 'document']).default('text'),
  platform: platformSchema,
  platformMessageId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  isFromUser: z.boolean(),
  timestamp: z.date().default(() => new Date()),
});

export const updateMessageSchema = createMessageSchema.partial().omit({ sessionId: true });

export const messageFiltersSchema = z.object({
  sessionId: z.string().optional(),
  userId: z.string().uuid().optional(),
  platform: platformSchema.optional(),
  messageType: z.string().optional(),
  isFromUser: z.boolean().optional(),
  createdAfter: z.date().optional(),
  createdBefore: z.date().optional(),
});

// ============================
// CHAT SESSION VALIDATION SCHEMAS
// ============================

export const chatSessionSchema = z.object({
  _id: z.string(),
  userId: z.string().uuid().optional(),
  platform: platformSchema,
  platformUserId: z.string().min(1, 'Platform user ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  isActive: z.boolean(),
  language: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  lastActivity: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
  expiresAt: z.date().optional(),
});

export const createChatSessionSchema = z.object({
  userId: z.string().uuid().optional(),
  platform: platformSchema,
  platformUserId: z.string().min(1, 'Platform user ID is required'),
  sessionToken: z.string().min(1, 'Session token is required'),
  isActive: z.boolean().default(true),
  language: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  lastActivity: z.date().default(() => new Date()),
});

export const updateChatSessionSchema = createChatSessionSchema.partial().omit({ platform: true, platformUserId: true });

// ============================
// VECTOR VALIDATION SCHEMAS
// ============================

export const vectorPointSchema = z.object({
  id: z.string().min(1, 'Vector point ID is required'),
  vector: z.array(z.number()).min(1, 'Vector must have at least one dimension'),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const vectorSearchOptionsSchema = z.object({
  vector: z.array(z.number()).min(1, 'Search vector must have at least one dimension'),
  limit: z.number().int().positive().max(1000).default(10),
  threshold: z.number().min(0).max(1).optional(),
  filter: z.record(z.string(), z.unknown()).optional(),
  withPayload: z.boolean().default(true),
  withVector: z.boolean().default(false),
});

export const productEmbeddingSchema = z.object({
  id: z.string().min(1, 'Embedding ID is required'),
  productId: z.string().uuid(),
  sellerId: z.string().uuid(),
  vector: z.array(z.number()).length(1536, 'Product embeddings must be 1536 dimensions'),
  payload: z.object({
    name: z.string().min(1, 'Product name is required'),
    description: z.string().min(1, 'Product description is required'),
    category: z.string().min(1, 'Product category is required'),
    price: z.number().positive('Price must be positive'),
    currency: z.string().length(3, 'Currency must be 3 characters'),
    tags: z.array(z.string()).optional(),
    createdAt: z.string().datetime(),
  }),
});

export const imageEmbeddingSchema = z.object({
  id: z.string().min(1, 'Embedding ID is required'),
  imageId: z.string().min(1, 'Image ID is required'),
  productId: z.string().uuid().optional(),
  vector: z.array(z.number()).length(512, 'Image embeddings must be 512 dimensions'),
  payload: z.object({
    imageUrl: z.string().url('Invalid image URL'),
    description: z.string().optional(),
    tags: z.array(z.string()).optional(),
    createdAt: z.string().datetime(),
  }),
});

// ============================
// PAGINATION AND SEARCH SCHEMAS
// ============================

export const paginationOptionsSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export const searchOptionsSchema = z.object({
  limit: z.number().int().positive().max(100).default(10),
  offset: z.number().int().min(0).default(0),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  fields: z.array(z.string()).optional(),
  highlight: z.boolean().default(false),
});

// ============================
// API RESPONSE SCHEMAS
// ============================

export const apiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.date(),
});

export const errorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string().min(1, 'Error message is required'),
  message: z.string().min(1, 'Error message is required'),
  statusCode: z.number().int().positive(),
  timestamp: z.date(),
});

export const paginatedResponseSchema = <T>(dataSchema: z.ZodSchema<T>) => z.object({
  data: z.array(dataSchema),
  pagination: z.object({
    page: z.number().int().positive(),
    limit: z.number().int().positive(),
    total: z.number().int().min(0),
    totalPages: z.number().int().min(0),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

// ============================
// HEALTH CHECK SCHEMAS
// ============================

export const healthCheckResultSchema = z.object({
  status: z.enum(['healthy', 'unhealthy', 'degraded']),
  service: z.string().min(1, 'Service name is required'),
  timestamp: z.date(),
  details: z.record(z.string(), z.unknown()).optional(),
  responseTime: z.number().positive().optional(),
});

// ============================
// VALIDATION HELPER FUNCTIONS
// ============================

export const validateEmail = (email: string): boolean => {
  return z.string().email().safeParse(email).success;
};

export const validateUUID = (uuid: string): boolean => {
  return z.string().uuid().safeParse(uuid).success;
};

export const validatePhoneNumber = (phoneNumber: string): boolean => {
  // Indian phone number validation
  const indianPhoneRegex = /^(\+91|91|0)?[6789]\d{9}$/;
  return indianPhoneRegex.test(phoneNumber);
};

export const validateGST = (gstNumber: string): boolean => {
  const gstRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return gstRegex.test(gstNumber);
};

export const validateCurrency = (currency: string): boolean => {
  const supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
  return supportedCurrencies.includes(currency);
};

export const validateImageUrl = (url: string): boolean => {
  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  try {
    const parsedUrl = new URL(url);
    const extension = parsedUrl.pathname.split('.').pop()?.toLowerCase();
    return imageExtensions.includes(extension || '');
  } catch {
    return false;
  }
};

// ============================
// SCHEMA REFINEMENTS
// ============================

export const createOrderWithValidationSchema = createOrderSchema.refine(
  (data) => {
    const itemsTotal = data.items.reduce((sum, item) => sum + item.totalPrice, 0);
    return Math.abs(itemsTotal - data.totalAmount) < 0.01; // Allow for small floating point differences
  },
  {
    message: 'Total amount must equal the sum of all item totals',
    path: ['totalAmount'],
  }
);

export const createProductWithValidationSchema = createProductSchema.refine(
  (data) => {
    if (data.sku) {
      return data.sku.length >= 3 && data.sku.length <= 50;
    }
    return true;
  },
  {
    message: 'SKU must be between 3 and 50 characters',
    path: ['sku'],
  }
);

export const userUpdateWithValidationSchema = updateUserSchema.refine(
  (data) => {
    if (data.phoneNumber) {
      return validatePhoneNumber(data.phoneNumber);
    }
    return true;
  },
  {
    message: 'Invalid phone number format',
    path: ['phoneNumber'],
  }
);

// ============================
// EXPORT VALIDATION FUNCTIONS
// ============================

export const validateUser = (data: unknown) => userSchema.parse(data);
export const validateCreateUser = (data: unknown) => createUserSchema.parse(data);
export const validateUpdateUser = (data: unknown) => updateUserSchema.parse(data);
export const validateProduct = (data: unknown) => productSchema.parse(data);
export const validateCreateProduct = (data: unknown) => createProductSchema.parse(data);
export const validateUpdateProduct = (data: unknown) => updateProductSchema.parse(data);
export const validateOrder = (data: unknown) => orderSchema.parse(data);
export const validateCreateOrder = (data: unknown) => createOrderWithValidationSchema.parse(data);
export const validateUpdateOrder = (data: unknown) => updateOrderSchema.parse(data);
export const validateMessage = (data: unknown) => messageSchema.parse(data);
export const validateCreateMessage = (data: unknown) => createMessageSchema.parse(data);
export const validateUpdateMessage = (data: unknown) => updateMessageSchema.parse(data);
export const validateChatSession = (data: unknown) => chatSessionSchema.parse(data);
export const validateCreateChatSession = (data: unknown) => createChatSessionSchema.parse(data);
export const validateUpdateChatSession = (data: unknown) => updateChatSessionSchema.parse(data);
export const validateVectorPoint = (data: unknown) => vectorPointSchema.parse(data);
export const validateVectorSearchOptions = (data: unknown) => vectorSearchOptionsSchema.parse(data);
export const validatePaginationOptions = (data: unknown) => paginationOptionsSchema.parse(data);
export const validateSearchOptions = (data: unknown) => searchOptionsSchema.parse(data);
export const validateApiResponse = (data: unknown) => apiResponseSchema.parse(data);
export const validateErrorResponse = (data: unknown) => errorResponseSchema.parse(data);
export const validateHealthCheckResult = (data: unknown) => healthCheckResultSchema.parse(data);