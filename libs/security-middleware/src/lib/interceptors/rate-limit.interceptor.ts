import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { Response } from 'express';
import { RateLimitService } from '../services/rate-limit.service';
import { SecurityRequest } from '../types/security.types';

@Injectable()
export class RateLimitInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitInterceptor.name);

  constructor(private rateLimitService: RateLimitService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<SecurityRequest>();
    const response = context.switchToHttp().getResponse<Response>();
    const startTime = Date.now();

    return next.handle().pipe(
      tap(async (data) => {
        // On successful response, update rate limit headers if not already set
        await this.updateRateLimitHeaders(request, response);
        
        // Log rate limit metrics for monitoring
        this.logRateLimitMetrics(request, response, Date.now() - startTime, 'success');
      }),
      catchError(async (error) => {
        // On error response, still update headers for rate limit information
        await this.updateRateLimitHeaders(request, response);
        
        // Log rate limit metrics for errors
        this.logRateLimitMetrics(request, response, Date.now() - startTime, 'error');
        
        throw error;
      })
    );
  }

  private async updateRateLimitHeaders(
    request: SecurityRequest, 
    response: Response
  ): Promise<void> {
    try {
      // Skip if headers are already set (by guard)
      if (response.getHeader('X-RateLimit-Limit')) {
        return;
      }

      // Get current rate limit status
      const isAuthenticated = !!(request.user && request.user.id);
      const status = await this.rateLimitService.getRateLimitStatus({
        request,
        isAuthenticated,
      });

      // Set rate limit headers
      response.setHeader('X-RateLimit-Limit', status.limit.toString());
      response.setHeader('X-RateLimit-Remaining', status.remaining.toString());
      response.setHeader('X-RateLimit-Reset', Math.ceil(status.resetTime / 1000).toString());

      // Add adaptive information if available
      if (status.isAdaptive && status.systemLoad) {
        response.setHeader('X-RateLimit-Adaptive', 'true');
        response.setHeader('X-RateLimit-System-Load', 
          JSON.stringify({
            cpu: Math.round(status.systemLoad.cpu),
            memory: Math.round(status.systemLoad.memory)
          })
        );
      }

      // Add cache-related headers for better client behavior
      if (status.remaining === 0) {
        const retryAfter = Math.ceil((status.resetTime - Date.now()) / 1000);
        response.setHeader('Retry-After', Math.max(1, retryAfter).toString());
      }

      // Add informational headers
      response.setHeader('X-RateLimit-Policy', this.getRateLimitPolicy(isAuthenticated));
      
    } catch (error) {
      this.logger.warn('Failed to update rate limit headers', error);
      // Don't throw error here as it would break the response
    }
  }

  private getRateLimitPolicy(isAuthenticated: boolean): string {
    // Return a human-readable policy description
    if (isAuthenticated) {
      return 'authenticated:200req/15min,burst:50req/1min';
    } else {
      return 'anonymous:100req/15min,burst:20req/1min';
    }
  }

  private logRateLimitMetrics(
    request: SecurityRequest,
    response: Response,
    duration: number,
    result: 'success' | 'error'
  ): void {
    try {
      const rateLimitInfo = request.rateLimitInfo;
      const isAuthenticated = !!(request.user && request.user.id);
      const clientId = isAuthenticated ? request.user?.id : request.ip;
      
      // Create metrics object
      const metrics = {
        timestamp: new Date().toISOString(),
        clientId,
        isAuthenticated,
        method: request.method,
        path: request.path,
        statusCode: response.statusCode,
        duration,
        result,
        rateLimitInfo: rateLimitInfo ? {
          remaining: rateLimitInfo.remaining,
          limit: rateLimitInfo.limit,
          resetTime: new Date(rateLimitInfo.resetTime).toISOString(),
          totalHits: rateLimitInfo.totalHits,
        } : undefined,
        securityFlags: request.securityFlags,
        userAgent: request.headers['user-agent'],
        origin: request.headers.origin,
      };

      // Log based on severity
      if (request.securityFlags?.rateLimited) {
        this.logger.warn('Rate limit exceeded', metrics);
      } else if (rateLimitInfo && rateLimitInfo.remaining < 10) {
        this.logger.warn('Rate limit approaching', metrics);
      } else {
        this.logger.debug('Rate limit check completed', metrics);
      }

      // In a production environment, you might want to send these metrics
      // to a monitoring service like DataDog, New Relic, or CloudWatch
      this.sendMetricsToMonitoring(metrics);
      
    } catch (error) {
      this.logger.error('Failed to log rate limit metrics', error);
    }
  }

  private sendMetricsToMonitoring(metrics: any): void {
    // Placeholder for sending metrics to external monitoring service
    // In a real implementation, you might use:
    // - DataDog StatsD client
    // - New Relic custom metrics
    // - CloudWatch custom metrics
    // - Prometheus metrics
    // - Custom analytics service
    
    if (process.env.NODE_ENV === 'development') {
      // In development, just log the metrics structure
      this.logger.debug('Metrics would be sent to monitoring service', {
        metricsType: 'rate_limit',
        tags: {
          authenticated: metrics.isAuthenticated,
          method: metrics.method,
          result: metrics.result,
          rateLimited: metrics.securityFlags?.rateLimited || false,
        },
        values: {
          duration: metrics.duration,
          remaining: metrics.rateLimitInfo?.remaining || 0,
          totalHits: metrics.rateLimitInfo?.totalHits || 0,
        },
      });
    }

    // Example integration with different monitoring services:
    
    // DataDog StatsD
    // this.statsd?.increment('rate_limit.requests', 1, {
    //   authenticated: metrics.isAuthenticated.toString(),
    //   result: metrics.result,
    //   rate_limited: (metrics.securityFlags?.rateLimited || false).toString(),
    // });

    // New Relic
    // newrelic.recordCustomEvent('RateLimit', {
    //   authenticated: metrics.isAuthenticated,
    //   remaining: metrics.rateLimitInfo?.remaining || 0,
    //   duration: metrics.duration,
    // });

    // Prometheus
    // this.rateLimitRequestsTotal?.inc({
    //   method: metrics.method,
    //   authenticated: metrics.isAuthenticated.toString(),
    //   result: metrics.result,
    // });
  }

}