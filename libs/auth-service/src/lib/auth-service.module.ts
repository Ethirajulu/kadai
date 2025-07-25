import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { authConfig, validateAuthConfig } from './utils/config';
import { JwtService } from './services/jwt.service';
import { JwtStrategy } from './services/jwt.strategy';
import { JwtAuthGuard, RbacGuard } from './guards';
import { redisProvider } from './services/redis.factory';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const config = configService.get('auth');
        validateAuthConfig(config);
        return {
          secret: config.jwtSecret,
          signOptions: {
            expiresIn: config.accessTokenExpiration,
            issuer: config.jwtIssuer,
            audience: config.jwtAudience,
          },
        };
      },
      inject: [ConfigService],
    }),
  ],
  controllers: [],
  providers: [
    redisProvider,
    JwtService,
    JwtStrategy,
    JwtAuthGuard,
    RbacGuard,
  ],
  exports: [
    JwtModule,
    PassportModule,
    JwtService,
    JwtStrategy,
    JwtAuthGuard,
    RbacGuard,
  ],
})
export class AuthServiceModule {}
