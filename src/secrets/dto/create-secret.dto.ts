import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { SecretKind } from '../entities/secret.entity';

export class CreateSecretDto {
  @IsOptional()
  @IsUUID()
  usecaseId?: string;

  @IsIn(['model_api_key', 'db_credential'])
  kind: SecretKind;

  @IsString()
  @MinLength(1)
  value: string;
}
