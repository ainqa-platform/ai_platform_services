import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateSecretDto } from './dto/create-secret.dto';
import { SecretsService } from './secrets.service';

/**
 * Write-only by design: there is deliberately no GET /api/secrets/:id or
 * any route that returns ciphertext/plaintext. Callers get back only the
 * id, which is what gets stored as `config.secretRef` on a usecase.
 */
@Controller('api/secrets')
@UseGuards(JwtAuthGuard)
export class SecretsController {
  constructor(private readonly secretsService: SecretsService) {}

  @Post()
  async create(@Body() dto: CreateSecretDto): Promise<{ id: string }> {
    const secret = await this.secretsService.create({
      usecaseId: dto.usecaseId ?? null,
      kind: dto.kind,
      value: dto.value,
    });
    return { id: secret.id };
  }
}
