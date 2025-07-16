import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private readonly reflector: Reflector) {
    super();
  }

  override canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    // Check if the route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  override handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // Check if the route is marked as optional auth
    const isOptional = this.reflector.getAllAndOverride<boolean>('isOptionalAuth', [
      context.getHandler(),
      context.getClass(),
    ]);

    // If auth is optional and no user, that's ok
    if (isOptional && !user && !err) {
      return null;
    }

    // If there's an error or no user, throw an exception
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }

    return user;
  }
}

/**
 * Decorator to mark routes as public (no authentication required)
 */
import { SetMetadata } from '@nestjs/common';

export const Public = () => SetMetadata('isPublic', true);

/**
 * Decorator to mark routes as having optional authentication
 */
export const OptionalAuth = () => SetMetadata('isOptionalAuth', true);