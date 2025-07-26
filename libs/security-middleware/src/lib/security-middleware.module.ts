import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SecurityService } from './services/security.service';
import { SecurityInterceptor } from './interceptors/security.interceptor';
import { IPWhitelistGuard } from './guards/ip-whitelist.guard';
import { GeoFilterGuard } from './guards/geo-filter.guard';
import securityConfig from './config/security.config';

@Global()
@Module({
  imports: [
    ConfigModule.forFeature(securityConfig),
  ],
  providers: [
    SecurityService,
    SecurityInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
  ],
  exports: [
    SecurityService,
    SecurityInterceptor,
    IPWhitelistGuard,
    GeoFilterGuard,
  ],
})
export class SecurityMiddlewareModule {}
