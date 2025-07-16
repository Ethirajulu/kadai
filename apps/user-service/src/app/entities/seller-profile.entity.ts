import { SellerProfile as PrismaSellerProfile } from '@prisma/client';

export class SellerProfileEntity implements PrismaSellerProfile {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  description: string | null;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;

  constructor(partial: Partial<SellerProfileEntity>) {
    Object.assign(this, partial);
  }

  // Business logic methods
  canSellProducts(): boolean {
    return this.isVerified;
  }

  getBusinessInfo(): BusinessInfo {
    return {
      name: this.businessName,
      type: this.businessType,
      description: this.description,
      isVerified: this.isVerified,
    };
  }
}

export interface BusinessInfo {
  name: string;
  type: string;
  description: string | null;
  isVerified: boolean;
}

export interface SellerProfileWithUser extends SellerProfileEntity {
  user: {
    id: string;
    email: string;
    name: string;
    phone: string | null;
    address: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}