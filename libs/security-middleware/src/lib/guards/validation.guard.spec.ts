import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, BadRequestException } from '@nestjs/common';
import { ValidationGuard, Validate } from './validation.guard';
import { ValidationService } from '../services/validation.service';
import { SecurityRequest } from '../types/security.types';

describe('ValidationGuard', () => {
  let guard: ValidationGuard;
  let validationService: ValidationService;

  const mockValidationService = {
    getValidationMiddleware: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ValidationGuard,
        {
          provide: ValidationService,
          useValue: mockValidationService,
        },
      ],
    }).compile();

    guard = module.get<ValidationGuard>(ValidationGuard);
    validationService = module.get<ValidationService>(ValidationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  describe('canActivate', () => {
    it('should allow request when validation passes', async () => {
      const mockRequest = {
        body: { email: 'test@example.com' },
        headers: {},
      } as SecurityRequest;

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as ExecutionContext;

      const mockMiddleware = jest.fn((req, res, next) => next());
      mockValidationService.getValidationMiddleware.mockReturnValue(
        mockMiddleware
      );

      const result = await guard.canActivate(mockContext);

      expect(result).toBe(true);
      expect(mockValidationService.getValidationMiddleware).toHaveBeenCalled();
      expect(mockMiddleware).toHaveBeenCalledWith(
        mockRequest,
        mockResponse,
        expect.any(Function)
      );
    });

    it('should throw BadRequestException when validation fails', async () => {
      const mockRequest = {
        body: { email: 'invalid-email' },
        headers: {},
      } as SecurityRequest;

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
        getHandler: () => ({}),
        getClass: () => ({}),
      } as ExecutionContext;

      const mockMiddleware = jest.fn((req, res, next) =>
        next(new Error('Validation failed'))
      );
      mockValidationService.getValidationMiddleware.mockReturnValue(
        mockMiddleware
      );

      await expect(guard.canActivate(mockContext)).rejects.toThrow(
        BadRequestException
      );
      expect(mockValidationService.getValidationMiddleware).toHaveBeenCalled();
    });

    it('should use validation schema from metadata when available', async () => {
      const mockSchema = {
        body: require('joi').object({
          email: require('joi').string().email().required(),
        }),
      };

      const mockHandler = {};
      Reflect.defineMetadata('validation:schema', mockSchema, mockHandler);

      const mockRequest = {
        body: { email: 'test@example.com' },
        headers: {},
      } as SecurityRequest;

      const mockResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      const mockContext = {
        switchToHttp: () => ({
          getRequest: () => mockRequest,
          getResponse: () => mockResponse,
        }),
        getHandler: () => mockHandler,
        getClass: () => ({}),
      } as ExecutionContext;

      const mockMiddleware = jest.fn((req, res, next) => next());
      mockValidationService.getValidationMiddleware.mockReturnValue(
        mockMiddleware
      );

      await guard.canActivate(mockContext);

      expect(
        mockValidationService.getValidationMiddleware
      ).toHaveBeenCalledWith(mockSchema);
    });
  });

  describe('Validate decorator', () => {
    it('should apply validation schema to method', () => {
      const mockSchema = {
        body: require('joi').object({
          email: require('joi').string().email().required(),
        }),
      };

      class TestController {
        @Validate(mockSchema)
        testMethod(): void {
          // Test method
        }
      }

      const controller = new TestController();
      const schema = Reflect.getMetadata(
        'validation:schema',
        controller.testMethod
      );

      expect(schema).toBe(mockSchema);
    });

    it('should apply validation schema to class', () => {
      const mockSchema = {
        body: require('joi').object({
          email: require('joi').string().email().required(),
        }),
      };

      @Validate(mockSchema)
      class TestController {
        testMethod(): void {
          // Test method
        }
      }

      const schema = Reflect.getMetadata('validation:schema', TestController);

      expect(schema).toBe(mockSchema);
    });
  });
});
