import { Module } from '@nestjs/common';
import { MongodbConfigModule } from './mongodb/config/mongodb-config.module';
import { PostgresqlConfigModule } from './postgresql/config/postgresql-config.module';
import { RedisConfigModule } from './redis/config/redis-config.module';

@Module({
  imports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
    RedisConfigModule,
  ],
  exports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
    RedisConfigModule,
  ],
})
export class DatabaseConfigModule {}
