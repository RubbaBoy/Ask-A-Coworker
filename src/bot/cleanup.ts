import { db } from '../db/client.js';
import { replyRegistry } from '../pendingReplies/registry.js';
import { sql } from 'kysely';

const CLEANUP_INTERVAL_MS = 60 * 1000; // Check every minute

export function startCleanupTask() {
  console.log('Starting periodic cleanup task for expired questions...');
  
  setInterval(async () => {
    try {
      await cleanupExpiredQuestions();
    } catch (error) {
      console.error('Error in cleanup task:', error);
    }
  }, CLEANUP_INTERVAL_MS);
}

async function cleanupExpiredQuestions() {
  // Find questions that are pending and passed their timeout
  const expiredQuestions = await db.selectFrom('pending_questions')
    .where('status', '=', 'pending')
    .where('timeout_at', '<', new Date())
    .select(['id', 'asking_user_email'])
    .execute();

  if (expiredQuestions.length === 0) {
    return;
  }

  console.log(`Found ${expiredQuestions.length} expired questions. Cleaning up...`);

  for (const question of expiredQuestions) {
    // Update DB status to timeout
    await db.updateTable('pending_questions')
      .set({
        status: 'timeout'
      })
      .where('id', '=', question.id)
      .execute();

    // Notify local registry to resolve promises if they are still active
    replyRegistry.cancelPendingReply(question.id);
    
    console.log(`Marked question ${question.id} as timeout`);
  }
}
