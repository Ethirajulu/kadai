import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { SecurityService } from './services/security.service';
import { RateLimitService } from './services/rate-limit.service';
import { ValidationService } from './services/validation.service';
import { JWTService } from './services/jwt.service';
import { SecurityInterceptor } from './interceptors/security.interceptor';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { IPWhitelistGuard } from './guards/ip-whitelist.guard';
import { GeoFilterGuard } from './guards/geo-filter.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { ValidationGuard } from './guards/validation.guard';
import { JwtGuard, OptionalJwtGuard } from './guards/jwt.guard';
import { 
  TokenRefreshMiddleware, 
  RefreshTokenEndpointMiddleware, 
  LogoutMiddleware 
} from './middleware/token-refresh.middleware';
import securityConfig from './config/security.config';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(securityConfig),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_ACCESS_SECRET || 'default-secret-change-in-production',
      signOptions: { 
        expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
        issuer: process.env.JWT_ISSUER || 'kadai-auth',
        audience: process.env.JWT_AUDIENCE || 'kadai-api'
      },
    }),
  ],
  providers: [
    SecurityService,
    RateLimitService,
    ValidationService,
    JWTService,
    SecurityInterceptor,
    RateLimitInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
    RateLimitGuard,
    ValidationGuard,
    JwtGuard,
    OptionalJwtGuard,
    TokenRefreshMiddleware,
    RefreshTokenEndpointMiddleware,
    LogoutMiddleware,
  ],
  exports: [
    SecurityService,
    RateLimitService,
    ValidationService,
    JWTService,
    SecurityInterceptor,
    RateLimitInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
    RateLimitGuard,
    ValidationGuard,
    JwtGuard,
    OptionalJwtGuard,
    TokenRefreshMiddleware,
    RefreshTokenEndpointMiddleware,
    LogoutMiddleware,
  ],
})
export class SecurityMiddlewareModule {}
