import { Injectable } from '@nestjs/common';
import { PrismaService } from '@kadai/database-config';
import { SellerProfileEntity } from '../entities/seller-profile.entity';
import { CreateSellerProfileDto, UpdateSellerProfileDto, SellerQueryDto } from '../dto/seller-profile.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class SellerProfileRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(createSellerProfileDto: CreateSellerProfileDto): Promise<SellerProfileEntity> {
    const sellerProfile = await this.prisma.sellerProfile.create({
      data: {
        userId: createSellerProfileDto.userId,
        businessName: createSellerProfileDto.businessName,
        businessType: createSellerProfileDto.businessType,
        description: createSellerProfileDto.description,
        isVerified: false,
      },
    });

    return new SellerProfileEntity(sellerProfile);
  }

  async findById(id: string): Promise<SellerProfileEntity | null> {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { id },
    });

    if (!sellerProfile) return null;

    return new SellerProfileEntity(sellerProfile);
  }

  async findByIdWithUser(id: string): Promise<any | null> {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { id },
      include: {
        user: true,
      },
    });

    if (!sellerProfile) return null;

    return {
      ...sellerProfile,
      user: sellerProfile.user,
    };
  }

  async findByUserId(userId: string): Promise<SellerProfileEntity | null> {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
    });

    if (!sellerProfile) return null;

    return new SellerProfileEntity(sellerProfile);
  }

  async findByUserIdWithUser(userId: string): Promise<any | null> {
    const sellerProfile = await this.prisma.sellerProfile.findUnique({
      where: { userId },
      include: {
        user: true,
      },
    });

    if (!sellerProfile) return null;

    return {
      ...sellerProfile,
      user: sellerProfile.user,
    };
  }

  async update(id: string, updateSellerProfileDto: UpdateSellerProfileDto): Promise<SellerProfileEntity | null> {
    const updateData: Prisma.SellerProfileUpdateInput = {
      businessName: updateSellerProfileDto.businessName,
      businessType: updateSellerProfileDto.businessType,
      description: updateSellerProfileDto.description,
    };

    const sellerProfile = await this.prisma.sellerProfile.update({
      where: { id },
      data: updateData,
    });

    return new SellerProfileEntity(sellerProfile);
  }

  async updateVerificationStatus(id: string, isVerified: boolean): Promise<void> {
    await this.prisma.sellerProfile.update({
      where: { id },
      data: { isVerified },
    });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.sellerProfile.delete({
      where: { id },
    });
  }

  async findMany(query: SellerQueryDto): Promise<{ sellerProfiles: any[]; total: number }> {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const skip = (page - 1) * limit;

    const where: Prisma.SellerProfileWhereInput = {
      ...(query.isVerified !== undefined && { isVerified: query.isVerified }),
      ...(query.businessType && { businessType: query.businessType }),
      ...(query.search && {
        OR: [
          { businessName: { contains: query.search, mode: 'insensitive' } },
          { businessType: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { user: { name: { contains: query.search, mode: 'insensitive' } } },
          { user: { email: { contains: query.search, mode: 'insensitive' } } },
        ],
      }),
    };

    const orderBy: Prisma.SellerProfileOrderByWithRelationInput = {
      [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [sellerProfiles, total] = await Promise.all([
      this.prisma.sellerProfile.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              phone: true,
              address: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.sellerProfile.count({ where }),
    ]);

    return {
      sellerProfiles,
      total,
    };
  }

  async getSellerStats() {
    const [total, verified, pending] = await Promise.all([
      this.prisma.sellerProfile.count(),
      this.prisma.sellerProfile.count({ where: { isVerified: true } }),
      this.prisma.sellerProfile.count({ where: { isVerified: false } }),
    ]);

    // Get business types distribution
    const businessTypes = await this.prisma.sellerProfile.groupBy({
      by: ['businessType'],
      _count: {
        businessType: true,
      },
    });

    const sellersByBusinessType = businessTypes.reduce((acc, item) => {
      acc[item.businessType] = item._count.businessType;
      return acc;
    }, {} as Record<string, number>);

    // Get recent registrations
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    thisWeek.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [todayCount, weekCount, monthCount] = await Promise.all([
      this.prisma.sellerProfile.count({ where: { createdAt: { gte: today } } }),
      this.prisma.sellerProfile.count({ where: { createdAt: { gte: thisWeek } } }),
      this.prisma.sellerProfile.count({ where: { createdAt: { gte: thisMonth } } }),
    ]);

    return {
      totalSellers: total,
      verifiedSellers: verified,
      pendingVerification: pending,
      sellersByBusinessType,
      recentRegistrations: {
        today: todayCount,
        thisWeek: weekCount,
        thisMonth: monthCount,
      },
    };
  }
}