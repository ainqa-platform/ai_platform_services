import { Controller, Get } from '@nestjs/common';
import { version } from '../package.json';

// No controller-level prefix: /getversion is served at the service root because
// the API gateway strips its /aiplatformsvc prefix before forwarding, so
// https://api-dev.infinity.ainqaplatform.in/aiplatformsvc/getversion arrives
// here as GET /getversion. The /api/* routes keep their prefix inline.
@Controller()
export class HealthController {
  @Get('api/health')
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('api/version')
  getVersion(): { version: string } {
    return { version };
  }

  // Same value as /api/version, exposed unprefixed for the gateway URL above.
  @Get('getversion')
  getVersionUnprefixed(): { version: string } {
    return { version };
  }
}
