import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('conversation_references')
    .addColumn('user_aad_id', 'varchar(255)', (col) => col.primaryKey())
    .addColumn('user_email', 'varchar(255)', (col) => col.notNull())
    .addColumn('conversation_reference', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('updated_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .execute();

  await db.schema.createIndex('idx_conversation_references_user_email')
    .on('conversation_references')
    .column('user_email')
    .execute();

  await db.schema
    .createTable('pending_questions')
    .addColumn('id', 'uuid', (col) => col.primaryKey())
    .addColumn('asking_user_aad_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('asking_user_email', 'varchar(255)', (col) => col.notNull())
    .addColumn('target_user_aad_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('target_user_email', 'varchar(255)', (col) => col.notNull())
    .addColumn('target_conversation_id', 'varchar(255)', (col) => col.notNull())
    .addColumn('question_text', 'text', (col) => col.notNull())
    .addColumn('timeout_at', 'timestamptz', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) => col.defaultTo(sql`NOW()`).notNull())
    .addColumn('reply_text', 'text')
    .addColumn('replied_at', 'timestamptz')
    .addColumn('status', 'varchar(20)', (col) => col.defaultTo('pending').notNull())
    .execute();

  await db.schema.createIndex('idx_pending_questions_target_conversation_id_status')
    .on('pending_questions')
    .columns(['target_conversation_id', 'status'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('pending_questions').execute();
  await db.schema.dropTable('conversation_references').execute();
}
