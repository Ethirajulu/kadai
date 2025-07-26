import {
  Injectable,
  CanActivate,
  ExecutionContext,
  BadRequestException,
} from '@nestjs/common';
import {
  ValidationService,
  ValidationSchema,
} from '../services/validation.service';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class ValidationGuard implements CanActivate {
  constructor(private validationService: ValidationService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const response = context.switchToHttp().getResponse();

    // Get validation schema from metadata or use default
    const schema = this.getValidationSchema(context);

    // Create validation middleware
    const validationMiddleware =
      this.validationService.getValidationMiddleware(schema);

    // Apply validation
    return new Promise((resolve) => {
      validationMiddleware(request, response, (error?: any) => {
        if (error) {
          throw new BadRequestException(error.message);
        }
        resolve(true);
      });
    });
  }

  private getValidationSchema(
    context: ExecutionContext
  ): ValidationSchema | undefined {
    // This can be extended to get schema from metadata, decorators, etc.
    const handler = context.getHandler();
    const target = context.getClass();

    // Check for validation schema in metadata
    const schema =
      Reflect.getMetadata('validation:schema', handler) ||
      Reflect.getMetadata('validation:schema', target);

    return schema;
  }
}

// Decorator to apply validation schema
export function Validate(schema: ValidationSchema) {
  return function (
    target: any,
    propertyKey?: string,
    descriptor?: PropertyDescriptor
  ) {
    if (descriptor) {
      Reflect.defineMetadata('validation:schema', schema, descriptor.value);
    } else {
      Reflect.defineMetadata('validation:schema', schema, target);
    }
  };
}
