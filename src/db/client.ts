import { Kysely, PostgresDialect } from 'kysely';
import type { Generated } from 'kysely';
import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

export interface ConversationReferencesTable {
  user_aad_id: string;
  user_email: string;
  conversation_reference: string; // JSONB is treated as string/object in Kysely depending on setup, using string for raw json storage
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PendingQuestionsTable {
  id: string;
  asking_user_aad_id: string;
  asking_user_email: string;
  target_user_aad_id: string;
  target_user_email: string;
  target_conversation_id: string;
  question_text: string;
  timeout_at: Date;
  created_at: Generated<Date>;
  reply_text: string | null;
  replied_at: Date | null;
  status: Generated<'pending' | 'replied' | 'timeout'>;
}

export interface Database {
  conversation_references: ConversationReferencesTable;
  pending_questions: PendingQuestionsTable;
}

export const db = new Kysely<Database>({
  dialect: new PostgresDialect({
    pool: new Pool({
      connectionString: config.DATABASE_URL,
    }),
  }),
});
