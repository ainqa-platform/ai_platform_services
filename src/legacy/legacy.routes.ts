import express from 'express';

import type { NestExpressApplication } from '@nestjs/platform-express';

import patientRoutes from './ebm-v1/src/routes/patientRoutes';
import { errorHandler } from './ebm-v3/src/middlewares/errorHandler';
import configRoutes from './ebm-v3/src/routes/configRoutes';
import postgressRoutes from './ebm-v3/src/routes/postgressRoutes';

/**
 * The three EBM endpoint groups ainqa-ai-platform actually calls, moved here
 * from the two standalone services:
 *
 *   /api/config          <- ebm-service-v3  (Signin.tsx -> platform_config rows)
 *   /api/postgress/*     <- ebm-service-v3  (search/insert/update/delete)
 *   /api/patients/*      <- ebm-service-v1  (callgpt, callpista, postpista, ...)
 *
 * They are mounted as the original Express routers rather than rewritten as
 * Nest controllers, so the request/response contract the frontend depends on is
 * byte-for-byte unchanged. None of these paths collide with the existing Nest
 * controllers (api/health, api/version, api/secrets, api/usecases,
 * api/usecase/:id/*).
 */
export const LEGACY_BODY_LIMIT = process.env.LEGACY_BODY_LIMIT || '25mb';

export function mountLegacyEbmRoutes(app: NestExpressApplication): void {
  // Called from bootstrap() before app.listen(): Nest's init() installs a
  // catch-all not-found handler, so anything mounted after it never runs.
  // Mounting first means Nest's body parser has not been registered yet, hence
  // the explicit express.json() on each mount (a no-op if a body was already
  // parsed upstream). Unmatched paths fall through to Nest's own routes.
  const server = app.getHttpAdapter().getInstance() as express.Express;
  const json = express.json({ limit: LEGACY_BODY_LIMIT });

  server.use('/api/patients', json, patientRoutes);
  server.use('/api/config', json, configRoutes);
  server.use('/api/postgress', json, postgressRoutes);

  // ebm-service-v3's error middleware, so ApiError instances thrown by the
  // legacy handlers keep their original status codes and JSON shape.
  server.use(errorHandler);
}
