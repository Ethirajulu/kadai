// Re-export PrismaClient and types from generated client
export { PrismaClient } from './postgresql/generated/prisma';
export type { 
  User,
  UserSession,
  Role,
  Permission,
  UserRole,
  RolePermission,
  Prisma 
} from './postgresql/generated/prisma';