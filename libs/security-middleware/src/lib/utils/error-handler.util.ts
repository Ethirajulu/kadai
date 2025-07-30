import { Logger } from '@nestjs/common';

/**
 * Standardized error types for the security middleware
 */
export enum SecurityErrorType {
  PATH_TRAVERSAL = 'PATH_TRAVERSAL',
  CONNECTION_ERROR = 'CONNECTION_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  FILE_OPERATION_ERROR = 'FILE_OPERATION_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  CLEANUP_ERROR = 'CLEANUP_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
}

/**
 * Custom security error class with enhanced context
 */
export class SecurityError extends Error {
  public readonly type: SecurityErrorType;
  public readonly context?: Record<string, any>;
  public override readonly cause?: Error;

  constructor(
    message: string,
    type: SecurityErrorType,
    context?: Record<string, any>,
    cause?: Error
  ) {
    super(message);
    this.name = 'SecurityError';
    this.type = type;
    this.context = context;
    this.cause = cause;
  }
}

/**
 * Standardized error handling utility for consistent error management
 */
export class ErrorHandler {
  private static readonly DEFAULT_LOGGER = new Logger('SecurityMiddleware');

  /**
   * Handle and log errors with proper categorization
   */
  static handle(
    error: unknown,
    context: string,
    logger: Logger = ErrorHandler.DEFAULT_LOGGER,
    additionalContext?: Record<string, any>
  ): SecurityError {
    let securityError: SecurityError;

    if (error instanceof SecurityError) {
      securityError = error;
    } else if (error instanceof Error) {
      // Categorize common errors
      const errorType = ErrorHandler.categorizeError(error);
      securityError = new SecurityError(
        error.message,
        errorType,
        { originalContext: context, ...additionalContext },
        error
      );
    } else {
      securityError = new SecurityError(
        String(error),
        SecurityErrorType.CLEANUP_ERROR,
        { originalContext: context, ...additionalContext }
      );
    }

    // Log with appropriate level based on error type
    const logLevel = ErrorHandler.getLogLevel(securityError.type);
    const logMessage = `${context}: ${securityError.message}`;
    const logContext = {
      errorType: securityError.type,
      context: securityError.context,
      stack: securityError.stack,
    };

    switch (logLevel) {
      case 'error':
        logger.error(logMessage, logContext);
        break;
      case 'warn':
        logger.warn(logMessage, logContext);
        break;
      case 'debug':
        logger.debug(logMessage, logContext);
        break;
    }

    return securityError;
  }

  /**
   * Handle connection errors with retry information
   */
  static handleConnectionError(
    error: unknown,
    service: string,
    attempt: number,
    maxAttempts: number,
    logger: Logger = ErrorHandler.DEFAULT_LOGGER
  ): SecurityError {
    const securityError = new SecurityError(
      `${service} connection failed`,
      SecurityErrorType.CONNECTION_ERROR,
      {
        service,
        attempt,
        maxAttempts,
        willRetry: attempt < maxAttempts,
      },
      error instanceof Error ? error : new Error(String(error))
    );

    const logMessage = `${service} connection attempt ${attempt}/${maxAttempts} failed: ${securityError.message}`;

    if (attempt < maxAttempts) {
      logger.warn(logMessage, { context: securityError.context });
    } else {
      logger.error(logMessage, { context: securityError.context });
    }

    return securityError;
  }

