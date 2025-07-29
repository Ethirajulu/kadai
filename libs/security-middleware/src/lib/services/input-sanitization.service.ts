import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class InputSanitizationService {
  // Logger removed as it's not used
  private readonly sanitizeInput: boolean;

  constructor(private configService: ConfigService) {
    this.sanitizeInput = this.configService.get<boolean>('security.validation.sanitizeInput', true);
  }

  /**
   * Sanitize request data if sanitization is enabled
   */
  sanitizeRequest(req: SecurityRequest): void {
    if (!this.sanitizeInput) {
      return;
    }

    if (req.body) {
      req.body = this.sanitizeObject(req.body);
    }
    if (req.query) {
      req.query = this.sanitizeObject(req.query) as any;
    }
    if (req.params) {
      req.params = this.sanitizeObject(req.params) as any;
    }
  }

  /**
   * Recursively sanitize an object
   */
  private sanitizeObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      return this.sanitizeString(obj);
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }
    if (obj && typeof obj === 'object') {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = this.sanitizeObject(value);
      }
      return sanitized;
    }
    return obj;
  }

  /**
   * Sanitize a string by removing potentially harmful content
   */
  private sanitizeString(str: string): string {
    // Basic HTML/script tag removal
    let sanitized = str
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<iframe[^>]*>[\s\S]*?<\/iframe>/gi, '')
      .replace(/<object[^>]*>[\s\S]*?<\/object>/gi, '')
      .replace(/<embed[^>]*>/gi, '')
      .replace(/<link[^>]*>/gi, '')
      .replace(/<meta[^>]*>/gi, '');

    // Remove javascript: protocol
    sanitized = sanitized.replace(/javascript:/gi, '');

    // Remove data: URLs (except safe image types)
    sanitized = sanitized.replace(/data:(?!image\/(png|jpg|jpeg|gif|svg\+xml))[^;,]*[;,]/gi, '');

    // Remove on* event handlers
    sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove SQL injection patterns
    sanitized = sanitized.replace(/(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi, '');

    // Remove XSS patterns
    sanitized = sanitized.replace(/(<|%3C)(\s*\/?\s*)(script|iframe|object|embed|meta|link)(\s*>|%3E)/gi, '');

    // Decode HTML entities to prevent double-encoding attacks
    sanitized = sanitized
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#x2F;/g, '/')
      .replace(/&amp;/g, '&');

    // Re-encode potentially dangerous characters
    sanitized = sanitized
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    return sanitized;
  }
}