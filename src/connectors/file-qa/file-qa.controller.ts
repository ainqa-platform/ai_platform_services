import {
  BadRequestException,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { UsecasesService } from '../../usecases/usecases.service';
import { DocumentEntity } from './entities/document.entity';
import { IngestionService } from './ingestion/ingestion.service';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25MB

/** POST /api/usecase/:id/documents -- document upload for file_qa usecases. */
@Controller('api/usecase/:id/documents')
@UseGuards(JwtAuthGuard)
export class FileQaController {
  constructor(
    private readonly usecasesService: UsecasesService,
    private readonly ingestionService: IngestionService,
  ) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async uploadDocument(
    @Param('id', ParseUUIDPipe) usecaseId: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<DocumentEntity> {
    if (!file) {
      throw new BadRequestException('No file uploaded (expected multipart field "file")');
    }
    const usecase = await this.usecasesService.findOne(usecaseId);
    if (usecase.type !== 'file_qa') {
      throw new BadRequestException(`Usecase ${usecaseId} is not a file_qa usecase`);
    }

    return this.ingestionService.ingest(usecase, {
      filename: file.originalname,
      mimeType: file.mimetype,
      buffer: file.buffer,
    });
  }
}
