import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SecretEntity } from './entities/secret.entity';
import { SecretsController } from './secrets.controller';
import { SecretsService } from './secrets.service';

@Module({
  imports: [TypeOrmModule.forFeature([SecretEntity])],
  controllers: [SecretsController],
  providers: [SecretsService],
  exports: [SecretsService],
})
export class SecretsModule {}
