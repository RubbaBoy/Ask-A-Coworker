import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';

vi.mock('../src/config.js', () => ({
  config: {
    DATABASE_URL: process.env.DATABASE_URL,
  }
}));

import { Kysely, PostgresDialect, Migrator, FileMigrationProvider } from 'kysely';
import pg from 'pg';
import * as path from 'path';
import { promises as fs } from 'fs';
import { fileURLToPath, URL } from 'url';
import { type Database } from '../src/db/client.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Check if Postgres is reachable and ensure test database exists
async function ensureDatabase(): Promise<boolean> {
  if (!process.env.DATABASE_URL) return false;

  const dbUrl = process.env.DATABASE_URL;
  const parsedUrl = new URL(dbUrl);
  const dbName = parsedUrl.pathname.slice(1); // remove leading /

  // Connect to 'postgres' database to check/create target DB
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = '/postgres';

  const client = new pg.Client({ connectionString: adminUrl.toString() });

  try {
    await client.connect();

    // Check if database exists
    const res = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
    if (res.rowCount === 0) {
      // Create database
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Created test database: ${dbName}`);
    }

    await client.end();
    return true;
  } catch (error) {
    console.warn('Postgres is not reachable or error creating DB:', error);
    try {
      await client.end();
    } catch {}
    return false;
  }
}

const canConnect = await ensureDatabase();

describe.skipIf(!canConnect)('Database Integration', () => {
  let db: Kysely<Database>;
  let migrator: Migrator;

  beforeAll(async () => {
    const connectionString = process.env.DATABASE_URL!;

    db = new Kysely<Database>({
      dialect: new PostgresDialect({
        pool: new pg.Pool({
          connectionString,
        }),
      }),
    });

    migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, '../src/db/migrations'),
      }),
    });

    const { error } = await migrator.migrateToLatest();
    if (error) {
      console.error('Failed to migrate test database:', error);
      throw error;
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean tables before each test
    await db.deleteFrom('pending_questions').execute();
    await db.deleteFrom('conversation_references').execute();
  });

  it('should upsert a conversation reference', async () => {
    const ref = {
      user_aad_id: 'user-123',
      user_email: 'test@example.com',
      conversation_reference: JSON.stringify({ serviceUrl: 'https://test.com' }),
      updated_at: new Date(),
    };

    await db.insertInto('conversation_references')
      .values({
        ...ref,
        created_at: new Date(),
      })
      .onConflict((oc) => oc
        .column('user_aad_id')
        .doUpdateSet({
          conversation_reference: ref.conversation_reference,
          updated_at: ref.updated_at,
        })
      )
      .execute();

    const result = await db.selectFrom('conversation_references')
      .selectAll()
      .where('user_aad_id', '=', 'user-123')
      .executeTakeFirst();

    expect(result).toBeDefined();
    expect(result?.user_email).toBe('test@example.com');
  });

  it('should create and retrieve a pending question', async () => {
    const questionId = '00000000-0000-0000-0000-000000000001';
    await db.insertInto('pending_questions')
      .values({
        id: questionId,
        asking_user_aad_id: 'asker-1',
        asking_user_email: 'asker@test.com',
        target_user_aad_id: 'target-1',
        target_user_email: 'target@test.com',
        target_conversation_id: 'conv-1',
        question_text: 'What is the status?',
        timeout_at: new Date(Date.now() + 60000),
        status: 'pending',
        created_at: new Date(),
      })
      .execute();

    const result = await db.selectFrom('pending_questions')
      .selectAll()
      .where('id', '=', questionId)
      .executeTakeFirst();

    expect(result).toBeDefined();
    expect(result?.question_text).toBe('What is the status?');
    expect(result?.status).toBe('pending');
  });

  it('should update a question with a reply', async () => {
    const questionId = '00000000-0000-0000-0000-000000000002';
    await db.insertInto('pending_questions')
      .values({
        id: questionId,
        asking_user_aad_id: 'asker-1',
        asking_user_email: 'asker@test.com',
        target_user_aad_id: 'target-1',
        target_user_email: 'target@test.com',
        target_conversation_id: 'conv-1',
        question_text: 'Hello?',
        timeout_at: new Date(Date.now() + 60000),
        status: 'pending',
        created_at: new Date(),
      })
      .execute();

    await db.updateTable('pending_questions')
      .set({
        reply_text: 'I am here',
        replied_at: new Date(),
        status: 'replied'
      })
      .where('id', '=', questionId)
      .execute();

    const result = await db.selectFrom('pending_questions')
      .selectAll()
      .where('id', '=', questionId)
      .executeTakeFirst();

    expect(result?.status).toBe('replied');
    expect(result?.reply_text).toBe('I am here');
  });
});
