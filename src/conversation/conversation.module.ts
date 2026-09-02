import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationHistoryService } from './conversation-history.service';
import { ConversationMessageEntity } from './entities/conversation-message.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ConversationMessageEntity])],
  providers: [ConversationHistoryService],
  exports: [ConversationHistoryService],
})
export class ConversationModule {}
