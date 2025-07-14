import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { MongodbService } from './mongodb.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        // Clean up MongoDB URL by removing inline comments and trimming
        const rawUri = configService.get<string>('MONGODB_URL');
        const cleanUri = rawUri?.split('#')[0]?.trim();

        return {
          uri: cleanUri,
          connectionFactory: (connection) => {
            connection.plugin(require('mongoose-autopopulate'));
            return connection;
          },
          maxPoolSize: configService.get<number>('MONGODB_MAX_POOL_SIZE', 10),
          serverSelectionTimeoutMS: configService.get<number>(
            'MONGODB_SERVER_SELECTION_TIMEOUT',
            5000
          ),
          socketTimeoutMS: configService.get<number>(
            'MONGODB_SOCKET_TIMEOUT',
            45000
          ),
          ...(configService.get<string>('MONGODB_REPLICA_SET') && {
            replicaSet: configService.get<string>('MONGODB_REPLICA_SET'),
            readPreference: 'secondary',
            writeConcern: { w: 'majority', j: true, wtimeout: 1000 },
          }),
        };
      },
      inject: [ConfigService],
    }),
  ],
  providers: [MongodbService],
  exports: [MongooseModule, MongodbService],
})
export class MongodbConfigModule {}
