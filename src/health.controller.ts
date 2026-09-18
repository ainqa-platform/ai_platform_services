import { Controller, Get } from '@nestjs/common';
import { version } from '../package.json';

@Controller('api')
export class HealthController {
  @Get('health')
  check(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('version')
  getVersion(): { version: string } {
    return { version };
  }
}
