import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecurityService } from './services/security.service';
import { RateLimitService } from './services/rate-limit.service';
import { ValidationService } from './services/validation.service';
import { SecurityInterceptor } from './interceptors/security.interceptor';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { IPWhitelistGuard } from './guards/ip-whitelist.guard';
import { GeoFilterGuard } from './guards/geo-filter.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import { ValidationGuard } from './guards/validation.guard';
import securityConfig from './config/security.config';

@Global()
@Module({
  imports: [ConfigModule.forFeature(securityConfig)],
  providers: [
    SecurityService,
    RateLimitService,
    ValidationService,
    SecurityInterceptor,
    RateLimitInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
    RateLimitGuard,
    ValidationGuard,
  ],
  exports: [
    SecurityService,
    RateLimitService,
    ValidationService,
    SecurityInterceptor,
    RateLimitInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
    RateLimitGuard,
    ValidationGuard,
  ],
})
export class SecurityMiddlewareModule {}
