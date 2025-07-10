import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URL'),
        connectionFactory: (connection) => {
          connection.plugin(require('mongoose-autopopulate'));
          return connection;
        },
        // Connection pooling configuration
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        bufferMaxEntries: 0,
        // Replica set configuration
        replicaSet: process.env.MONGODB_REPLICA_SET,
        readPreference: 'secondary',
        writeConcern: {
          w: 'majority',
          j: true,
          wtimeout: 1000,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [MongooseModule],
})
export class MongodbConfigModule {}
