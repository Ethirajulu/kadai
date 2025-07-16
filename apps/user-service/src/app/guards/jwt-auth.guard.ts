import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@kadai/auth-service';
import { UserRepository } from '../repositories/user.repository';
import { UserSessionRepository } from '../repositories/user-session.repository';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = this.extractTokenFromHeader(request);

    if (!token) {
      throw new UnauthorizedException('Access token not found');
    }

    try {
      // Use auth-service to verify token
      const payload = await this.jwtService.verifyAccessToken(token);

      // Get user from database
      const user = await this.userRepository.findById(payload.userId);
      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Check if user is active
      if (!user.canLogin()) {
        throw new UnauthorizedException('User account is not active');
      }

      // Check if session exists and is valid
      const session = await this.userSessionRepository.findByToken(token);
      if (!session || !session.canBeUsed()) {
        throw new UnauthorizedException('Session not found or expired');
      }

      // Update last activity
      await this.userSessionRepository.updateLastActivity(session.id);

      // Attach user info to request
      request.user = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        sessionId: session.id,
      };

      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}

@Injectable()
export class OptionalJwtAuthGuard extends JwtAuthGuard {
  override async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      return await super.canActivate(context);
    } catch {
      // If token is invalid or missing, continue without user info
      return true;
    }
  }
}