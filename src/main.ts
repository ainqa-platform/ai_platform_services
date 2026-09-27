import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { AppConfig } from './config/configuration';
import { LEGACY_BODY_LIMIT, mountLegacyEbmRoutes } from './legacy/legacy.routes';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const configService = app.get(ConfigService<AppConfig, true>);

  // Registered on the underlying Express instance immediately, so it also
  // covers the legacy mounts below.
  app.enableCors({ origin: configService.get('CORS_ORIGIN', { infer: true }), credentials: true });

  // ebm-service-v3 ran with express.json({ limit: "10mb" }); discharge-summary
  // payloads posted to /api/patients/postpista are larger than Nest's 100kb
  // default, so raise the global limit before the parser is registered.
  app.useBodyParser('json', { limit: LEGACY_BODY_LIMIT });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  // Must come before listen()/init(): Nest registers a catch-all not-found
  // handler while initializing, and anything mounted after it is unreachable.
  mountLegacyEbmRoutes(app);

  const port = configService.get('PORT', { infer: true });
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`ainqa-ai-platform server listening on :${port}`);
}

bootstrap();
