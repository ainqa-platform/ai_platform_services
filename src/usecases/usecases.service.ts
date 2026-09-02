import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateUsecaseDto } from './dto/create-usecase.dto';
import { UpdateUsecaseDto } from './dto/update-usecase.dto';
import { validateUsecaseConfig } from './dto/usecase-config.schema';
import { UsecaseEntity } from './entities/usecase.entity';

@Injectable()
export class UsecasesService {
  constructor(@InjectRepository(UsecaseEntity) private readonly usecaseRepository: Repository<UsecaseEntity>) {}

  async findAll(): Promise<UsecaseEntity[]> {
    return this.usecaseRepository.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string): Promise<UsecaseEntity> {
    const usecase = await this.usecaseRepository.findOneBy({ id });
    if (!usecase) {
      throw new NotFoundException(`Usecase ${id} not found`);
    }
    return usecase;
  }

  async create(dto: CreateUsecaseDto, createdBy?: string): Promise<UsecaseEntity> {
    const config = validateUsecaseConfig(dto.type, dto.config);
    const entity = this.usecaseRepository.create({
      name: dto.name,
      description: dto.description ?? null,
      type: dto.type,
      status: 'active',
      config,
      createdBy: createdBy ?? null,
    });
    return this.usecaseRepository.save(entity);
  }

  async update(id: string, dto: UpdateUsecaseDto): Promise<UsecaseEntity> {
    const existing = await this.findOne(id);
    const nextConfig = dto.config ? validateUsecaseConfig(existing.type, dto.config) : existing.config;

    // .save() (rather than .update()) so the jsonb `config` column can just
    // be assigned a plain object -- TypeORM's QueryDeepPartialEntity used by
    // .update() can't express that against a `Record<string, unknown>`-typed
    // column.
    existing.name = dto.name ?? existing.name;
    existing.description = dto.description ?? existing.description;
    existing.status = dto.status ?? existing.status;
    existing.config = nextConfig;
    return this.usecaseRepository.save(existing);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.findOne(id);
    await this.usecaseRepository.delete(existing.id);
  }
}
