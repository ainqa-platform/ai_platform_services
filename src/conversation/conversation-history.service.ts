import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConversationMessageEntity, ConversationRole } from './entities/conversation-message.entity';

@Injectable()
export class ConversationHistoryService {
  constructor(
    @InjectRepository(ConversationMessageEntity)
    private readonly repository: Repository<ConversationMessageEntity>,
  ) {}

  async record(usecaseId: string, sessionId: string, role: ConversationRole, content: string): Promise<void> {
    await this.repository.save(this.repository.create({ usecaseId, sessionId, role, content }));
  }

  async getRecent(usecaseId: string, sessionId: string, limit = 10): Promise<ConversationMessageEntity[]> {
    const rows = await this.repository.find({
      where: { usecaseId, sessionId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    return rows.reverse();
  }
}
