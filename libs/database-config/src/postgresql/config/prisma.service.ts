import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor(private configService: ConfigService) {
    // Clean up DATABASE_URL by removing inline comments and trimming
    const rawDatabaseUrl = configService.get<string>('DATABASE_URL');
    const cleanDatabaseUrl = rawDatabaseUrl?.split('#')[0]?.trim();

    super({
      datasources: {
        db: {
          url: cleanDatabaseUrl,
        },
      },
      log:
        configService.get<string>('NODE_ENV') === 'development'
          ? ['query', 'info', 'warn', 'error']
          : ['error'],
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDb() {
    if (this.configService.get<string>('NODE_ENV') === 'production') {
      throw new Error('Cannot clean database in production');
    }

    const models = Reflect.ownKeys(this).filter(
      (key) =>
        typeof key === 'string' && key[0] !== '_' && key !== 'constructor'
    );

    return Promise.all(
      models.map((model) => (this as any)[model].deleteMany())
    );
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`;
      return true;
    } catch (error) {
      console.error('PostgreSQL health check failed:', error);
      return false;
    }
  }

  async getConnectionInfo(): Promise<{
    connected: boolean;
    version: string;
    database: string;
  }> {
    try {
      const result = await this.$queryRaw<
        Array<{ version: string }>
      >`SELECT version()`;
      const dbResult = await this.$queryRaw<
        Array<{ current_database: string }>
      >`SELECT current_database()`;

      return {
        connected: true,
        version: result[0]?.version || 'unknown',
        database: dbResult[0]?.current_database || 'unknown',
      };
    } catch (error) {
      console.error('Failed to get PostgreSQL connection info:', error);
      return {
        connected: false,
        version: 'unknown',
        database: 'unknown',
      };
    }
  }
}
