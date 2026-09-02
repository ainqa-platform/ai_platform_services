import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsecaseEntity } from './entities/usecase.entity';
import { UsecasesController } from './usecases.controller';
import { UsecasesService } from './usecases.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsecaseEntity])],
  controllers: [UsecasesController],
  providers: [UsecasesService],
  exports: [UsecasesService],
})
export class UsecasesModule {}
