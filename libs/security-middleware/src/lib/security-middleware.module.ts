import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecurityService } from './services/security.service';
import { RateLimitService } from './services/rate-limit.service';
import { SecurityInterceptor } from './interceptors/security.interceptor';
import { RateLimitInterceptor } from './interceptors/rate-limit.interceptor';
import { IPWhitelistGuard } from './guards/ip-whitelist.guard';
import { GeoFilterGuard } from './guards/geo-filter.guard';
import { RateLimitGuard } from './guards/rate-limit.guard';
import securityConfig from './config/security.config';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(securityConfig),
  ],
  providers: [
    SecurityService,
    RateLimitService,
    SecurityInterceptor,
    RateLimitInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
    RateLimitGuard,
  ],
  exports: [
    SecurityService,
    RateLimitService,
    SecurityInterceptor,
    RateLimitInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
    RateLimitGuard,
  ],
})
export class SecurityMiddlewareModule {}
