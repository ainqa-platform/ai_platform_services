import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type ConversationRole = 'user' | 'assistant';

/**
 * A lightweight per-session turn log -- what makes a connector "agentic"
 * rather than one-shot: on the next message in the same session, a
 * connector can look back at what it already asked/was told (see
 * db-analytics.connector.ts and db-search.connector.ts, both of which use
 * this to tell "answering my clarifying question" apart from "a brand new
 * request"). Keyed generically by (usecase_id, session_id) so any connector
 * can adopt it.
 */
@Entity({ name: 'conversation_message', schema: 'ai_platform' })
export class ConversationMessageEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', name: 'usecase_id' })
  usecaseId: string;

  @Column({ type: 'uuid', name: 'session_id' })
  sessionId: string;

  @Column({ type: 'text' })
  role: ConversationRole;

  @Column({ type: 'text' })
  content: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt: Date;
}
