import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { authConfig, validateAuthConfig } from './utils/config';

@Module({
  imports: [
    ConfigModule.forFeature(authConfig),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: any) => {
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
      inject: ['ConfigService'],
    }),
  ],
  controllers: [],
  providers: [],
  exports: [JwtModule, PassportModule],
})
export class AuthServiceModule {}
