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
} from './controllers';
import { 
  UserService, 
  RbacService, 
  SellerProfileService,
} from './services';
import { 
  UserRepository, 
  RbacRepository, 
  SellerProfileRepository,
} from './repositories';
import { RbacGuard, ResourcePermissionGuard } from './guards';

@Module({
  imports: [
    DatabaseConfigModule,
    AuthServiceModule,
  ],
  controllers: [
    AppController,
    UserController,
    AdminUserController,
    RbacController,
    SellerProfileController,
    AdminSellerProfileController,
  ],
  providers: [
    AppService,
    // Services
    UserService,
    RbacService,
    SellerProfileService,
    // Repositories
    UserRepository,
    RbacRepository,
    SellerProfileRepository,
    // Guards
    RbacGuard,
    ResourcePermissionGuard,
  ],
})
export class AppModule {}
