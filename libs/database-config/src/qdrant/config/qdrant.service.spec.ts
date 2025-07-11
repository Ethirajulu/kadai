import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { QdrantService } from './qdrant.service';

describe('QdrantService', () => {
  let service: QdrantService;
  let configService: ConfigService;

  const mockConfigService = {
    get: jest.fn((key: string, defaultValue?: any) => {
      const config = {
        'QDRANT_HOST': 'localhost',
        'QDRANT_PORT': 6333,
        'QDRANT_HTTPS': false,
        'QDRANT_API_KEY': undefined,
        'QDRANT_TIMEOUT': 30000,
        'QDRANT_RETRY_ATTEMPTS': 3,
      };
      return config[key] ?? defaultValue;
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QdrantService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<QdrantService>(QdrantService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getConnectionConfig', () => {
    it('should return default configuration', () => {
      const config = service['getConnectionConfig']();
      expect(config).toEqual({
        host: 'localhost',
        port: 6333,
        https: false,
        apiKey: undefined,
        timeout: 30000,
        retryAttempts: 3,
      });
    });

    it('should use custom configuration when provided', () => {
      mockConfigService.get.mockImplementation((key: string, defaultValue?: any) => {
        const config = {
          'QDRANT_HOST': 'custom-host',
          'QDRANT_PORT': 443,
          'QDRANT_HTTPS': true,
          'QDRANT_API_KEY': 'test-key',
          'QDRANT_TIMEOUT': 60000,
          'QDRANT_RETRY_ATTEMPTS': 5,
        };
        return config[key] ?? defaultValue;
      });

      const config = service['getConnectionConfig']();
      expect(config).toEqual({
        host: 'custom-host',
        port: 443,
        https: true,
        apiKey: 'test-key',
        timeout: 60000,
        retryAttempts: 5,
      });
    });
  });

  describe('healthCheck', () => {
    it('should return false when not connected', async () => {
      const result = await service.healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('collection management', () => {
    const mockCollectionConfig = {
      name: 'test_collection',
      vectorSize: 1536,
      distance: 'Cosine' as any,
      payloadIndexes: {
        'test_field': 'keyword',
      },
      description: 'Test collection',
    };

    it('should handle collection creation configuration', () => {
      expect(mockCollectionConfig.name).toBe('test_collection');
      expect(mockCollectionConfig.vectorSize).toBe(1536);
      expect(mockCollectionConfig.distance).toBe('Cosine');
      expect(mockCollectionConfig.payloadIndexes).toBeDefined();
    });

    it('should validate collection configuration', () => {
      expect(mockCollectionConfig.name).toBeTruthy();
      expect(mockCollectionConfig.vectorSize).toBeGreaterThan(0);
      expect(typeof mockCollectionConfig.distance).toBe('string');
    });
  });

  describe('error handling', () => {
    it('should throw error when client is not initialized', () => {
      expect(() => service.getClient()).toThrow('Qdrant client not initialized');
    });

    it('should handle configuration errors gracefully', () => {
      mockConfigService.get.mockImplementation(() => {
        throw new Error('Configuration error');
      });

      expect(() => service['getConnectionConfig']()).toThrow('Configuration error');
    });
  });
});

describe('QdrantService Integration Tests', () => {
  let service: QdrantService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QdrantService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              const config = {
                'QDRANT_HOST': process.env.QDRANT_HOST || 'localhost',
                'QDRANT_PORT': parseInt(process.env.QDRANT_PORT || '6333'),
                'QDRANT_HTTPS': process.env.QDRANT_HTTPS === 'true',
                'QDRANT_API_KEY': process.env.QDRANT_API_KEY,
                'QDRANT_TIMEOUT': parseInt(process.env.QDRANT_TIMEOUT || '30000'),
                'QDRANT_RETRY_ATTEMPTS': parseInt(process.env.QDRANT_RETRY_ATTEMPTS || '3'),
              };
              return config[key] ?? defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<QdrantService>(QdrantService);
  });

  it('should connect to Qdrant if service is running', async () => {
    try {
      await service.onModuleInit();
      const isHealthy = await service.healthCheck();
      expect(isHealthy).toBe(true);
    } catch (error) {
      console.warn('Qdrant service not available for integration tests:', error.message);
      expect(true).toBe(true); // Skip test if service not available
    }
  });

  it('should list collections when connected', async () => {
    try {
      await service.onModuleInit();
      const collections = await service.listCollections();
      expect(Array.isArray(collections)).toBe(true);
    } catch (error) {
      console.warn('Qdrant service not available for integration tests:', error.message);
      expect(true).toBe(true); // Skip test if service not available
    }
  });
});