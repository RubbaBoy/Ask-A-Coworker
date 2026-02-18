import { Client } from '@microsoft/microsoft-graph-client';

/**
 * Creates a Microsoft Graph client with a delegated token.
 * @param accessToken - The user's delegated access token.
 */
export function createGraphClient(accessToken: string): Client {
  return Client.init({
    authProvider: (done) => {
      done(null, accessToken);
    },
  });
}

/**
 * Resolves a user's Entra object ID and display name from their email.
 * @param accessToken - The calling user's delegated access token.
 * @param email - The email address of the target user.
 */
export async function resolveUserByEmail(accessToken: string, email: string): Promise<{ oid: string; displayName: string } | null> {
  const client = createGraphClient(accessToken);
  try {
    const user = await client.api('/users')
      .filter(`mail eq '${email}' or userPrincipalName eq '${email}'`)
      .select('id,displayName')
      .get();

    if (user.value && user.value.length > 0) {
      return {
        oid: user.value[0].id,
        displayName: user.value[0].displayName,
      };
    }
    return null;
  } catch (error) {
    console.error(`Error resolving user ${email}:`, error);
    return null;
  }
}

/**
 * Lists users in the organization based on a search query.
 * @param accessToken - The calling user's delegated access token.
 * @param query - The search query (optional).
 * @param limit - Maximum number of users to return.
 */
export async function listTeamsUsers(accessToken: string, query?: string, limit: number = 10) {
  const client = createGraphClient(accessToken);
  try {
    let api = client.api('/users')
      .select('mail,displayName,jobTitle,department')
      .top(limit);

    if (query) {
      api = api.filter(`startsWith(displayName,'${query}') or startsWith(mail,'${query}')`);
    }

    const result = await api.get();
    return result.value.map((user: any) => ({
      email: user.mail || user.userPrincipalName,
      displayName: user.displayName,
      jobTitle: user.jobTitle,
      department: user.department,
    }));
  } catch (error) {
    console.error('Error listing users:', error);
    return [];
  }
}
