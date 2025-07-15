export const AUTH_CONSTANTS = {
  // Token expiration times
  ACCESS_TOKEN_EXPIRATION: '15m',
  REFRESH_TOKEN_EXPIRATION: '7d',
  EMAIL_VERIFICATION_EXPIRATION: '24h',
  PASSWORD_RESET_EXPIRATION: '1h',

  // Password configuration
  PASSWORD_MIN_LENGTH: 8,
  PASSWORD_MAX_LENGTH: 128,
  PASSWORD_SALT_ROUNDS: 12,
  PASSWORD_HISTORY_LIMIT: 5,

  // Rate limiting
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_DURATION: '15m',
  RATE_LIMIT_WINDOW: '15m',
  RATE_LIMIT_MAX_REQUESTS: 10,

  // JWT configuration
  JWT_ISSUER: 'kadai-platform',
  JWT_AUDIENCE: 'kadai-users',

  // Session configuration
  MAX_SESSIONS_PER_USER: 5,
  SESSION_CLEANUP_INTERVAL: '1h',

  // Email configuration
  EMAIL_VERIFICATION_REQUIRED: true,
  SEND_WELCOME_EMAIL: true,

  // Redis keys
  REDIS_KEYS: {
    BLACKLISTED_TOKENS: 'auth:blacklisted:',
    PASSWORD_RESET_TOKENS: 'auth:reset:',
    EMAIL_VERIFICATION_TOKENS: 'auth:verify:',
    LOGIN_ATTEMPTS: 'auth:attempts:',
    USER_SESSIONS: 'auth:sessions:',
  },

  // Default roles
  DEFAULT_ROLES: {
    ADMIN: 'admin',
    SELLER: 'seller',
    CUSTOMER: 'customer',
  },

  // Permissions
  PERMISSIONS: {
    // User permissions
    USER_READ: 'user:read',
    USER_WRITE: 'user:write',
    USER_DELETE: 'user:delete',
    USER_ADMIN: 'user:admin',

    // Product permissions
    PRODUCT_READ: 'product:read',
    PRODUCT_WRITE: 'product:write',
    PRODUCT_DELETE: 'product:delete',
    PRODUCT_ADMIN: 'product:admin',

    // Order permissions
    ORDER_READ: 'order:read',
    ORDER_WRITE: 'order:write',
    ORDER_DELETE: 'order:delete',
    ORDER_ADMIN: 'order:admin',

    // Admin permissions
    ADMIN_ALL: 'admin:all',
    ADMIN_USERS: 'admin:users',
    ADMIN_PRODUCTS: 'admin:products',
    ADMIN_ORDERS: 'admin:orders',
    ADMIN_ANALYTICS: 'admin:analytics',
  },

  // Role hierarchies
  ROLE_HIERARCHY: {
    admin: ['seller', 'customer'] as string[],
    seller: ['customer'] as string[],
    customer: [] as string[],
  },

  // Default permissions by role
  ROLE_PERMISSIONS: {
    admin: [
      'admin:all',
      'user:admin',
      'product:admin',
      'order:admin',
      'admin:users',
      'admin:products',
      'admin:orders',
      'admin:analytics',
    ] as string[],
    seller: [
      'user:read',
      'user:write',
      'product:read',
      'product:write',
      'product:delete',
      'order:read',
      'order:write',
    ] as string[],
    customer: [
      'user:read',
      'user:write',
      'product:read',
      'order:read',
      'order:write',
    ] as string[],
  },

  // Error messages
  ERRORS: {
    INVALID_CREDENTIALS: 'Invalid email or password',
    USER_NOT_FOUND: 'User not found',
    USER_ALREADY_EXISTS: 'User with this email already exists',
    EMAIL_NOT_VERIFIED: 'Email address not verified',
    ACCOUNT_LOCKED: 'Account temporarily locked due to too many failed attempts',
    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_INVALID: 'Invalid token',
    TOKEN_BLACKLISTED: 'Token has been revoked',
    PASSWORD_TOO_WEAK: 'Password does not meet security requirements',
    PASSWORD_REUSED: 'Password was recently used',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
    SESSION_EXPIRED: 'Session has expired',
    DEVICE_NOT_RECOGNIZED: 'Device not recognized',
    EMAIL_SEND_FAILED: 'Failed to send email',
    VERIFICATION_FAILED: 'Email verification failed',
    PASSWORD_RESET_FAILED: 'Password reset failed',
  },

  // Success messages
  SUCCESS: {
    USER_REGISTERED: 'User registered successfully',
    USER_LOGGED_IN: 'User logged in successfully',
    USER_LOGGED_OUT: 'User logged out successfully',
    PASSWORD_CHANGED: 'Password changed successfully',
    PASSWORD_RESET_SENT: 'Password reset email sent',
    PASSWORD_RESET_SUCCESS: 'Password reset successfully',
    EMAIL_VERIFIED: 'Email verified successfully',
    VERIFICATION_SENT: 'Verification email sent',
    PROFILE_UPDATED: 'Profile updated successfully',
  },
} as const;

export const getRedisKey = (prefix: string, identifier: string): string => {
  return `${prefix}${identifier}`;
};

export const isValidRole = (role: string): boolean => {
  return Object.values(AUTH_CONSTANTS.DEFAULT_ROLES).includes(role as any);
};

export const hasRolePermission = (userRole: string, requiredPermission: string): boolean => {
  const rolePermissions = AUTH_CONSTANTS.ROLE_PERMISSIONS[userRole as keyof typeof AUTH_CONSTANTS.ROLE_PERMISSIONS];
  return rolePermissions?.includes(requiredPermission) || false;
};

export const canAccessRole = (userRole: string, targetRole: string): boolean => {
  const hierarchy = AUTH_CONSTANTS.ROLE_HIERARCHY[userRole as keyof typeof AUTH_CONSTANTS.ROLE_HIERARCHY];
  return hierarchy?.includes(targetRole) || userRole === targetRole;
};