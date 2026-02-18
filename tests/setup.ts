import dotenv from 'dotenv';
import path from 'path';

// Load .env.test if it exists, otherwise fall back to .env
dotenv.config({ path: path.resolve(process.cwd(), '.env.test') });
dotenv.config();

// Set default DATABASE_URL for tests if not already set
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ask_a_coworker_test';
}
