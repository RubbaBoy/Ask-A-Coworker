import { TurnContext } from 'botbuilder';
import type { ConversationReference } from 'botbuilder';
import { adapter } from './adapter.js';
import { config } from '../config.js';

export async function continueConversation(
    reference: Partial<ConversationReference>,
    callback: (context: TurnContext) => Promise<void>
): Promise<void> {
    await adapter.continueConversationAsync(config.MICROSOFT_APP_ID, reference, callback);
}
