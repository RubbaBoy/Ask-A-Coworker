import { z } from 'zod';
import { resolveUserByEmail } from '../../graph/client.js';
import { UserAuthClient } from '../../auth/userAuth.js';
import { db } from '../../db/client.js';
import { replyRegistry } from '../../pendingReplies/registry.js';
import { continueConversation } from '../../bot/proactive.js';
import { randomUUID } from 'crypto';
import { CardFactory } from 'botbuilder';

export const createAskCoworkerTool = (userAuthClient: UserAuthClient) => ({
  name: 'ask_a_coworker',
  description: 'Ask a question to a coworker via Microsoft Teams',
  parameters: z.object({
    question: z.string().describe('The question to ask'),
    targetEmail: z.string().email().describe('The email address of the coworker'),
    timeout: z.number().optional().default(300000).describe('Timeout in milliseconds (default 5 minutes)'),
  }),
  execute: async ({ question, targetEmail, timeout }: { question: string; targetEmail: string; timeout: number }) => {
    let deviceCodeMessage: string | undefined;
    let onDeviceCodeTriggered: () => void;
    const deviceCodePromise = new Promise<void>((resolve) => {
      onDeviceCodeTriggered = resolve;
    });

    const tokenPromise = userAuthClient.getUserToken((msg) => {
      deviceCodeMessage = msg;
      onDeviceCodeTriggered();
    });

    await Promise.race([tokenPromise, deviceCodePromise]);

    if (deviceCodeMessage) {
      return {
        content: [{
          type: "text" as const,
          text: `Authentication required: ${deviceCodeMessage}\n\nPlease complete the authentication and then run this tool again.`
        }],
        isError: true
      };
    }

    const token = await tokenPromise;
    if (!token) {
      throw new Error('Failed to acquire user token for Graph API access');
    }

    const user = await resolveUserByEmail(token, targetEmail);
    if (!user) {
      throw new Error(`User with email ${targetEmail} not found in the organization`);
    }

    console.log(`[askCoworker] Resolved user by email (${targetEmail}): OID=${user.oid}, displayName=${user.displayName}`);

    const refRow = await db.selectFrom('conversation_references')
      .where('user_aad_id', '=', user.oid.toLowerCase())
      .select('conversation_reference')
      .executeTakeFirst();

    if (!refRow) {
      console.warn(`[askCoworker] Failed to find conversation_reference for user_aad_id='${user.oid.toLowerCase()}'`);
      
      // Fetch all entries to log what is actually in the DB to debug the mismatch
      const allRefs = await db.selectFrom('conversation_references')
        .select(['user_aad_id', 'user_email'])
        .execute();
      console.warn(`[askCoworker] Existing DB entries (count: ${allRefs.length}):`, allRefs);

      throw new Error(`Bot is not installed for user ${user.displayName} (${targetEmail}). The user needs to install the bot first.`);
    }

    const reference = typeof refRow.conversation_reference === 'string' ? JSON.parse(refRow.conversation_reference) : refRow.conversation_reference;
    const questionId = randomUUID();
    const timeoutMs = timeout || 300000;

    const account = (await userAuthClient.msalClient.getTokenCache().getAllAccounts())[0];
    const asking_user_aad_id = account?.localAccountId || 'mcp-agent';
    const asking_user_email = account?.username || 'mcp-agent@local';
    const asking_user_name = account?.name || account?.username || 'A coworker';

    const useResponseBox = process.env.USE_RESPONSE_BOX === 'true';

    const card = CardFactory.adaptiveCard({
      "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
      "type": "AdaptiveCard",
      "version": "1.5",
      "body": [
        {
          "type": "Container",
          "items": [
            {
              "type": "TextBlock",
              "text": "New Question",
              "weight": "Bolder",
              "size": "Large",
              "color": "Accent"
            },
            {
              "type": "TextBlock",
              "text": `${asking_user_name} needs your help with the following question:`,
              "wrap": true,
              "isSubtle": true,
              "spacing": "None"
            }
          ]
        },
        useResponseBox ? {
          "type": "Container",
          "style": "emphasis",
          "items": [
            {
              "type": "TextBlock",
              "text": question,
              "wrap": true,
              "weight": "Default",
              "size": "Medium",
              "fontType": "Monospace"
            }
          ],
          "spacing": "Medium"
        } : {
          "type": "TextBlock",
          "text": question,
          "wrap": true,
          "weight": "Default",
          "size": "Medium"
        },
        ...(useResponseBox ? [{
          "type": "Input.Text",
          "id": "replyText",
          "placeholder": "Type your answer here...",
          "isMultiline": true,
          "spacing": "Medium"
        }] : [])
      ],
      "actions": useResponseBox ? [
        {
          "type": "Action.Submit",
          "title": "Send Reply",
          "style": "positive",
          "data": {
            "mcpAction": "reply",
            "questionId": questionId
          }
        }
      ] : []
    });

    console.log(`Sending question ${questionId} to ${targetEmail} from ${asking_user_email}`);

    // Insert pending question into database
    await db.insertInto('pending_questions')
      .values({
        id: questionId,
        asking_user_aad_id,
        asking_user_email,
        target_user_aad_id: user.oid,
        target_user_email: targetEmail,
        target_conversation_id: reference.conversation.id,
        question_text: question,
        timeout_at: new Date(Date.now() + timeoutMs),
        status: 'pending',
        created_at: new Date()
      })
      .execute();

    const pendingReplyPromise = replyRegistry.registerPendingReply(questionId, timeoutMs);

    try {
      await continueConversation(reference, async (context) => {
        await context.sendActivity({ attachments: [card] });
      });
    } catch (error: any) {
      console.error("Failed to send message:", error);
      replyRegistry.cancelPendingReply(questionId);
      throw new Error(`Failed to send message to user: ${error.message}`);
    }

    console.log(`Waiting for reply to ${questionId}...`);
    const reply = await pendingReplyPromise;

    if (!reply) {
      return {
        content: [{
          type: "text" as const,
          text: "The user did not reply within the timeout period."
        }],
        isError: true
      };
    }

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          status: 'replied',
          reply: reply.text,
          responder: reply.responderName
        }, null, 2)
      }]
    };
  },
});
