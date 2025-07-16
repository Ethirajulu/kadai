import { 
  Controller, 
  Get, 
  Post, 
  Put, 
  Delete, 
  Body, 
  Param, 
  Query,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { SellerProfileService } from '../services/seller-profile.service';
import { RbacGuard } from '../guards/rbac.guard';
import { 
  RequireAdmin,
  RequireSeller,
  RequireSellerOrAdmin,
  RequireAnyRole,
} from '../decorators/rbac.decorator';
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

@Controller('seller-profiles')
@UseGuards(RbacGuard)
export class SellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireSellerOrAdmin()
  async createSellerProfile(@Body() createSellerProfileDto: CreateSellerProfileDto): Promise<SellerProfileResponseDto> {
    return await this.sellerProfileService.createSellerProfile(createSellerProfileDto);
  }

  @Get()
  @RequireAnyRole()
  async getSellerProfiles(@Query() query: SellerQueryDto): Promise<SellerListResponseDto> {
    return await this.sellerProfileService.getSellerProfiles(query);
  }

  @Get('stats')
  @RequireAdmin()
  async getSellerStats(): Promise<SellerStatsDto> {
    return await this.sellerProfileService.getSellerStats();
  }

  @Get('verified')
  @RequireAnyRole()
  async getVerifiedSellers(@Query() query: SellerQueryDto): Promise<SellerListResponseDto> {
    return await this.sellerProfileService.getVerifiedSellers(query);
  }

  @Get('pending-verification')
  @RequireAdmin()
  async getPendingVerificationSellers(@Query() query: SellerQueryDto): Promise<SellerListResponseDto> {
    return await this.sellerProfileService.getPendingVerificationSellers(query);
  }

  @Get(':id')
  @RequireAnyRole()
  async getSellerProfileById(@Param('id', ParseUUIDPipe) id: string): Promise<SellerProfileWithUserDto> {
    return await this.sellerProfileService.getSellerProfileById(id);
  }

  @Get('user/:userId')
  @RequireSellerOrAdmin()
  async getSellerProfileByUserId(@Param('userId', ParseUUIDPipe) userId: string): Promise<SellerProfileWithUserDto> {
    return await this.sellerProfileService.getSellerProfileByUserId(userId);
  }

  @Put(':id')
  @RequireSellerOrAdmin()
  async updateSellerProfile(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateSellerProfileDto: UpdateSellerProfileDto
  ): Promise<SellerProfileResponseDto> {
    return await this.sellerProfileService.updateSellerProfile(id, updateSellerProfileDto);
  }

  @Put(':id/verify')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async verifySeller(@Body() verifySellerDto: VerifySellerDto): Promise<void> {
    await this.sellerProfileService.verifySeller(verifySellerDto);
  }

  @Delete(':id')
  @RequireAdmin()
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSellerProfile(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.sellerProfileService.deleteSellerProfile(id);
  }
}

@Controller('admin/seller-profiles')
@UseGuards(RbacGuard)
@RequireAdmin()
export class AdminSellerProfileController {
  constructor(private readonly sellerProfileService: SellerProfileService) {}

  @Get('all')
  async getAllSellerProfiles(): Promise<SellerListResponseDto> {
    return await this.sellerProfileService.getSellerProfiles({});
  }

  @Post('bulk-verify')
  @HttpCode(HttpStatus.NO_CONTENT)
  async bulkVerifySellers(@Body() sellerIds: string[]): Promise<void> {
    for (const sellerId of sellerIds) {
      await this.sellerProfileService.verifySeller({ 
        sellerId, 
        isVerified: true 
      });
    }
  }

  @Post('bulk-reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  async bulkRejectSellers(@Body() sellerIds: string[]): Promise<void> {
    for (const sellerId of sellerIds) {
      await this.sellerProfileService.verifySeller({ 
        sellerId, 
        isVerified: false 
      });
    }
  }

  @Get('analytics')
  async getDetailedSellerAnalytics(): Promise<SellerStatsDto> {
    return await this.sellerProfileService.getSellerStats();
  }
}