import { ConfidentialClientApplication, type Configuration, LogLevel } from '@azure/msal-node';
import { config } from '../config.js';

const msalConfig: Configuration = {
  auth: {
    clientId: config.MICROSOFT_APP_ID,
    clientSecret: config.MICROSOFT_APP_PASSWORD,
    authority: `https://login.microsoftonline.com/${config.MICROSOFT_APP_TENANT_ID}`,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) {
          console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Error,
    },
  },
};

export const botMsalClient = new ConfidentialClientApplication(msalConfig);

/**
 * Gets a token for the bot identity (client credentials flow).
 */
export async function getBotToken(): Promise<string | null> {
  try {
    const result = await botMsalClient.acquireTokenByClientCredential({
      scopes: ['https://graph.microsoft.com/.default'],
    });
    return result?.accessToken ?? null;
  } catch (error) {
    console.error('Error acquiring bot token:', error);
    return null;
  }
}
