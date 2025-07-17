import { Module, NestModule, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
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
import { ProfileController, EnhancedUserController } from './controllers/profile.controller';
import { SessionController, AdminSessionController } from './controllers/session.controller';
import { 
  UserService, 
  RbacService, 
  SellerProfileService,
  AuthService,
} from './services';
import { SessionService } from './services/session.service';
import { 
  UserRepository, 
  RbacRepository, 
  SellerProfileRepository,
  UserSessionRepository,
} from './repositories';
import { RbacGuard, ResourcePermissionGuard, JwtAuthGuard, OptionalJwtAuthGuard } from './guards';
import { JwtStrategy } from './strategies/jwt.strategy';
import { 
  RateLimitMiddleware, 
  AuthRateLimitMiddleware, 
  PasswordResetRateLimitMiddleware,
  SecurityHeadersMiddleware,
  RequestLoggingMiddleware,
  BodySizeMiddleware,
  SessionValidationMiddleware,
  ApiVersionMiddleware,
} from './middleware';

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
    ProfileController,
    EnhancedUserController,
    SessionController,
    AdminSessionController,
  ],
  providers: [
    AppService,
    // Services
    UserService,
    RbacService,
    SellerProfileService,
    AuthService,
    SessionService,
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
    // Middleware
    RateLimitMiddleware,
    AuthRateLimitMiddleware,
    PasswordResetRateLimitMiddleware,
    SecurityHeadersMiddleware,
    RequestLoggingMiddleware,
    BodySizeMiddleware,
    SessionValidationMiddleware,
    ApiVersionMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply security headers to all routes
    consumer
      .apply(SecurityHeadersMiddleware)
      .forRoutes('*');

    // Apply request logging to all routes
    consumer
      .apply(RequestLoggingMiddleware)
      .forRoutes('*');

    // Apply body size limits to all routes
    consumer
      .apply(BodySizeMiddleware)
      .forRoutes({ path: '*', method: RequestMethod.POST }, { path: '*', method: RequestMethod.PUT });

    // Apply API version middleware to all routes
    consumer
      .apply(ApiVersionMiddleware)
      .forRoutes('*');

    // Apply session validation middleware to protected routes
    consumer
      .apply(SessionValidationMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'auth/reset-password', method: RequestMethod.POST },
        { path: 'auth/verify-email', method: RequestMethod.POST },
        { path: 'health', method: RequestMethod.GET },
        { path: '', method: RequestMethod.GET },
      )
      .forRoutes('*');

    // Apply auth rate limiting to authentication endpoints
    consumer
      .apply(AuthRateLimitMiddleware)
      .forRoutes(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
      );

    // Apply password reset rate limiting
    consumer
      .apply(PasswordResetRateLimitMiddleware)
      .forRoutes(
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'auth/reset-password', method: RequestMethod.POST },
      );

    // Apply general rate limiting to other endpoints
    consumer
      .apply(RateLimitMiddleware)
      .exclude(
        { path: 'auth/login', method: RequestMethod.POST },
        { path: 'auth/register', method: RequestMethod.POST },
        { path: 'auth/forgot-password', method: RequestMethod.POST },
        { path: 'auth/reset-password', method: RequestMethod.POST },
      )
      .forRoutes('*');
  }
}
