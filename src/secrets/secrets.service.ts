import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { Repository } from 'typeorm';
import { AppConfig } from '../config/configuration';
import { SecretEntity, SecretKind } from './entities/secret.entity';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Encrypts model API keys / DB credentials at rest (AES-256-GCM). This is
 * the module that closes the plaintext-secret gap found in
 * src/pages/UseCase.tsx (apikey stored/returned in plaintext) and
 * src/components/smartchats/Layout.js's `LLMModels` table reads -- no route
 * on this server ever returns a decrypted value; `reveal()` is for
 * server-side callers only (llm-gateway, connector executors).
 */
@Injectable()
export class SecretsService {
  private readonly logger = new Logger(SecretsService.name);

  constructor(
    @InjectRepository(SecretEntity) private readonly secretRepository: Repository<SecretEntity>,
    private readonly configService: ConfigService<AppConfig, true>,
  ) {}

  private getMasterKey(): Buffer {
    const hex = this.configService.get('SECRETS_MASTER_KEY', { infer: true });
    if (!hex) {
      throw new InternalServerErrorException(
        'SECRETS_MASTER_KEY is not configured - cannot create or reveal secrets',
      );
    }
    return Buffer.from(hex, 'hex');
  }

  async create(params: { usecaseId: string | null; kind: SecretKind; value: string }): Promise<SecretEntity> {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.getMasterKey(), iv);
    const ciphertext = Buffer.concat([cipher.update(params.value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const entity = this.secretRepository.create({
      usecaseId: params.usecaseId,
      kind: params.kind,
      ciphertext,
      iv,
      authTag,
    });
    return this.secretRepository.save(entity);
  }

  /**
   * Server-side only. Never call this from a controller method that returns
   * its result to an HTTP response.
   */
  async reveal(secretId: string): Promise<string> {
    const secret = await this.secretRepository.findOneByOrFail({ id: secretId });
    const decipher = createDecipheriv(ALGORITHM, this.getMasterKey(), secret.iv);
    decipher.setAuthTag(secret.authTag);
    const plaintext = Buffer.concat([decipher.update(secret.ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }

  async delete(secretId: string): Promise<void> {
    await this.secretRepository.delete({ id: secretId });
  }
}
