import { Module } from '@nestjs/common';
import { DatabaseConfigModule } from '@kadai/database-config';
import { AuthServiceModule } from '@kadai/auth-service';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { 
  UserController, 
  RbacController, 
  SellerProfileController,
  AdminUserController,
  AdminSellerProfileController,
  AuthController,
  AdminAuthController,
} from './controllers';
import { 
  UserService, 
  RbacService, 
  SellerProfileService,
  AuthService,
} from './services';
import { 
  UserRepository, 
  RbacRepository, 
  SellerProfileRepository,
  UserSessionRepository,
} from './repositories';
import { RbacGuard, ResourcePermissionGuard, JwtAuthGuard, OptionalJwtAuthGuard } from './guards';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    DatabaseConfigModule,
    AuthServiceModule, // This already provides JWT services
  ],
  controllers: [
    AppController,
    UserController,
    AdminUserController,
    RbacController,
    SellerProfileController,
    AdminSellerProfileController,
    AuthController,
    AdminAuthController,
  ],
  providers: [
    AppService,
    // Services
    UserService,
    RbacService,
    SellerProfileService,
    AuthService,
    // Repositories
    UserRepository,
    RbacRepository,
    SellerProfileRepository,
    UserSessionRepository,
    // Guards
    RbacGuard,
    ResourcePermissionGuard,
    JwtAuthGuard,
    OptionalJwtAuthGuard,
    // Strategies
    JwtStrategy,
  ],
})
export class AppModule {}
