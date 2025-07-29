/**
 * Sanitization configuration types
 */

export interface SanitizationRule {
  name: string;
  description: string;
  pattern: RegExp;
  replacement: string;
  enabled: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface SanitizationConfig {
  enabled: boolean;
  rules: {
    htmlTags: SanitizationRule[];
    scriptTags: SanitizationRule[];
    eventHandlers: SanitizationRule[];
    protocols: SanitizationRule[];
    dataUrls: SanitizationRule[];
    sqlInjection: SanitizationRule[];
    xssPatterns: SanitizationRule[];
    htmlEntities: SanitizationRule[];
  };
  customRules?: SanitizationRule[];
  strictMode: boolean;
  maxStringLength: number;
  logSanitizations: boolean;
}

export interface SanitizationResult {
  originalValue: string;
  sanitizedValue: string;
  rulesApplied: string[];
  wasModified: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
}

export const DEFAULT_SANITIZATION_CONFIG: SanitizationConfig = {
  enabled: true,
  strictMode: false,
  maxStringLength: 10000,
  logSanitizations: true,
  rules: {
    htmlTags: [
      {
        name: 'script-tags',
        description: 'Remove script tags',
        pattern: /<script[^>]*>[\s\S]*?<\/script>/gi,
        replacement: '',
        enabled: true,
        severity: 'critical',
      },
      {
        name: 'iframe-tags',
        description: 'Remove iframe tags',
        pattern: /<iframe[^>]*>[\s\S]*?<\/iframe>/gi,
        replacement: '',
        enabled: true,
        severity: 'high',
      },
      {
        name: 'object-tags',
        description: 'Remove object tags',
        pattern: /<object[^>]*>[\s\S]*?<\/object>/gi,
        replacement: '',
        enabled: true,
        severity: 'high',
      },
      {
        name: 'embed-tags',
        description: 'Remove embed tags',
        pattern: /<embed[^>]*>/gi,
        replacement: '',
        enabled: true,
        severity: 'high',
      },
      {
        name: 'link-tags',
        description: 'Remove link tags',
        pattern: /<link[^>]*>/gi,
        replacement: '',
        enabled: true,
        severity: 'medium',
      },
      {
        name: 'meta-tags',
        description: 'Remove meta tags',
        pattern: /<meta[^>]*>/gi,
        replacement: '',
        enabled: true,
        severity: 'medium',
      },
    ],
    scriptTags: [
      {
        name: 'dangerous-html-tags',
        description: 'Remove potentially dangerous HTML tags',
        pattern: /(<|%3C)(\s*\/?\s*)(script|iframe|object|embed|meta|link)(\s*>|%3E)/gi,
        replacement: '',
        enabled: true,
        severity: 'critical',
      },
    ],
    eventHandlers: [
      {
        name: 'event-handlers',
        description: 'Remove on* event handlers',
        pattern: /\s*on\w+\s*=\s*["'][^"']*["']/gi,
        replacement: '',
        enabled: true,
        severity: 'high',
      },
    ],
    protocols: [
      {
        name: 'javascript-protocol',
        description: 'Remove javascript: protocol',
        pattern: /javascript:/gi,
        replacement: '',
        enabled: true,
        severity: 'critical',
      },
    ],
    dataUrls: [
      {
        name: 'unsafe-data-urls',
        description: 'Remove unsafe data URLs (except safe image types)',
        pattern: /data:(?!image\/(png|jpg|jpeg|gif|svg\+xml))[^;,]*[;,]/gi,
        replacement: '',
        enabled: true,
        severity: 'medium',
      },
    ],
    sqlInjection: [
      {
        name: 'basic-sql-keywords',
        description: 'Remove basic SQL injection patterns',
        pattern: /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/gi,
        replacement: '',
        enabled: true,
        severity: 'high',
      },
    ],
    xssPatterns: [
      {
        name: 'xss-patterns',
        description: 'Remove XSS patterns',
        pattern: /(<|%3C)(\s*\/?\s*)(script|iframe|object|embed|meta|link)(\s*>|%3E)/gi,
        replacement: '',
        enabled: true,
        severity: 'critical',
      },
    ],
    htmlEntities: [
      {
        name: 'decode-html-entities',
        description: 'Decode HTML entities to prevent double-encoding attacks',
        pattern: /&lt;/g,
        replacement: '<',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'decode-gt',
        description: 'Decode greater than entities',
        pattern: /&gt;/g,
        replacement: '>',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'decode-quotes',
        description: 'Decode quote entities',
        pattern: /&quot;/g,
        replacement: '"',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'decode-apostrophe',
        description: 'Decode apostrophe entities',
        pattern: /&#x27;/g,
        replacement: "'",
        enabled: true,
        severity: 'low',
      },
      {
        name: 'decode-slash',
        description: 'Decode slash entities',
        pattern: /&#x2F;/g,
        replacement: '/',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'decode-amp',
        description: 'Decode ampersand entities',
        pattern: /&amp;/g,
        replacement: '&',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'encode-lt',
        description: 'Re-encode less than characters',
        pattern: /</g,
        replacement: '&lt;',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'encode-gt',
        description: 'Re-encode greater than characters',
        pattern: />/g,
        replacement: '&gt;',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'encode-quotes',
        description: 'Re-encode quote characters',
        pattern: /"/g,
        replacement: '&quot;',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'encode-apostrophe',
        description: 'Re-encode apostrophe characters',
        pattern: /'/g,
        replacement: '&#x27;',
        enabled: true,
        severity: 'low',
      },
      {
        name: 'encode-slash',
        description: 'Re-encode slash characters',
        pattern: /\//g,
        replacement: '&#x2F;',
        enabled: true,
        severity: 'low',
      },
    ],
  },
};