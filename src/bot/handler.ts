import { TeamsActivityHandler, TurnContext, TeamsInfo } from 'botbuilder';
import type { ChannelAccount } from 'botbuilder';
import { db } from '../db/client.js';
import { replyRegistry } from '../pendingReplies/registry.js';

export class BotHandler extends TeamsActivityHandler {
  constructor() {
    super();

    this.onMembersAdded(async (context, next) => {
      const membersAdded = context.activity.membersAdded;
      if (membersAdded) {
        for (const member of membersAdded) {
          if (member.id !== context.activity.recipient.id) {
            await this.saveConversationReference(context, member);
          }
        }
      }
      await next();
    });

    this.onInstallationUpdateAdd(async (context, next) => {
      await this.saveConversationReference(context, context.activity.from);
      await next();
    });

    this.onMessage(async (context, next) => {
      const value = context.activity.value;
      const conversationId = context.activity.conversation.id;
      
      // Check if this is an Adaptive Card submit action for a question reply
      if (value && value.mcpAction === 'reply' && value.questionId) {
        const replyText = value.replyText;
        
        if (replyText) {
          console.log(`Received reply for question ${value.questionId} from ${context.activity.from.name}`);
          
          // Update database
          await db.updateTable('pending_questions')
            .set({
              status: 'replied',
              reply_text: replyText,
              replied_at: new Date()
            })
            .where('id', '=', value.questionId)
            .execute();

          replyRegistry.resolvePendingReply(value.questionId, {
            text: replyText,
            responderId: context.activity.from.id,
            responderName: context.activity.from.name
          });
          
          await context.sendActivity('Thanks for your answer! It has been sent back to the requester.');
        } else {
          await context.sendActivity('It looks like your answer was empty. Please try again.');
        }
      } else if (context.activity.text) {
        // Handle text reply: Check if there is a pending question for this conversation
        const pendingQuestion = await db.selectFrom('pending_questions')
          .where('target_conversation_id', '=', conversationId)
          .where('status', '=', 'pending')
          .selectAll()
          .orderBy('created_at', 'desc')
          .executeTakeFirst();

        if (pendingQuestion) {
          console.log(`Received text reply for question ${pendingQuestion.id} from ${context.activity.from.name}`);
          
          const replyText = context.activity.text;

          // Update database
          await db.updateTable('pending_questions')
            .set({
              status: 'replied',
              reply_text: replyText,
              replied_at: new Date()
            })
            .where('id', '=', pendingQuestion.id)
            .execute();

          replyRegistry.resolvePendingReply(pendingQuestion.id, {
            text: replyText,
            responderId: context.activity.from.id,
            responderName: context.activity.from.name
          });
          
          await context.sendActivity('Thanks for your answer!');
        } else {
          // For regular messages not matching a question, ensure we have the latest conversation reference
          await this.saveConversationReference(context, context.activity.from);
        }
      } else {
        // For other activities, ensure we have the latest conversation reference
        await this.saveConversationReference(context, context.activity.from);
      }
      
      await next();
    });
  }

  private async saveConversationReference(context: TurnContext, member: ChannelAccount) {
    try {
      let aadObjectId = member.aadObjectId;
      let email = member.name; // Default fallback
      let tenantId = context.activity.conversation?.tenantId;

      console.log(`[saveConversationReference] Starting save for member.id=${member.id}, initial aadObjectId=${aadObjectId}, email=${email}`);

      // Try to get more details (especially email/UPN)
      try {
        const userDetails = await TeamsInfo.getMember(context, member.id);
        if (userDetails) {
          aadObjectId = userDetails.aadObjectId || aadObjectId;
          email = userDetails.email || userDetails.userPrincipalName || userDetails.name || email;
          tenantId = userDetails.tenantId || tenantId;
          console.log(`[saveConversationReference] Expanded details from TeamsInfo: aadObjectId=${aadObjectId}, email=${email}`);
        }
      } catch (e) {
        console.warn(`[saveConversationReference] Could not fetch expanded member details for ${member.id}:`, e);
      }

      if (aadObjectId) {
        const reference = TurnContext.getConversationReference(context.activity);

        // Ensure reference.user matches the member we are saving for,
        // since in onMembersAdded activity.from may be the system or installer.
        reference.user = member;

        await db.insertInto('conversation_references')
          .values({
            user_aad_id: aadObjectId.toLowerCase(),
            user_email: email || 'unknown',
            conversation_reference: JSON.stringify(reference),
            updated_at: new Date()
          })
          .onConflict((oc) => oc
            .column('user_aad_id')
            .doUpdateSet({
              conversation_reference: JSON.stringify(reference),
              user_email: email || 'unknown',
              updated_at: new Date()
            })
          )
          .execute();
        console.log(`Saved conversation reference for user ${email} (${aadObjectId.toLowerCase()})`);
      } else {
        console.warn(`No AAD Object ID found for user ${member.id}`);
      }
    } catch (error) {
      console.error('Error saving conversation reference:', error);
    }
  }
}
