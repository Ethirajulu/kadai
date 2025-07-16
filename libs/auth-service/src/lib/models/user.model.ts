export enum UserRole {
  ADMIN = 'admin',
  SELLER = 'seller',
  CUSTOMER = 'customer',
}

export interface RbacRole {
  id: string;
  name: string;
  description: string;
  permissions: RbacPermission[];
}

export interface RbacPermission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
}

export enum UserStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  PENDING_VERIFICATION = 'pending_verification',
}

export interface User {
  id: string;
  email: string;
  password: string;
  name: string;
  phone?: string;
  address?: string;
  role: UserRole; // Legacy field for backward compatibility
  status: UserStatus;
  businessDetails?: BusinessDetails;
  emailVerified: boolean;
  emailVerificationToken?: string;
  passwordResetToken?: string;
  passwordResetExpires?: Date;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  roles?: RbacRole[]; // New RBAC roles
}

export interface BusinessDetails {
  businessName: string;
  businessType: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  taxId?: string;
  registrationNumber?: string;
  verificationStatus: 'pending' | 'verified' | 'rejected';
  verificationDocuments?: string[];
}

export interface UserSession {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  device: string;
  ipAddress: string;
  userAgent: string;
  expiresAt: Date;
  createdAt: Date;
  isActive: boolean;
}

export interface Permission {
  id: string;
  name: string;
  resource: string;
  action: string;
  description: string;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  phone?: string;
  address?: string;
  role: UserRole; // Legacy field for backward compatibility
  status: UserStatus;
  businessDetails?: BusinessDetails;
  emailVerified: boolean;
  lastLogin?: Date;
  createdAt: Date;
  updatedAt: Date;
  roles?: RbacRole[]; // New RBAC roles
}