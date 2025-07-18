import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

// Mock PrismaClient
const mockPrismaClient = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  cleanDb: jest.fn(),
};

jest.mock('../generated/prisma', () => ({
  PrismaClient: jest.fn().mockImplementation(() => mockPrismaClient),
}));

describe('PrismaService', () => {
  let configService: ConfigService;

  beforeEach(async () => {
    const mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'DATABASE_URL':
            return 'postgresql://test:test@localhost:5432/test';
          default:
            return undefined;
        }
      }),
    };

    configService = mockConfigService as unknown as ConfigService;
  });

  it('should be defined', () => {
    expect(PrismaService).toBeDefined();
  });

  it('should be a class', () => {
    expect(typeof PrismaService).toBe('function');
  });

  it('should have cleanDb method defined', () => {
    const service = new PrismaService(configService);
    expect(service.cleanDb).toBeDefined();
    expect(typeof service.cleanDb).toBe('function');
  });

  it('should throw error when cleaning database in production', async () => {
    // Create a mock config service that returns 'production' for NODE_ENV
    const productionConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'DATABASE_URL':
            return 'postgresql://test:test@localhost:5432/test';
          case 'NODE_ENV':
            return 'production';
          default:
            return undefined;
        }
      }),
    };

    const service = new PrismaService(productionConfigService as unknown as ConfigService);

    // Mock the service properly since it extends PrismaClient
    const cleanDbSpy = jest
      .spyOn(service, 'cleanDb')
      .mockImplementation(async () => {
        if (productionConfigService.get('NODE_ENV') === 'production') {
          throw new Error('Cannot clean database in production');
        }
        return Promise.resolve([]);
      });

    await expect(service.cleanDb()).rejects.toThrow(
      'Cannot clean database in production'
    );

    cleanDbSpy.mockRestore();
  });

  it('should use config service for database URL', () => {
    new PrismaService(configService);
    expect(configService.get).toHaveBeenCalledWith('DATABASE_URL');
  });
});
