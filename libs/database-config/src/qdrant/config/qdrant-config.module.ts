import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { QdrantService } from './qdrant.service';
import { CollectionInitializerService } from './collection-initializer.service';

@Module({
  imports: [ConfigModule],
  providers: [QdrantService, CollectionInitializerService],
  exports: [QdrantService, CollectionInitializerService],
})
export class QdrantConfigModule {}