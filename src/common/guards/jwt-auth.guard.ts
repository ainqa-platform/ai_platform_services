import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppConfig } from '../../config/configuration';
import { verifyOrDecodeToken } from './jwt.util';

export interface AuthenticatedUser {
  personId?: string;
  roleName?: string;
  [claim: string]: unknown;
}

declare module 'express' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/**
 * Verifies the same JWT format the frontend already decodes via
 * safeDecodeJWT (src/utils/helperFunction.js), issued by the external IDM
 * service (REACT_APP_LOGIN_API_BASE_URL + /PractitionerLogin). See
 * jwt.util.ts for the verify-or-decode-with-warning behavior shared with
 * the Socket.IO gateway.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService<AppConfig, true>) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers?.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing bearer token');
    }
    const token = authHeader.slice('Bearer '.length);

    try {
      request.user = verifyOrDecodeToken(token, this.configService);
      return true;
    } catch (err) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
