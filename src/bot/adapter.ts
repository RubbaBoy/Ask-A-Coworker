import { CloudAdapter, ConfigurationServiceClientCredentialFactory, createBotFrameworkAuthenticationFromConfiguration, TurnContext } from 'botbuilder';
import { config } from '../config.js';

const credentialsFactory = new ConfigurationServiceClientCredentialFactory({
    MicrosoftAppId: config.MICROSOFT_APP_ID,
    MicrosoftAppPassword: config.MICROSOFT_APP_PASSWORD,
    MicrosoftAppType: config.MICROSOFT_APP_TYPE,
    MicrosoftAppTenantId: config.MICROSOFT_APP_TENANT_ID
});

const botFrameworkAuthentication = createBotFrameworkAuthenticationFromConfiguration(null, credentialsFactory);

export const adapter = new CloudAdapter(botFrameworkAuthentication);

adapter.onTurnError = async (context: TurnContext, error: any) => {
    console.error(`\n [onTurnError] unhandled error: ${error}`);

    // Send a trace activity, which will be displayed in Bot Framework Emulator
    await context.sendTraceActivity(
        'OnTurnError Trace',
        `${error}`,
        'https://www.botframework.com/schemas/error',
        'TurnError'
    );

    // Send a message to the user
    await context.sendActivity('The bot encountered an error or bug.');
    await context.sendActivity('To continue to run this bot, please fix the bot source code.');
};
