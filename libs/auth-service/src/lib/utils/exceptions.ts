import { HttpException, HttpStatus } from '@nestjs/common';

export class AuthException extends HttpException {
  constructor(message: string, status: HttpStatus = HttpStatus.UNAUTHORIZED) {
    super(message, status);
  }
}

export class InvalidCredentialsException extends AuthException {
  constructor(message = 'Invalid credentials') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class UserNotFoundException extends AuthException {
  constructor(message = 'User not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class UserAlreadyExistsException extends AuthException {
  constructor(message = 'User already exists') {
    super(message, HttpStatus.CONFLICT);
  }
}

export class EmailNotVerifiedException extends AuthException {
  constructor(message = 'Email not verified') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class AccountLockedException extends AuthException {
  constructor(message = 'Account locked') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class TokenExpiredException extends AuthException {
  constructor(message = 'Token expired') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class TokenInvalidException extends AuthException {
  constructor(message = 'Invalid token') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class TokenBlacklistedException extends AuthException {
  constructor(message = 'Token revoked') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class PasswordTooWeakException extends AuthException {
  constructor(message = 'Password too weak') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class PasswordReusedException extends AuthException {
  constructor(message = 'Password recently used') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class InsufficientPermissionsException extends AuthException {
  constructor(message = 'Insufficient permissions') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class SessionExpiredException extends AuthException {
  constructor(message = 'Session expired') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class DeviceNotRecognizedException extends AuthException {
  constructor(message = 'Device not recognized') {
    super(message, HttpStatus.UNAUTHORIZED);
  }
}

export class EmailSendFailedException extends AuthException {
  constructor(message = 'Failed to send email') {
    super(message, HttpStatus.INTERNAL_SERVER_ERROR);
  }
}

export class VerificationFailedException extends AuthException {
  constructor(message = 'Verification failed') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class PasswordResetFailedException extends AuthException {
  constructor(message = 'Password reset failed') {
    super(message, HttpStatus.BAD_REQUEST);
  }
}

export class RoleNotFoundException extends AuthException {
  constructor(message = 'Role not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class PermissionNotFoundException extends AuthException {
  constructor(message = 'Permission not found') {
    super(message, HttpStatus.NOT_FOUND);
  }
}

export class SessionLimitExceededException extends AuthException {
  constructor(message = 'Session limit exceeded') {
    super(message, HttpStatus.FORBIDDEN);
  }
}

export class RateLimitExceededException extends AuthException {
  constructor(message = 'Rate limit exceeded') {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}