import { PostgresqlConfigModule } from './postgresql-config.module';

// Mock PrismaClient
jest.mock('../../../../../database/postgresql/generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    $connect: jest.fn(),
    $disconnect: jest.fn(),
  }))
}));

describe('PostgresqlConfigModule', () => {
  it('should be defined', () => {
    expect(PostgresqlConfigModule).toBeDefined();
  });

  it('should be a class', () => {
    expect(typeof PostgresqlConfigModule).toBe('function');
  });

  it('should have the correct module metadata', () => {
    const imports = Reflect.getMetadata('imports', PostgresqlConfigModule);
    const providers = Reflect.getMetadata('providers', PostgresqlConfigModule);
    const exports = Reflect.getMetadata('exports', PostgresqlConfigModule);
    
    expect(imports).toBeDefined();
    expect(providers).toBeDefined();
    expect(exports).toBeDefined();
    expect(Array.isArray(imports)).toBe(true);
    expect(Array.isArray(providers)).toBe(true);
    expect(Array.isArray(exports)).toBe(true);
  });
});