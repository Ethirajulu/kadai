import { IsString, IsOptional, IsBoolean, IsUUID, MinLength, MaxLength } from 'class-validator';

export class CreateSellerProfileDto {
  @IsUUID()
  userId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessType: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class UpdateSellerProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  businessName?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  businessType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class VerifySellerDto {
  @IsUUID()
  sellerId: string;

  @IsBoolean()
  isVerified: boolean;

  @IsOptional()
  @IsString()
  verificationNote?: string;
}

export class SellerProfileResponseDto {
  id: string;
  userId: string;
  businessName: string;
  businessType: string;
  description?: string;
  isVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class SellerProfileWithUserDto extends SellerProfileResponseDto {
  user: {
    id: string;
    email: string;
    name: string;
    phone?: string;
    address?: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
}

export class SellerQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @IsString()
  businessType?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;

  @IsOptional()
  @IsString()
  sortBy?: 'createdAt' | 'updatedAt' | 'businessName';

  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class SellerListResponseDto {
  sellers: SellerProfileWithUserDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export class SellerStatsDto {
  totalSellers: number;
  verifiedSellers: number;
  pendingVerification: number;
  sellersByBusinessType: Record<string, number>;
  recentRegistrations: {
    today: number;
    thisWeek: number;
    thisMonth: number;
  };
}