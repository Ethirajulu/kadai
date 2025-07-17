export * from './database-config.module';
export * from './mongodb/config';
export * from './postgresql/config';
export * from './redis/config';
export * from './qdrant/config';
export * from './health-check.service';
export * from './database-manager.service';
export * from './factories';
export * from './monitoring';
export * from './utils';
export * from './constants';
export * from './validators';
export * from './config';
// Temporarily commenting out schemas export until decorator issues are resolved
// export * from './mongodb/schemas';

// Export PrismaClient for RBAC usage
export { PrismaClient } from './postgresql/generated/prisma';
export type { UserSession } from './postgresql/generated/prisma';
