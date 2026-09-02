import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedUser, JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CreateUsecaseDto } from './dto/create-usecase.dto';
import { UpdateUsecaseDto } from './dto/update-usecase.dto';
import { UsecaseEntity } from './entities/usecase.entity';
import { UsecasesService } from './usecases.service';

@Controller('api/usecases')
@UseGuards(JwtAuthGuard)
export class UsecasesController {
  constructor(private readonly usecasesService: UsecasesService) {}

  @Get()
  findAll(): Promise<UsecaseEntity[]> {
    return this.usecasesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<UsecaseEntity> {
    return this.usecasesService.findOne(id);
  }

  @Post()
  create(
    @Body() dto: CreateUsecaseDto,
    @Req() request: { user?: AuthenticatedUser },
  ): Promise<UsecaseEntity> {
    return this.usecasesService.create(dto, request.user?.personId as string | undefined);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUsecaseDto): Promise<UsecaseEntity> {
    return this.usecasesService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<{ success: true }> {
    await this.usecasesService.remove(id);
    return { success: true };
  }
}
