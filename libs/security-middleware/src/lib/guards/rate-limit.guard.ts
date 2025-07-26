import { 
  Injectable, 
  CanActivate, 
  ExecutionContext, 
  ForbiddenException, 
  Logger,
  HttpException,
  HttpStatus 
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Response } from 'express';
import { RateLimitService } from '../services/rate-limit.service';
import { SecurityRequest, RateLimitRule } from '../types/security.types';
import { RATE_LIMIT_KEY } from '../decorators/security.decorators';

export interface RateLimitError extends HttpException {
  remaining: number;
  resetTime: number;
  totalHits: number;
  burstExceeded?: boolean;
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger(RateLimitGuard.name);

  constructor(
    private rateLimitService: RateLimitService,
    private reflector: Reflector
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    try {
      // Check if rate limiting should be skipped for this request
      if (this.rateLimitService.isWhitelisted(request)) {
        this.logger.debug(`Rate limiting skipped for whitelisted request: ${request.ip}`);
        return true;
      }

      // Get custom rate limit from decorator if present
      const customLimit = this.reflector.getAllAndOverride<RateLimitRule>(
        RATE_LIMIT_KEY,
        [context.getHandler(), context.getClass()]
      );

      // Determine if user is authenticated
      const isAuthenticated = !!(request.user && request.user.id);

      // Check rate limit
      const rateLimitResult = await this.rateLimitService.checkRateLimit({
        request,
        isAuthenticated,
        customLimit,
        checkBurst: true,
        adaptive: true,
      });

      // Add rate limit information to request for use by interceptors
      request.rateLimitInfo = {
        remaining: rateLimitResult.remaining,
        resetTime: rateLimitResult.resetTime,
        totalHits: rateLimitResult.totalHits,
        limit: this.getRateLimitFromResult(rateLimitResult, customLimit, isAuthenticated),
      };

      // Set security flags
      if (!request.securityFlags) {
        request.securityFlags = {};
      }
      request.securityFlags.rateLimited = !rateLimitResult.allowed;
      request.securityFlags.burstExceeded = rateLimitResult.burstExceeded;

      // Add rate limit headers to response
      this.addRateLimitHeaders(response, rateLimitResult, request.rateLimitInfo.limit);

      // Check if request should be blocked
      if (!rateLimitResult.allowed) {
        const errorMessage = this.createErrorMessage(rateLimitResult);
        
        this.logger.warn(
          `Rate limit exceeded for ${isAuthenticated ? 'authenticated user' : 'IP'} ` +
          `${isAuthenticated ? request.user?.id : request.ip}: ` +
          `${rateLimitResult.totalHits} requests, limit exceeded`
        );

        // Create detailed error
        const error = new ForbiddenException({
          message: errorMessage,
          error: 'Rate Limit Exceeded',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          rateLimitInfo: {
            remaining: rateLimitResult.remaining,
            resetTime: rateLimitResult.resetTime,
            totalHits: rateLimitResult.totalHits,
            retryAfter: Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000),
          },
        }) as RateLimitError;

        error.remaining = rateLimitResult.remaining;
        error.resetTime = rateLimitResult.resetTime;
        error.totalHits = rateLimitResult.totalHits;
        error.burstExceeded = rateLimitResult.burstExceeded;

        throw error;
      }

      // Log successful rate limit check for debugging
      this.logger.debug(
        `Rate limit check passed for ${isAuthenticated ? 'user' : 'IP'} ` +
        `${isAuthenticated ? request.user?.id : request.ip}: ` +
        `${rateLimitResult.totalHits}/${request.rateLimitInfo.limit} requests, ` +
        `${rateLimitResult.remaining} remaining`
      );

      return true;
    } catch (error) {
      // If it's already a rate limit error, re-throw it
      if (error instanceof ForbiddenException) {
        throw error;
      }

      // Log unexpected errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error(`Rate limit check failed: ${errorMessage}`, errorStack);

      // In production, we might want to fail-open (allow the request) 
      // when rate limiting service is unavailable
      if (process.env.NODE_ENV === 'production') {
        this.logger.warn('Rate limiting failed, allowing request (fail-open mode)');
        return true;
      }

      // In development, we can be more strict
      throw new ForbiddenException('Rate limiting service unavailable');
    }
  }

  private addRateLimitHeaders(
    response: Response, 
    rateLimitResult: any, 
    limit: number
  ): void {
    const resetTime = Math.ceil(rateLimitResult.resetTime / 1000);
    const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);

    // Standard rate limit headers (draft RFC)
    response.setHeader('X-RateLimit-Limit', limit.toString());
    response.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimitResult.remaining).toString());
    response.setHeader('X-RateLimit-Reset', resetTime.toString());

    // Additional headers for better debugging
    if (!rateLimitResult.allowed) {
      response.setHeader('X-RateLimit-RetryAfter', Math.max(1, retryAfter).toString());
      response.setHeader('Retry-After', Math.max(1, retryAfter).toString());
    }

    // Add burst information if available
    if (rateLimitResult.burstExceeded) {
      response.setHeader('X-RateLimit-Burst-Exceeded', 'true');
    }

    // Add adaptive information if available
    if (rateLimitResult.adaptiveLimit) {
      response.setHeader('X-RateLimit-Adaptive-Limit', rateLimitResult.adaptiveLimit.toString());
    }

    // Add window type information
    if (rateLimitResult.windowType) {
      response.setHeader('X-RateLimit-Window-Type', rateLimitResult.windowType);
    }
  }

  private createErrorMessage(rateLimitResult: any): string {
    const retryAfter = Math.ceil((rateLimitResult.resetTime - Date.now()) / 1000);
    
    if (rateLimitResult.burstExceeded) {
      return `Rate limit exceeded. Too many requests in a short burst. Please try again in ${retryAfter} seconds.`;
    }

    if (rateLimitResult.adaptiveLimit) {
      return `Rate limit exceeded due to high system load. Reduced limits are in effect. Please try again in ${retryAfter} seconds.`;
    }

    return `Rate limit exceeded. Please try again in ${retryAfter} seconds.`;
  }

  private getRateLimitFromResult(
    rateLimitResult: any, 
    customLimit: RateLimitRule | undefined, 
    isAuthenticated: boolean
  ): number {
    if (rateLimitResult.adaptiveLimit) {
      return rateLimitResult.adaptiveLimit;
    }

    if (customLimit) {
      return customLimit.requests;
    }

    // This is a fallback - in a real implementation, we'd need to get this from config
    return isAuthenticated ? 200 : 100;
  }
}