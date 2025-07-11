import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { RedisConfigModule } from './redis-config.module';
import { RedisService } from './redis.service';

describe('RedisConfigModule', () => {
  let module: TestingModule;
  let redisService: RedisService;

  beforeEach(async () => {
    module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        RedisConfigModule,
      ],
    }).compile();

    redisService = module.get<RedisService>(RedisService);
  });

  it('should be defined', () => {
    expect(module).toBeDefined();
  });

  it('should provide RedisService', () => {
    expect(redisService).toBeDefined();
    expect(redisService).toBeInstanceOf(RedisService);
  });

  it('should export RedisService', () => {
    const exportedService = module.get<RedisService>(RedisService);
    expect(exportedService).toBe(redisService);
  });

  afterEach(async () => {
    await module.close();
  });
});