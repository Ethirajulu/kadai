import { ValidationResult, ValidationError, ValidationSchema } from '@kadai/shared-types';

export class DataValidator {
  /**
   * User data validation schema
   */
  static readonly USER_SCHEMA: ValidationSchema = {
    name: 'user',
    rules: [
      {
        field: 'email',
        type: 'required',
        message: 'Email is required',
      },
      {
        field: 'email',
        type: 'email',
        message: 'Email must be valid',
      },
      {
        field: 'phoneNumber',
        type: 'phone',
        message: 'Phone number must be valid',
        options: { allowEmpty: true },
      },
      {
        field: 'firstName',
        type: 'pattern',
        message: 'First name must contain only letters',
        options: {
          pattern: '^[a-zA-Z\\s]{1,50}$',
          allowEmpty: true,
        },
      },
      {
        field: 'lastName',
        type: 'pattern',
        message: 'Last name must contain only letters',
        options: {
          pattern: '^[a-zA-Z\\s]{1,50}$',
          allowEmpty: true,
        },
      },
    ],
    strict: false,
  };

  /**
   * Product data validation schema
   */
  static readonly PRODUCT_SCHEMA: ValidationSchema = {
    name: 'product',
    rules: [
      {
        field: 'name',
        type: 'required',
        message: 'Product name is required',
      },
      {
        field: 'name',
        type: 'pattern',
        message: 'Product name must be 2-200 characters',
        options: {
          pattern: '^.{2,200}$',
        },
      },
      {
        field: 'description',
        type: 'required',
        message: 'Product description is required',
      },
      {
        field: 'price',
        type: 'required',
        message: 'Product price is required',
      },
      {
        field: 'price',
        type: 'range',
        message: 'Product price must be positive',
        options: {
          min: 0.01,
        },
      },
      {
        field: 'stockQuantity',
        type: 'range',
        message: 'Stock quantity must be non-negative',
        options: {
          min: 0,
        },
      },
      {
        field: 'sku',
        type: 'pattern',
        message: 'SKU must be alphanumeric',
        options: {
          pattern: '^[a-zA-Z0-9-_]{1,50}$',
          allowEmpty: true,
        },
      },
    ],
    strict: false,
  };

  /**
   * Order data validation schema
   */
  static readonly ORDER_SCHEMA: ValidationSchema = {
    name: 'order',
    rules: [
      {
        field: 'userId',
        type: 'required',
        message: 'User ID is required',
      },
      {
        field: 'userId',
        type: 'uuid',
        message: 'User ID must be a valid UUID',
      },
      {
        field: 'sellerId',
        type: 'required',
        message: 'Seller ID is required',
      },
      {
        field: 'sellerId',
        type: 'uuid',
        message: 'Seller ID must be a valid UUID',
      },
      {
        field: 'totalAmount',
        type: 'required',
        message: 'Total amount is required',
      },
      {
        field: 'totalAmount',
        type: 'range',
        message: 'Total amount must be positive',
        options: {
          min: 0.01,
        },
      },
      {
        field: 'currency',
        type: 'pattern',
        message: 'Currency must be a valid 3-letter code',
        options: {
          pattern: '^[A-Z]{3}$',
        },
      },
    ],
    strict: false,
  };

  /**
   * Message data validation schema
   */
  static readonly MESSAGE_SCHEMA: ValidationSchema = {
    name: 'message',
    rules: [
      {
        field: 'sessionId',
        type: 'required',
        message: 'Session ID is required',
      },
      {
        field: 'content',
        type: 'required',
        message: 'Message content is required',
      },
      {
        field: 'content',
        type: 'pattern',
        message: 'Message content too long',
        options: {
          pattern: '^.{1,10000}$',
        },
      },
      {
        field: 'messageType',
        type: 'pattern',
        message: 'Invalid message type',
        options: {
          pattern: '^(text|image|audio|video|document)$',
        },
      },
      {
        field: 'platform',
        type: 'pattern',
        message: 'Invalid platform',
        options: {
          pattern: '^(WHATSAPP|INSTAGRAM|TELEGRAM|WEB)$',
        },
      },
    ],
    strict: false,
  };

  /**
   * Chat session validation schema
   */
  static readonly CHAT_SESSION_SCHEMA: ValidationSchema = {
    name: 'chat_session',
    rules: [
      {
        field: 'platform',
        type: 'required',
        message: 'Platform is required',
      },
      {
        field: 'platform',
        type: 'pattern',
        message: 'Invalid platform',
        options: {
          pattern: '^(WHATSAPP|INSTAGRAM|TELEGRAM|WEB)$',
        },
      },
      {
        field: 'platformUserId',
        type: 'required',
        message: 'Platform user ID is required',
      },
      {
        field: 'sessionToken',
        type: 'required',
        message: 'Session token is required',
      },
      {
        field: 'language',
        type: 'pattern',
        message: 'Invalid language code',
        options: {
          pattern: '^[a-z]{2}(-[A-Z]{2})?$',
          allowEmpty: true,
        },
      },
    ],
    strict: false,
  };

