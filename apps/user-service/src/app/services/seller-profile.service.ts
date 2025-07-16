import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { SellerProfileRepository } from '../repositories/seller-profile.repository';
import { UserRepository } from '../repositories/user.repository';
import { SellerProfileEntity } from '../entities/seller-profile.entity';
import {
  CreateSellerProfileDto,
  UpdateSellerProfileDto,
  VerifySellerDto,
  SellerProfileResponseDto,
  SellerProfileWithUserDto,
  SellerQueryDto,
  SellerListResponseDto,
  SellerStatsDto,
} from '../dto/seller-profile.dto';

@Injectable()
export class SellerProfileService {
  constructor(
    private readonly sellerProfileRepository: SellerProfileRepository,
    private readonly userRepository: UserRepository
  ) {}

  async createSellerProfile(
    createSellerProfileDto: CreateSellerProfileDto
  ): Promise<SellerProfileResponseDto> {
    // Check if user exists
    const user = await this.userRepository.findById(
      createSellerProfileDto.userId
    );
    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if seller profile already exists for this user
    const existingProfile = await this.sellerProfileRepository.findByUserId(
      createSellerProfileDto.userId
    );
    if (existingProfile) {
      throw new ConflictException(
        'Seller profile already exists for this user'
      );
    }

    const sellerProfile = await this.sellerProfileRepository.create(
      createSellerProfileDto
    );
    return this.mapToResponseDto(sellerProfile);
  }

  async getSellerProfileById(id: string): Promise<SellerProfileWithUserDto> {
    const sellerProfile = await this.sellerProfileRepository.findByIdWithUser(
      id
    );
    if (!sellerProfile) {
      throw new NotFoundException('Seller profile not found');
    }

    return this.mapToWithUserDto(sellerProfile);
  }

  async getSellerProfileByUserId(
    userId: string
  ): Promise<SellerProfileWithUserDto> {
    const sellerProfile =
      await this.sellerProfileRepository.findByUserIdWithUser(userId);
    if (!sellerProfile) {
      throw new NotFoundException('Seller profile not found');
    }

    return this.mapToWithUserDto(sellerProfile);
  }

  async updateSellerProfile(
    id: string,
    updateSellerProfileDto: UpdateSellerProfileDto
  ): Promise<SellerProfileResponseDto> {
    const existingProfile = await this.sellerProfileRepository.findById(id);
    if (!existingProfile) {
      throw new NotFoundException('Seller profile not found');
    }

    const updatedProfile = await this.sellerProfileRepository.update(
      id,
      updateSellerProfileDto
    );
    if (!updatedProfile) {
      throw new NotFoundException('Seller profile not found');
    }

    return this.mapToResponseDto(updatedProfile);
  }

  async verifySeller(verifySellerDto: VerifySellerDto): Promise<void> {
    const sellerProfile = await this.sellerProfileRepository.findById(
      verifySellerDto.sellerId
    );
    if (!sellerProfile) {
      throw new NotFoundException('Seller profile not found');
    }

    await this.sellerProfileRepository.updateVerificationStatus(
      verifySellerDto.sellerId,
      verifySellerDto.isVerified
    );
  }

  async deleteSellerProfile(id: string): Promise<void> {
    const sellerProfile = await this.sellerProfileRepository.findById(id);
    if (!sellerProfile) {
      throw new NotFoundException('Seller profile not found');
    }

    await this.sellerProfileRepository.delete(id);
  }

  async getSellerProfiles(
    query: SellerQueryDto
  ): Promise<SellerListResponseDto> {
    const { sellerProfiles, total } =
      await this.sellerProfileRepository.findMany(query);

    const page = parseInt(query.page || '1');
    const limit = parseInt(query.limit || '10');
    const totalPages = Math.ceil(total / limit);

    return {
      sellers: sellerProfiles.map((profile) => this.mapToWithUserDto(profile)),
      total,
      page,
      limit,
      totalPages,
    };
  }

  async getVerifiedSellers(
    query: SellerQueryDto
  ): Promise<SellerListResponseDto> {
    const verifiedQuery = { ...query, isVerified: true };
    return await this.getSellerProfiles(verifiedQuery);
  }

  async getPendingVerificationSellers(
    query: SellerQueryDto
  ): Promise<SellerListResponseDto> {
    const pendingQuery = { ...query, isVerified: false };
    return await this.getSellerProfiles(pendingQuery);
  }

  async getSellerStats(): Promise<SellerStatsDto> {
    return await this.sellerProfileRepository.getSellerStats();
  }

  private mapToResponseDto(
    sellerProfile: SellerProfileEntity
  ): SellerProfileResponseDto {
    return {
      id: sellerProfile.id,
      userId: sellerProfile.userId,
      businessName: sellerProfile.businessName,
      businessType: sellerProfile.businessType,
      description: sellerProfile.description || '',
      isVerified: sellerProfile.isVerified,
      createdAt: sellerProfile.createdAt,
      updatedAt: sellerProfile.updatedAt,
    };
  }

  private mapToWithUserDto(sellerProfile: any): SellerProfileWithUserDto {
    return {
      id: sellerProfile.id,
      userId: sellerProfile.userId,
      businessName: sellerProfile.businessName,
      businessType: sellerProfile.businessType,
      description: sellerProfile.description,
      isVerified: sellerProfile.isVerified,
      createdAt: sellerProfile.createdAt,
      updatedAt: sellerProfile.updatedAt,
      user: {
        id: sellerProfile.user.id,
        email: sellerProfile.user.email,
        name: sellerProfile.user.name,
        phone: sellerProfile.user.phone,
        address: sellerProfile.user.address,
        isActive: sellerProfile.user.isActive,
        createdAt: sellerProfile.user.createdAt,
        updatedAt: sellerProfile.user.updatedAt,
      },
    };
  }
}
