export interface ReplyPayload {
  text: string;
  responderId: string;
  responderName: string;
}

interface PendingReply {
  resolve: (value: ReplyPayload | null) => void;
  timer: NodeJS.Timeout;
}

export class PendingReplyRegistry {
  private pendingReplies = new Map<string, PendingReply>();

  /**
   * Registers a pending reply for a given question ID.
   * Returns a promise that resolves when the reply is received or when the timeout expires.
   * If the timeout expires or cleanup is called, the promise resolves to null.
   *
   * @param questionId The unique identifier for the question (UUID).
   * @param timeoutMs The timeout in milliseconds.
   * @returns A promise that resolves to the ReplyPayload or null.
   */
  registerPendingReply(questionId: string, timeoutMs: number): Promise<ReplyPayload | null> {
    // If there's already a pending reply for this ID, cancel the previous one to avoid race conditions.
    if (this.pendingReplies.has(questionId)) {
      this.resolveAndCleanup(questionId, null);
    }
    
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.resolveAndCleanup(questionId, null);
      }, timeoutMs);

      this.pendingReplies.set(questionId, { resolve, timer });
    });
  }

  /**
   * Resolves a pending reply with the given payload.
   *
   * @param questionId The question ID to resolve.
   * @param payload The payload to resolve with.
   */
  resolvePendingReply(questionId: string, payload: ReplyPayload): void {
    this.resolveAndCleanup(questionId, payload);
  }

  /**
   * Cancels a pending reply (resolves with null).
   *
   * @param questionId The question ID to cancel.
   */
  cancelPendingReply(questionId: string): void {
    this.resolveAndCleanup(questionId, null);
  }

  private resolveAndCleanup(questionId: string, value: ReplyPayload | null): void {
    const entry = this.pendingReplies.get(questionId);
    if (entry) {
      clearTimeout(entry.timer);
      entry.resolve(value);
      this.pendingReplies.delete(questionId);
    }
  }

  /**
   * Cleans up all pending replies, resolving them with null.
   * Should be called on process shutdown.
   */
  cleanup(): void {
    for (const [questionId, entry] of this.pendingReplies) {
      clearTimeout(entry.timer);
      entry.resolve(null);
    }
    this.pendingReplies.clear();
  }
  
  /**
   * Returns the number of currently pending replies.
   * Useful for testing.
   */
  getPendingCount(): number {
    return this.pendingReplies.size;
  }
}

export const replyRegistry = new PendingReplyRegistry();
