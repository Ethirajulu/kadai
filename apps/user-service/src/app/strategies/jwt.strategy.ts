import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtService } from '@kadai/auth-service';
import { UserRepository } from '../repositories/user.repository';
import { UserSessionRepository } from '../repositories/user-session.repository';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userRepository: UserRepository,
    private readonly userSessionRepository: UserSessionRepository,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'jwt-secret',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);
    
    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Use auth-service to verify token
    const tokenPayload = await this.jwtService.verifyAccessToken(token);

    // Get user from database
    const user = await this.userRepository.findById(tokenPayload.userId);
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

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      sessionId: session.id,
    };
  }
}