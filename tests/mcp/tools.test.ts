import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAskCoworkerTool } from '../../src/mcp/tools/askCoworker.js';
import { createListPeopleTool } from '../../src/mcp/tools/listPeople.js';
import { UserAuthClient } from '../../src/auth/userAuth.js';
import * as graphClient from '../../src/graph/client.js';
import { db } from '../../src/db/client.js';
import { replyRegistry } from '../../src/pendingReplies/registry.js';
import * as proactive from '../../src/bot/proactive.js';

// Mocks
vi.mock('../../src/auth/userAuth.js');
vi.mock('../../src/graph/client.js');
vi.mock('../../src/db/client.js', () => ({
  db: {
    selectFrom: vi.fn(),
    insertInto: vi.fn(),
  },
}));
vi.mock('../../src/bot/proactive.js');
vi.mock('../../src/pendingReplies/registry.js', () => ({
    replyRegistry: {
        registerPendingReply: vi.fn(),
        resolvePendingReply: vi.fn(),
        cancelPendingReply: vi.fn(),
    }
}));

describe('MCP Tools', () => {
  let mockAuthClient: any;
  let listPeopleTool: any;
  let askCoworkerTool: any;

  beforeEach(() => {
    vi.resetAllMocks();
    mockAuthClient = {
      getUserToken: vi.fn(),
      msalClient: {
        getTokenCache: () => ({
          getAllAccounts: vi.fn().mockResolvedValue([{ localAccountId: 'id', username: 'test@example.com' }])
        })
      }
    };
    listPeopleTool = createListPeopleTool(mockAuthClient as any);
    askCoworkerTool = createAskCoworkerTool(mockAuthClient as any);
  });

  describe('list_available_people', () => {
    it('should return authentication instructions if device code is triggered', async () => {
      mockAuthClient.getUserToken.mockImplementation((onDeviceCode: any) => {
        if (onDeviceCode) onDeviceCode('To sign in, use a web browser...');
        return new Promise(() => {}); // pending promise
      });

      const result = await listPeopleTool.execute({ query: 'Alice', limit: 10 });
      expect(result.isError).toBe(true);
      const text = result.content![0]?.text;
      expect(text).toContain('Authentication required: To sign in, use a web browser');
    });

    it('should list people', async () => {
      mockAuthClient.getUserToken.mockResolvedValue('fake-token');
      vi.mocked(graphClient.listTeamsUsers).mockResolvedValue([
        { displayName: 'Alice', email: 'alice@example.com', jobTitle: 'Dev', department: 'Eng' }
      ]);

      const result = await listPeopleTool.execute({ query: 'Alice', limit: 10 });
      const text = result.content![0]?.text;
      if (!text) throw new Error('No content text');
      const content = JSON.parse(text);
      expect(content.people).toHaveLength(1);
      expect(content.people[0].name).toBe('Alice');
    });
  });

  describe('ask_a_coworker', () => {
    it('should return authentication instructions if device code is triggered', async () => {
      mockAuthClient.getUserToken.mockImplementation((onDeviceCode: any) => {
        if (onDeviceCode) onDeviceCode('To sign in, use a web browser...');
        return new Promise(() => {}); // pending promise
      });

      const result = await askCoworkerTool.execute({ question: 'Hi?', targetEmail: 'alice@example.com', timeout: 300000 });
      expect(result.isError).toBe(true);
      const text = result.content![0]?.text;
      expect(text).toContain('Authentication required: To sign in, use a web browser');
    });

    it('should ask a question and wait for reply', async () => {
      mockAuthClient.getUserToken.mockResolvedValue('fake-token');
      vi.mocked(graphClient.resolveUserByEmail).mockResolvedValue({ oid: 'oid-1', displayName: 'Alice' });
      
      // Mock DB
      const mockQueryBuilder = {
        where: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        executeTakeFirst: vi.fn().mockResolvedValue({ conversation_reference: JSON.stringify({ user: { id: 'u1' }, conversation: { id: 'c1' } }) }),
      };
      vi.mocked(db.selectFrom).mockReturnValue(mockQueryBuilder as any);

      const mockInsertBuilder = {
        values: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue(undefined),
      };
      vi.mocked(db.insertInto).mockReturnValue(mockInsertBuilder as any);

      // Mock Registry
      vi.mocked(replyRegistry.registerPendingReply).mockResolvedValue({
        text: 'Hello!',
        responderId: 'u1',
        responderName: 'Alice'
      });

      // Mock Proactive
      vi.mocked(proactive.continueConversation).mockImplementation(async (ref, callback) => {
        await callback({ sendActivity: vi.fn() } as any);
      });

      const result = await askCoworkerTool.execute({ question: 'Hi?', targetEmail: 'alice@example.com', timeout: 300000 });

      const text = result.content![0]?.text;
      if (!text) throw new Error('No content text');
      const content = JSON.parse(text);
      expect(content.status).toBe('replied');
      expect(content.reply).toBe('Hello!');
      expect(proactive.continueConversation).toHaveBeenCalled();
    });

    it('should handle timeout', async () => {
        mockAuthClient.getUserToken.mockResolvedValue('fake-token');
        vi.mocked(graphClient.resolveUserByEmail).mockResolvedValue({ oid: 'oid-1', displayName: 'Alice' });
        
        const mockQueryBuilder = {
          where: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          executeTakeFirst: vi.fn().mockResolvedValue({ conversation_reference: JSON.stringify({ user: { id: 'u1' }, conversation: { id: 'c1' } }) }),
        };
        vi.mocked(db.selectFrom).mockReturnValue(mockQueryBuilder as any);

        const mockInsertBuilder = {
            values: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue(undefined),
        };
        vi.mocked(db.insertInto).mockReturnValue(mockInsertBuilder as any);
  
        // Mock Registry returning null (timeout)
        vi.mocked(replyRegistry.registerPendingReply).mockResolvedValue(null);
  
        vi.mocked(proactive.continueConversation).mockImplementation(async (ref, callback) => {
          await callback({ sendActivity: vi.fn() } as any);
        });
  
        const result = await askCoworkerTool.execute({ question: 'Hi?', targetEmail: 'alice@example.com', timeout: 300000 });

        expect(result.isError).toBe(true);
        const text = result.content![0]?.text;
        expect(text).toContain('did not reply');
    });

    it('should throw if user not found', async () => {
        mockAuthClient.getUserToken.mockResolvedValue('fake-token');
        vi.mocked(graphClient.resolveUserByEmail).mockResolvedValue(null);

        await expect(askCoworkerTool.execute({ question: 'Hi?', targetEmail: 'bob@example.com', timeout: 300000 }))
            .rejects.toThrow('User with email bob@example.com not found');
    });
  });
});
