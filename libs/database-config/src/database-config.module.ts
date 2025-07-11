import { Module } from '@nestjs/common';
import { MongodbConfigModule } from './mongodb/config/mongodb-config.module';
import { PostgresqlConfigModule } from './postgresql/config/postgresql-config.module';
import { RedisConfigModule } from './redis/config/redis-config.module';
import { QdrantConfigModule } from './qdrant/config/qdrant-config.module';
import { DatabaseHealthCheckService } from './health-check.service';

@Module({
  imports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
    RedisConfigModule,
    QdrantConfigModule,
  ],
  providers: [DatabaseHealthCheckService],
  exports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
    RedisConfigModule,
    QdrantConfigModule,
    DatabaseHealthCheckService,
  ],
})
export class DatabaseConfigModule {}
