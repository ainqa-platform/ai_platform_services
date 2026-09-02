import { IsArray, IsBoolean, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class AttachmentDto {
  @IsUUID()
  documentId: string;
}

export class SendMessageDto {
  @IsUUID()
  sessionId: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsArray()
  attachments?: AttachmentDto[];

  @IsOptional()
  @IsBoolean()
  stream?: boolean;

  @IsOptional()
  @IsString()
  sourceId?: string;
}
