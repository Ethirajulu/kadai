import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SecurityRequest } from '../types/security.types';
import {
  SanitizationConfig,
  SanitizationRule,
  SanitizationResult,
  DEFAULT_SANITIZATION_CONFIG,
} from '../types/sanitization.types';

@Injectable()
export class ConfigurableSanitizationService {
  private readonly logger = new Logger(ConfigurableSanitizationService.name);
  private readonly config: SanitizationConfig;

  constructor(private configService: ConfigService) {
    this.config = this.loadSanitizationConfig();
  }

  /**
   * Load sanitization configuration from environment or use defaults
   */
  private loadSanitizationConfig(): SanitizationConfig {
    const baseConfig = { ...DEFAULT_SANITIZATION_CONFIG };
    
    // Override with environment-specific settings
    baseConfig.enabled = this.configService.get<boolean>('security.sanitization.enabled', true);
    baseConfig.strictMode = this.configService.get<boolean>('security.sanitization.strictMode', false);
    baseConfig.maxStringLength = this.configService.get<number>('security.sanitization.maxStringLength', 10000);
    baseConfig.logSanitizations = this.configService.get<boolean>('security.sanitization.logSanitizations', true);

    // Allow custom rules from configuration
    const customRules = this.configService.get<SanitizationRule[]>('security.sanitization.customRules');
    if (customRules && Array.isArray(customRules)) {
      baseConfig.customRules = customRules;
    }

    return baseConfig;
  }

  /**
   * Sanitize request data if sanitization is enabled
   */
  sanitizeRequest(req: SecurityRequest): void {
    if (!this.config.enabled) {
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
   * Sanitize a string using the configured rules
   */
  sanitizeString(input: string): SanitizationResult {
    if (!this.config.enabled || typeof input !== 'string') {
      return {
        originalValue: input,
        sanitizedValue: input,
        rulesApplied: [],
        wasModified: false,
        severity: 'low',
      };
    }

    // Check string length
    if (input.length > this.config.maxStringLength) {
      const truncated = input.substring(0, this.config.maxStringLength);
      if (this.config.logSanitizations) {
        this.logger.warn(`String truncated from ${input.length} to ${this.config.maxStringLength} characters`);
      }
      input = truncated;
    }

    let sanitized = input;
    const rulesApplied: string[] = [];
    let highestSeverity: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Apply all rule categories
    const allRuleCategories = [
      ...this.config.rules.htmlTags,
      ...this.config.rules.scriptTags,
      ...this.config.rules.eventHandlers,
      ...this.config.rules.protocols,
      ...this.config.rules.dataUrls,
      ...this.config.rules.sqlInjection,
      ...this.config.rules.xssPatterns,
      ...this.config.rules.htmlEntities,
    ];

    // Add custom rules if available
    if (this.config.customRules) {
      allRuleCategories.push(...this.config.customRules);
    }

    // Apply each enabled rule
    for (const rule of allRuleCategories) {
      if (!rule.enabled) {
        continue;
      }

      const beforeSanitization = sanitized;
      sanitized = sanitized.replace(rule.pattern, rule.replacement);

      if (beforeSanitization !== sanitized) {
        rulesApplied.push(rule.name);
        
        // Update highest severity
        if (this.getSeverityLevel(rule.severity) > this.getSeverityLevel(highestSeverity)) {
          highestSeverity = rule.severity;
        }

        if (this.config.logSanitizations) {
          this.logger.warn(`Sanitization rule '${rule.name}' applied`, {
            rule: rule.description,
            severity: rule.severity,
            originalLength: beforeSanitization.length,
            sanitizedLength: sanitized.length,
          });
        }
      }
    }

    const result: SanitizationResult = {
      originalValue: input,
      sanitizedValue: sanitized,
      rulesApplied,
      wasModified: input !== sanitized,
      severity: highestSeverity,
    };

    return result;
  }

  /**
   * Recursively sanitize an object
   */
  private sanitizeObject(obj: unknown): unknown {
    if (typeof obj === 'string') {
      const result = this.sanitizeString(obj);
      return result.sanitizedValue;
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
   * Get numeric severity level for comparison
   */
  private getSeverityLevel(severity: 'low' | 'medium' | 'high' | 'critical'): number {
    switch (severity) {
      case 'low': return 1;
      case 'medium': return 2;
      case 'high': return 3;
      case 'critical': return 4;
      default: return 1;
    }
  }

  /**
   * Add a custom sanitization rule
   */
  addCustomRule(rule: SanitizationRule): void {
    if (!this.config.customRules) {
      this.config.customRules = [];
    }
    this.config.customRules.push(rule);
    
    this.logger.log(`Added custom sanitization rule: ${rule.name}`);
  }

  /**
   * Enable or disable a specific rule
   */
  toggleRule(ruleName: string, enabled: boolean): boolean {
    const allRuleCategories = [
      ...this.config.rules.htmlTags,
      ...this.config.rules.scriptTags,
      ...this.config.rules.eventHandlers,
      ...this.config.rules.protocols,
      ...this.config.rules.dataUrls,
      ...this.config.rules.sqlInjection,
      ...this.config.rules.xssPatterns,
      ...this.config.rules.htmlEntities,
    ];

    if (this.config.customRules) {
      allRuleCategories.push(...this.config.customRules);
    }

    const rule = allRuleCategories.find(r => r.name === ruleName);
    if (rule) {
      rule.enabled = enabled;
      this.logger.log(`${enabled ? 'Enabled' : 'Disabled'} sanitization rule: ${ruleName}`);
      return true;
    }

    this.logger.warn(`Sanitization rule not found: ${ruleName}`);
    return false;
  }

  /**
   * Get current sanitization configuration
   */
  getConfig(): SanitizationConfig {
    return { ...this.config }; // Return a copy to prevent external modifications
  }

  /**
   * Get list of all available rules
   */
  getAllRules(): SanitizationRule[] {
    const allRules = [
      ...this.config.rules.htmlTags,
      ...this.config.rules.scriptTags,
      ...this.config.rules.eventHandlers,
      ...this.config.rules.protocols,
      ...this.config.rules.dataUrls,
      ...this.config.rules.sqlInjection,
      ...this.config.rules.xssPatterns,
      ...this.config.rules.htmlEntities,
    ];

    if (this.config.customRules) {
      allRules.push(...this.config.customRules);
    }

    return allRules;
  }

  /**
   * Get statistics about sanitization rules
   */
  getRuleStatistics(): {
    totalRules: number;
    enabledRules: number;
    rulesBySeverity: Record<string, number>;
    rulesByCategory: Record<string, number>;
  } {
    const allRules = this.getAllRules();
    const enabledRules = allRules.filter(rule => rule.enabled);
    
    const rulesBySeverity = allRules.reduce((acc, rule) => {
      acc[rule.severity] = (acc[rule.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const rulesByCategory = {
      htmlTags: this.config.rules.htmlTags.length,
      scriptTags: this.config.rules.scriptTags.length,
      eventHandlers: this.config.rules.eventHandlers.length,
      protocols: this.config.rules.protocols.length,
      dataUrls: this.config.rules.dataUrls.length,
      sqlInjection: this.config.rules.sqlInjection.length,
      xssPatterns: this.config.rules.xssPatterns.length,
      htmlEntities: this.config.rules.htmlEntities.length,
      custom: this.config.customRules?.length || 0,
    };

    return {
      totalRules: allRules.length,
      enabledRules: enabledRules.length,
      rulesBySeverity,
      rulesByCategory,
    };
  }
}