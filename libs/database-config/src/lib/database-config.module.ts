import { Module } from '@nestjs/common';
import { MongodbConfigModule } from './mongodb/mongodb-config.module';
import { PostgresqlConfigModule } from './postgresql/postgresql-config.module';

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
