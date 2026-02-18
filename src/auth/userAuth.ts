import { PublicClientApplication, type Configuration, LogLevel, type DeviceCodeRequest } from '@azure/msal-node';
import { config } from '../config.js';

const msalConfig: Configuration = {
  auth: {
    clientId: config.MICROSOFT_APP_ID,
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

export class UserAuthClient {
  public msalClient: PublicClientApplication;
  public createdAt: string;
  private pendingAuthPromise: Promise<string | null> | null = null;

  constructor() {
    this.msalClient = new PublicClientApplication(msalConfig);
    this.createdAt = new Date().toISOString();
    console.log(`UserAuthClient created at: ${this.createdAt}`);
  }

  public async getUserToken(onDeviceCode?: (message: string) => void): Promise<string | null> {
    if (this.pendingAuthPromise) {
      console.log(`[ID: ${this.createdAt}] Auth request already in progress`);
      return this.pendingAuthPromise;
    }

    this.pendingAuthPromise = (async () => {
      try {
        const account = (await this.msalClient.getTokenCache().getAllAccounts())[0];
        if (account) {
          try {
            const result = await this.msalClient.acquireTokenSilent({
              account,
              scopes: ['User.ReadBasic.All'],
            });
            return result?.accessToken ?? null;
          } catch (error) {
            // Fallback to device code
            return await this.authenticateUserViaDeviceCode(onDeviceCode);
          }
        }
        return await this.authenticateUserViaDeviceCode(onDeviceCode);
      } finally {
        this.pendingAuthPromise = null;
      }
    })();

    return this.pendingAuthPromise;
  }

  /**
   * Initiates device code flow for user authentication.
   * This is primarily used for development/testing or in CLI helpers.
   */
  public async authenticateUserViaDeviceCode(onDeviceCode?: (message: string) => void): Promise<string | null> {
    const deviceCodeRequest: DeviceCodeRequest = {
      deviceCodeCallback: (response) => {
        console.log(`[ID: ${this.createdAt}] ${response.message}`);
        if (onDeviceCode) {
          onDeviceCode(response.message);
        }
      },
      scopes: ['User.ReadBasic.All'],
    };

    try {
      const result = await this.msalClient.acquireTokenByDeviceCode(deviceCodeRequest);
      return result?.accessToken ?? null;
    } catch (error: any) {
      console.error('Error during user device code authentication:', error);
      
      // Provide a helpful error if the app registration is missing "Allow public client flows"
      if (error?.errorMessage?.includes('invalid_client') || error?.message?.includes('invalid_client')) {
        const helpfulMessage = 'Error: The Entra ID application registration does not have "Allow public client flows" enabled. Please go to the Azure Portal -> Entra ID -> App Registrations -> Your App -> Authentication -> Advanced settings -> set "Allow public client flows" to Yes, and save.';
        console.error(helpfulMessage);
        if (onDeviceCode) {
          onDeviceCode(helpfulMessage);
        }
      }
      
      return null;
    }
  }
}
