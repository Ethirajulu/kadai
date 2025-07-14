import { Module } from '@nestjs/common';
import { MongodbConfigModule } from './mongodb/config/mongodb-config.module';
import { PostgresqlConfigModule } from './postgresql/config/postgresql-config.module';
import { RedisConfigModule } from './redis/config/redis-config.module';
import { QdrantConfigModule } from './qdrant/config/qdrant-config.module';
import { DatabaseHealthCheckService } from './health-check.service';
import { DatabaseManager } from './database-manager.service';
import { DatabaseMonitorService } from './monitoring/database-monitor.service';
import { DatabaseConfigService } from './config/database-config.service';

@Module({
  imports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
    RedisConfigModule,
    QdrantConfigModule,
  ],
  providers: [
    DatabaseHealthCheckService, 
    DatabaseManager, 
    DatabaseMonitorService,
    DatabaseConfigService,
  ],
  exports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
    RedisConfigModule,
    QdrantConfigModule,
    DatabaseHealthCheckService,
    DatabaseManager,
    DatabaseMonitorService,
    DatabaseConfigService,
  ],
})
export class DatabaseConfigModule {}