  /**
   * Handle path traversal validation
   */
  static validatePath(filePath: string, context: string): string {
    if (!filePath || typeof filePath !== 'string') {
      throw new SecurityError(
        'Invalid file path provided',
        SecurityErrorType.PATH_TRAVERSAL,
        { filePath, context }
      );
    }

    // Check for path traversal attempts
    const normalizedPath = filePath.replace(/\\/g, '/');
    if (normalizedPath.includes('../') || normalizedPath.includes('..\\')) {
      throw new SecurityError(
        'Path traversal attempt detected',
        SecurityErrorType.PATH_TRAVERSAL,
        { filePath: normalizedPath, context }
      );
    }

    // Check for absolute path attempts (only relative paths allowed)
    if (normalizedPath.startsWith('/') || /^[a-zA-Z]:/.test(normalizedPath)) {
      throw new SecurityError(
        'Absolute path not allowed',
        SecurityErrorType.PATH_TRAVERSAL,
        { filePath: normalizedPath, context }
      );
    }

    // Additional security checks
    const forbiddenPatterns = [
      /\\x00/, // Null bytes
      /[<>:"|?*]/, // Windows forbidden characters
      /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i, // Windows reserved names
    ];

    for (const pattern of forbiddenPatterns) {
      if (pattern.test(normalizedPath)) {
        throw new SecurityError(
          'Invalid characters in path',
          SecurityErrorType.PATH_TRAVERSAL,
          { filePath: normalizedPath, context, pattern: pattern.source }
        );
      }
    }

    return normalizedPath;
  }

  /**
   * Create formatted error message for stats
   */
  static formatErrorForStats(error: SecurityError, operation: string): string {
    return `${operation}: ${error.message}${
      error.context ? ` (${JSON.stringify(error.context)})` : ''
    }`;
  }

  /**
   * Categorize errors based on common patterns
   */
  private static categorizeError(error: Error): SecurityErrorType {
    const message = error.message.toLowerCase();
    const stack = error.stack?.toLowerCase() || '';

    // Connection-related errors
    if (
      message.includes('connection') ||
      message.includes('timeout') ||
      message.includes('econnrefused') ||
      message.includes('redis') ||
      message.includes('elasticsearch')
    ) {
      return SecurityErrorType.CONNECTION_ERROR;
    }

    // File operation errors
    if (
      message.includes('enoent') ||
      message.includes('eacces') ||
      message.includes('file') ||
      message.includes('directory') ||
      stack.includes('fs.')
    ) {
      return SecurityErrorType.FILE_OPERATION_ERROR;
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return SecurityErrorType.TIMEOUT_ERROR;
    }

    // Validation errors
    if (
      message.includes('validation') ||
      message.includes('invalid') ||
      message.includes('required')
    ) {
      return SecurityErrorType.VALIDATION_ERROR;
    }

    // Default to cleanup error
    return SecurityErrorType.CLEANUP_ERROR;
  }

  /**
   * Get appropriate log level for error type
   */
  private static getLogLevel(
    errorType: SecurityErrorType
  ): 'error' | 'warn' | 'debug' {
    switch (errorType) {
      case SecurityErrorType.PATH_TRAVERSAL:
      case SecurityErrorType.CONNECTION_ERROR:
        return 'error';
      case SecurityErrorType.FILE_OPERATION_ERROR:
      case SecurityErrorType.TIMEOUT_ERROR:
        return 'warn';
      case SecurityErrorType.VALIDATION_ERROR:
      case SecurityErrorType.CLEANUP_ERROR:
      case SecurityErrorType.CONFIGURATION_ERROR:
        return 'debug';
      default:
        return 'error';
    }
  }
}

/**
 * Utility function for safe path operations
 */
export class PathValidator {
  /**
   * Safely extract filename from path preventing traversal
   */
  static safeBasename(filePath: string): string {
    const validatedPath = ErrorHandler.validatePath(filePath, 'safeBasename');
    const parts = validatedPath.split('/');
    const filename = parts[parts.length - 1];

    if (!filename || filename === '.' || filename === '..') {
      throw new SecurityError(
        'Invalid filename extracted from path',
        SecurityErrorType.PATH_TRAVERSAL,
        { filePath: validatedPath, extractedFilename: filename }
      );
    }

    return filename;
  }

  /**
   * Safely join paths preventing traversal
   */
  static safeJoin(basePath: string, ...paths: string[]): string {
    let result = ErrorHandler.validatePath(basePath, 'safeJoin.basePath');

    for (const path of paths) {
      const validatedPath = ErrorHandler.validatePath(path, 'safeJoin.path');
      result = result.endsWith('/')
        ? result + validatedPath
        : result + '/' + validatedPath;
    }

    return result;
  }
}
