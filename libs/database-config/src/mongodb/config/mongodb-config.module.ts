import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URL'),
        connectionFactory: (connection) => {
          connection.plugin(require('mongoose-autopopulate'));
          return connection;
        },
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        ...(process.env.MONGODB_REPLICA_SET && {
          replicaSet: process.env.MONGODB_REPLICA_SET,
          readPreference: 'secondary',
          writeConcern: { w: 'majority', j: true, wtimeout: 1000 }
        })
      }),
      inject: [ConfigService]
    })
  ],
  exports: [MongooseModule]
})
export class MongodbConfigModule {}