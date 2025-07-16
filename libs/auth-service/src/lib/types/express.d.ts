import { JwtPayload } from '../models/auth.model';

declare global {
  namespace Express {
    interface Request {
      jwtUser?: JwtPayload;
      jwtToken?: string;
    }
  }
}

export {};