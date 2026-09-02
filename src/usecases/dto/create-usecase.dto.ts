import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { UsecaseType } from '../entities/usecase.entity';

export class CreateUsecaseDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['chat', 'file_qa', 'db_search', 'db_analytics'])
  type: UsecaseType;

  // Structurally validated against the per-type zod schema in
  // usecases.service.ts (see usecase-config.schema.ts) -- not validated by
  // class-validator here since the shape is discriminated by `type`.
  @IsObject()
  config: Record<string, unknown>;
}
