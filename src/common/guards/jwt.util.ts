import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as jwt from 'jsonwebtoken';
import { AppConfig } from '../../config/configuration';
import { AuthenticatedUser } from './jwt-auth.guard';

const logger = new Logger('JwtVerification');
let warnedUnverified = false;

/**
 * Shared by JwtAuthGuard (HTTP) and OrchestratorGateway (Socket.IO) so both
 * transports apply the exact same verify-or-decode-with-warning behavior
 * described in jwt-auth.guard.ts.
 */
export function verifyOrDecodeToken(token: string, configService: ConfigService<AppConfig, true>): AuthenticatedUser {
  const verifyKey = configService.get('JWT_VERIFY_KEY', { infer: true });

  if (verifyKey) {
    const algorithm = configService.get('JWT_ALGORITHM', { infer: true }) as jwt.Algorithm;
    return jwt.verify(token, verifyKey, { algorithms: [algorithm] }) as AuthenticatedUser;
  }

  if (!warnedUnverified) {
    logger.warn(
      'JWT_VERIFY_KEY is not set - accepting tokens without signature verification. ' +
        'Set JWT_VERIFY_KEY before relying on this for real access control.',
    );
    warnedUnverified = true;
  }
  const decoded = jwt.decode(token) as AuthenticatedUser | null;
  if (!decoded) {
    throw new Error('Token could not be decoded');
  }
  return decoded;
}
