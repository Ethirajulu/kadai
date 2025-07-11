import { DatabaseConfigModule } from './database-config.module';

// Mock PrismaClient
jest.mock('./postgresql/generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  })),
}));

// Mock Redis
jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    })),
    Cluster: jest.fn().mockImplementation(() => ({
      ping: jest.fn().mockResolvedValue('PONG'),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn(),
    })),
  };
});

describe('DatabaseConfigModule', () => {
  it('should be defined', () => {
    expect(DatabaseConfigModule).toBeDefined();
  });

  it('should be a module', () => {
    expect(typeof DatabaseConfigModule).toBe('function');
  });

  it('should have correct module metadata', () => {
    const imports = Reflect.getMetadata('imports', DatabaseConfigModule);
    const exports = Reflect.getMetadata('exports', DatabaseConfigModule);

    expect(imports).toBeDefined();
    expect(exports).toBeDefined();
    expect(Array.isArray(imports)).toBe(true);
    expect(Array.isArray(exports)).toBe(true);
    expect(imports.length).toBe(3); // MongodbConfigModule, PostgresqlConfigModule, RedisConfigModule
    expect(exports.length).toBe(3); // MongodbConfigModule, PostgresqlConfigModule, RedisConfigModule
  });
});