  /**
   * Vector embedding validation schema
   */
  static readonly VECTOR_SCHEMA: ValidationSchema = {
    name: 'vector',
    rules: [
      {
        field: 'id',
        type: 'required',
        message: 'Vector ID is required',
      },
      {
        field: 'vector',
        type: 'required',
        message: 'Vector array is required',
      },
    ],
    strict: false,
  };

  /**
   * Validate data against a schema
   */
  static validate(data: any, schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];

    // Check if all required fields are present in strict mode
    if (schema.strict) {
      const schemaFields = schema.rules.map((rule: any) => rule.field);
      const dataFields = Object.keys(data);
      
      for (const field of schemaFields) {
        if (!dataFields.includes(field)) {
          errors.push({
            field,
            message: `Field ${field} is missing`,
            rule: 'required',
          });
        }
      }

      for (const field of dataFields) {
        if (!schemaFields.includes(field)) {
          errors.push({
            field,
            message: `Unexpected field ${field}`,
            rule: 'unexpected',
          });
        }
      }
    }

    // Validate each rule
    for (const rule of schema.rules) {
      const value = data[rule.field];

      switch (rule.type) {
        case 'required': {
          if (value === undefined || value === null || value === '') {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'email': {
          if (value && !this.isValidEmail(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'phone': {
          if (value && !this.isValidPhone(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'uuid': {
          if (value && !this.isValidUUID(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'url': {
          if (value && !this.isValidURL(value)) {
            errors.push({
              field: rule.field,
              message: rule.message,
              rule: rule.type,
              value,
            });
          }
          break;
        }
        
        case 'range': {
          if (value !== undefined && rule.options) {
            const numValue = Number(value);
            if (isNaN(numValue)) {
              errors.push({
                field: rule.field,
                message: `${rule.field} must be a number`,
                rule: rule.type,
                value,
              });
            } else {
              if (rule.options.min !== undefined && numValue < rule.options.min) {
                errors.push({
                  field: rule.field,
                  message: rule.message,
                  rule: rule.type,
                  value,
                });
              }
              if (rule.options.max !== undefined && numValue > rule.options.max) {
                errors.push({
                  field: rule.field,
                  message: rule.message,
                  rule: rule.type,
                  value,
                });
              }
            }
          }
          break;
        }
        
        case 'pattern': {
          if (value !== undefined && value !== null) {
            // Skip validation if allowEmpty is true and value is empty
            if (rule.options?.allowEmpty && value === '') {
              continue;
            }
            
            if (rule.options?.pattern) {
              const regex = new RegExp(rule.options.pattern);
              if (!regex.test(String(value))) {
                errors.push({
                  field: rule.field,
                  message: rule.message,
                  rule: rule.type,
                  value,
                });
              }
            }
          }
          break;
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate vector embedding data
   */
  static validateVector(data: any, expectedSize?: number): ValidationResult {
    const result = this.validate(data, this.VECTOR_SCHEMA);

    // Additional vector-specific validation
    if (data.vector) {
      if (!Array.isArray(data.vector)) {
        result.errors.push({
          field: 'vector',
          message: 'Vector must be an array',
          rule: 'type',
          value: typeof data.vector,
        });
        result.valid = false;
      } else {
        // Check vector size if specified
        if (expectedSize && data.vector.length !== expectedSize) {
          result.errors.push({
            field: 'vector',
            message: `Vector must have exactly ${expectedSize} dimensions`,
            rule: 'range',
            value: data.vector.length,
          });
          result.valid = false;
        }

        // Check that all elements are numbers
        for (let i = 0; i < data.vector.length; i++) {
          if (typeof data.vector[i] !== 'number' || !isFinite(data.vector[i])) {
            result.errors.push({
              field: `vector[${i}]`,
              message: 'Vector elements must be finite numbers',
              rule: 'type',
              value: data.vector[i],
            });
            result.valid = false;
            break; // Stop after first invalid element
          }
        }
      }
    }

    return result;
  }

  /**
   * Validate bulk operation data
   */
  static validateBulkData(data: any[], schema: ValidationSchema): ValidationResult {
    const errors: ValidationError[] = [];

    if (!Array.isArray(data)) {
      return {
        valid: false,
        errors: [{
          field: 'data',
          message: 'Data must be an array',
          rule: 'type',
        }],
      };
    }

    for (let i = 0; i < data.length; i++) {
      const itemResult = this.validate(data[i], schema);
      if (!itemResult.valid) {
        // Prefix field names with array index
        for (const error of itemResult.errors) {
          errors.push({
            ...error,
            field: `[${i}].${error.field}`,
          });
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Helper validation functions
   */
  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  private static isValidPhone(phone: string): boolean {
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    return phoneRegex.test(phone.replace(/\s|-|\(|\)/g, ''));
  }

  private static isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  private static isValidURL(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }
}