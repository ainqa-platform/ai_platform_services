import { IsIn, IsObject, IsOptional, IsString, MinLength } from 'class-validator';
import { UsecaseStatus } from '../entities/usecase.entity';

export class UpdateUsecaseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(['active', 'disabled'])
  status?: UsecaseStatus;

  // Validated against the existing record's `type` in usecases.service.ts --
  // a usecase's `type` is immutable after creation (changing it would mean
  // a different config shape entirely), so update never accepts `type`.
  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;
}
