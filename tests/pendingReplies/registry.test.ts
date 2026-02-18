import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PendingReplyRegistry, type ReplyPayload } from '../../src/pendingReplies/registry.js';

describe('PendingReplyRegistry', () => {
  let registry: PendingReplyRegistry;

  beforeEach(() => {
    registry = new PendingReplyRegistry();
    vi.useFakeTimers();
  });

  afterEach(() => {
    registry.cleanup();
    vi.useRealTimers();
  });

  it('should register a pending reply and resolve it manually', async () => {
    const questionId = 'q1';
    const promise = registry.registerPendingReply(questionId, 1000);

    const payload: ReplyPayload = {
      text: 'Answer',
      responderId: 'user1',
      responderName: 'User One',
    };

    registry.resolvePendingReply(questionId, payload);

    const result = await promise;
    expect(result).toEqual(payload);
    expect(registry.getPendingCount()).toBe(0);
  });

  it('should resolve with null on timeout', async () => {
    const questionId = 'q2';
    const promise = registry.registerPendingReply(questionId, 1000);

    vi.advanceTimersByTime(1100);

    const result = await promise;
    expect(result).toBeNull();
    expect(registry.getPendingCount()).toBe(0);
  });

  it('should handle multiple concurrent registrations independently', async () => {
    const q1 = 'q1';
    const q2 = 'q2';
    const p1 = registry.registerPendingReply(q1, 1000);
    const p2 = registry.registerPendingReply(q2, 2000);

    expect(registry.getPendingCount()).toBe(2);

    const payload1: ReplyPayload = { text: 'A1', responderId: 'u1', responderName: 'U1' };
    registry.resolvePendingReply(q1, payload1);

    const result1 = await p1;
    expect(result1).toEqual(payload1);
    expect(registry.getPendingCount()).toBe(1);

    // q2 times out
    vi.advanceTimersByTime(2100);
    const result2 = await p2;
    expect(result2).toBeNull();
    expect(registry.getPendingCount()).toBe(0);
  });
  
  it('should cleanup all pending replies on shutdown', async () => {
     const q1 = 'q1';
     const q2 = 'q2';
     const p1 = registry.registerPendingReply(q1, 5000);
     const p2 = registry.registerPendingReply(q2, 5000);
     
     expect(registry.getPendingCount()).toBe(2);
     
     registry.cleanup();
     
     const r1 = await p1;
     const r2 = await p2;
     
     expect(r1).toBeNull();
     expect(r2).toBeNull();
     expect(registry.getPendingCount()).toBe(0);
  });

  it('should resolve old pending reply with null when registering duplicate questionId', async () => {
    const q1 = 'duplicate';
    const p1 = registry.registerPendingReply(q1, 5000);
    
    // overwrite
    const p2 = registry.registerPendingReply(q1, 5000);
    
    const r1 = await p1;
    expect(r1).toBeNull(); // The first one was cancelled/overwritten
    
    // Resolve the second one
    const payload: ReplyPayload = { text: 'New', responderId: 'u2', responderName: 'U2' };
    registry.resolvePendingReply(q1, payload);
    const r2 = await p2;
    expect(r2).toEqual(payload);
  });
});
