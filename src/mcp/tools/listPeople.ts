import { z } from 'zod';
import { listTeamsUsers } from '../../graph/client.js';
import { UserAuthClient } from '../../auth/userAuth.js';

export const createListPeopleTool = (userAuthClient: UserAuthClient) => ({
  name: 'list_available_people',
  description: 'List people available in the organization to ask questions to',
  parameters: z.object({
    query: z.string().optional().describe('Search query for name or email'),
    limit: z.number().optional().default(10).describe('Maximum number of people to return'),
  }),
  execute: async ({ query, limit }: { query: string | undefined; limit: number }) => {
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

    const users = await listTeamsUsers(token, query, limit) as any[];
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          people: users.map((u: any) => ({
            name: u.displayName,
            email: u.email,
            title: u.jobTitle,
            department: u.department
          }))
        }, null, 2)
      }]
    };
  },
});
