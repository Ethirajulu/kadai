import { User as PrismaUser } from '@prisma/client';
import { UserRole, UserStatus } from '@kadai/auth-service';

export class UserEntity implements PrismaUser {
  id: string;
  email: string;
  phone: string | null;
  password: string;
  name: string;
  address: string | null;
  businessDetails: any; // JSON field from Prisma
  isActive: boolean;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Additional properties for business logic
  role?: UserRole; // Legacy field for backward compatibility
  status?: UserStatus;
  emailVerified?: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLogin?: Date;

  constructor(partial: Partial<UserEntity>) {
    Object.assign(this, partial);
  }

  // Business logic methods
  isCustomer(): boolean {
    return this.role === UserRole.CUSTOMER;
  }

  isSeller(): boolean {
    return this.role === UserRole.SELLER;
  }

  isAdmin(): boolean {
    return this.role === UserRole.ADMIN;
  }

  canLogin(): boolean {
    return this.isActive && !this.isDeleted && this.status === UserStatus.ACTIVE;
  }

  needsEmailVerification(): boolean {
    return !this.emailVerified && this.status === UserStatus.PENDING_VERIFICATION;
  }

  toPublicProfile(): PublicUserProfile {
    return {
      id: this.id,
      email: this.email,
      name: this.name,
      phone: this.phone,
      address: this.address,
      role: this.role,
      status: this.status,
      emailVerified: this.emailVerified,
      lastLogin: this.lastLogin,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
    };
  }
}

export interface PublicUserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role?: UserRole;
  status?: UserStatus;
  emailVerified?: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
}