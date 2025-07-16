import { Injectable } from '@nestjs/common';
import { PrismaService } from '@kadai/database-config';
import { UserEntity } from '../entities/user.entity';
import { CreateUserDto, UpdateUserDto, UserQueryDto } from '../dto/user.dto';
import { UserRole, UserStatus } from '@kadai/auth-service';
import { Prisma } from '@prisma/client';

@Injectable()
export class UserRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(createUserDto: CreateUserDto): Promise<UserEntity> {
    const userData: Prisma.UserCreateInput = {
      email: createUserDto.email,
      password: createUserDto.password,
      name: createUserDto.name,
      phone: createUserDto.phone,
      address: createUserDto.address,
      businessDetails: createUserDto.businessDetails 
        ? JSON.stringify(createUserDto.businessDetails) 
        : null,
      isActive: true,
      isDeleted: false,
    };

    const user = await this.prisma.user.create({
      data: userData,
    });

    return new UserEntity({
      ...user,
      role: createUserDto.role || UserRole.CUSTOMER,
      status: UserStatus.PENDING_VERIFICATION,
      emailVerified: false,
    });
  }

  async findById(id: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        sellerProfile: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return new UserEntity({
      ...user,
      role: this.getUserRole(user),
      status: this.getUserStatus(user),
      emailVerified: true, // Default for existing users
    });
  }

  async findByEmail(email: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        sellerProfile: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return new UserEntity({
      ...user,
      role: this.getUserRole(user),
      status: this.getUserStatus(user),
      emailVerified: true, // Default for existing users
    });
  }

  async findByPhone(phone: string): Promise<UserEntity | null> {
    const user = await this.prisma.user.findUnique({
      where: { phone },
      include: {
        sellerProfile: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    return new UserEntity({
      ...user,
      role: this.getUserRole(user),
      status: this.getUserStatus(user),
      emailVerified: true, // Default for existing users
    });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserEntity | null> {
    const updateData: Prisma.UserUpdateInput = {
      name: updateUserDto.name,
      phone: updateUserDto.phone,
      address: updateUserDto.address,
      businessDetails: updateUserDto.businessDetails 
        ? JSON.stringify(updateUserDto.businessDetails) 
        : undefined,
    };

    const user = await this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        sellerProfile: true,
        userRoles: {
          include: {
            role: {
              include: {
                rolePermissions: {
                  include: {
                    permission: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    return new UserEntity({
      ...user,
      role: this.getUserRole(user),
      status: this.getUserStatus(user),
      emailVerified: true, // Default for existing users
    });
  }

  async updatePassword(id: string, hashedPassword: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { password: hashedPassword },
    });
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { updatedAt: new Date() }, // Using updatedAt as lastLogin approximation
    });
  }

  async deactivate(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: false },
    });
  }

  async activate(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { isActive: true },
    });
  }

  async softDelete(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });
  }

  async findMany(query: UserQueryDto): Promise<{ users: UserEntity[]; total: number }> {
    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      isDeleted: false,
      ...(query.isActive !== undefined && { isActive: query.isActive }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { email: { contains: query.search, mode: 'insensitive' } },
          { phone: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const orderBy: Prisma.UserOrderByWithRelationInput = {
      [query.sortBy || 'createdAt']: query.sortOrder || 'desc',
    };

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          sellerProfile: true,
          userRoles: {
            include: {
              role: {
                include: {
                  rolePermissions: {
                    include: {
                      permission: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy,
        skip,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ]);

    return {
      users: users.map(user => new UserEntity({
        ...user,
        role: this.getUserRole(user),
        status: this.getUserStatus(user),
        emailVerified: true, // Default for existing users
      })),
      total,
    };
  }

  async getUserStats() {
    const [total, active, inactive, withSellerProfile] = await Promise.all([
      this.prisma.user.count({ where: { isDeleted: false } }),
      this.prisma.user.count({ where: { isDeleted: false, isActive: true } }),
      this.prisma.user.count({ where: { isDeleted: false, isActive: false } }),
      this.prisma.user.count({ 
        where: { 
          isDeleted: false, 
          sellerProfile: { isNot: null } 
        } 
      }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisWeek = new Date();
    thisWeek.setDate(thisWeek.getDate() - 7);
    thisWeek.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [todayCount, weekCount, monthCount] = await Promise.all([
      this.prisma.user.count({ where: { createdAt: { gte: today } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thisWeek } } }),
      this.prisma.user.count({ where: { createdAt: { gte: thisMonth } } }),
    ]);

    return {
      totalUsers: total,
      activeUsers: active,
      inactiveUsers: inactive,
      pendingVerification: 0, // To be implemented with proper verification status
      usersByRole: {
        [UserRole.CUSTOMER]: total - withSellerProfile,
        [UserRole.SELLER]: withSellerProfile,
        [UserRole.ADMIN]: 0, // To be implemented with proper role tracking
      },
      recentRegistrations: {
        today: todayCount,
        thisWeek: weekCount,
        thisMonth: monthCount,
      },
    };
  }

  private getUserRole(user: any): UserRole {
    if (user.sellerProfile) {
      return UserRole.SELLER;
    }
    // Default to customer for now
    return UserRole.CUSTOMER;
  }

  private getUserStatus(user: any): UserStatus {
    if (!user.isActive) {
      return UserStatus.INACTIVE;
    }
    return UserStatus.ACTIVE;
  }
}