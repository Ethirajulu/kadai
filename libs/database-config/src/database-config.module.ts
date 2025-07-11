import { Module } from '@nestjs/common';
import { MongodbConfigModule } from './mongodb/config/mongodb-config.module';
import { PostgresqlConfigModule } from './postgresql/config/postgresql-config.module';

@Module({
  imports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
  ],
  exports: [
    MongodbConfigModule,
    PostgresqlConfigModule,
  ],
})
export class DatabaseConfigModule {}
