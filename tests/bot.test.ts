import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BotHandler } from '../src/bot/handler.js';
import { TurnContext, ActivityTypes, TeamsInfo } from 'botbuilder';
import type { Activity, ChannelAccount } from 'botbuilder';
import { db } from '../src/db/client.js';

// Mock db
vi.mock('../src/db/client.js', () => {
    return {
        db: {
            insertInto: vi.fn().mockReturnThis(),
            values: vi.fn().mockReturnThis(),
            onConflict: vi.fn().mockReturnThis(),
            column: vi.fn().mockReturnThis(),
            doUpdateSet: vi.fn().mockReturnThis(),
            execute: vi.fn().mockResolvedValue(undefined),
            selectFrom: vi.fn().mockReturnThis(),
            where: vi.fn().mockReturnThis(),
            selectAll: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue(undefined),
            updateTable: vi.fn().mockReturnThis(),
            set: vi.fn().mockReturnThis(),
        }
    }
});

// Mock TeamsInfo
vi.mock('botbuilder', async (importOriginal) => {
    const actual = await importOriginal<typeof import('botbuilder')>();
    return {
        ...actual,
        TeamsInfo: {
            getMember: vi.fn(),
        }
    };
});

describe('BotHandler', () => {
    let handler: BotHandler;
    let context: TurnContext;

    beforeEach(() => {
        handler = new BotHandler();
        context = {
            activity: {
                type: ActivityTypes.ConversationUpdate,
                membersAdded: [],
                recipient: { id: 'bot-id' },
                from: { id: 'user-id', name: 'User' },
                conversation: { id: 'conv-id' },
                serviceUrl: 'https://service.url',
                channelId: 'msteams'
            } as unknown as Partial<Activity>,
            sendActivity: vi.fn(),
            on: vi.fn(), // needed for run()
        } as unknown as TurnContext;
        
        // Mock getConversationReference
        // It's static, so we might need to mock TurnContext entirely or rely on real implementation if it doesn't do side effects.
        // Real implementation extracts fields. It should be fine.
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should save conversation reference when member is added', async () => {
        const member: ChannelAccount = { id: 'user-oid', name: 'Test User', aadObjectId: 'oid-123' };
        context.activity.membersAdded = [member];

        // Mock TeamsInfo.getMember to return details
        (TeamsInfo.getMember as any).mockResolvedValue({
            ...member,
            email: 'test@example.com',
            userPrincipalName: 'test@example.com'
        });

        await handler.run(context);

        expect(db.insertInto).toHaveBeenCalledWith('conversation_references');
        // Check arguments of values call
        const insertCall = (db.insertInto('conversation_references').values as any).mock.calls[0][0];
        expect(insertCall).toEqual(expect.objectContaining({
            user_aad_id: 'oid-123',
            user_email: 'test@example.com',
        }));
    });

    it('should not save if member added is the bot', async () => {
        const botMember: ChannelAccount = { id: 'bot-id', name: 'Bot' };
        context.activity.membersAdded = [botMember];
        context.activity.recipient.id = 'bot-id';

        await handler.run(context);

        expect(db.insertInto).not.toHaveBeenCalled();
    });

    it('should handle text reply for pending question', async () => {
        context.activity.type = ActivityTypes.Message;
        context.activity.text = 'My Answer';
        context.activity.conversation = { id: 'conv-1' } as any;
        context.activity.from = { id: 'user-1', name: 'User' };

        // Mock pending question found
        (db.selectFrom as any).mockReturnValue({
            where: vi.fn().mockReturnThis(),
            selectAll: vi.fn().mockReturnThis(),
            orderBy: vi.fn().mockReturnThis(),
            executeTakeFirst: vi.fn().mockResolvedValue({ id: 'q-1', status: 'pending' })
        });

        await handler.run(context);

        expect(db.updateTable).toHaveBeenCalledWith('pending_questions');
        expect(db.updateTable('pending_questions').set).toHaveBeenCalledWith(expect.objectContaining({
            status: 'replied',
            reply_text: 'My Answer'
        }));
        expect(db.updateTable('pending_questions').where).toHaveBeenCalledWith('id', '=', 'q-1');
        
        expect(context.sendActivity).toHaveBeenCalledWith(expect.stringContaining('Thanks for your answer'));
    });
});
