This guide provides step-by-step instructions for setting up the Ask A Coworker MCP server. It is divided into two sections:

1.  **Administrator Guide**: For IT/DevOps admins deploying the server and configuring Azure resources.
2.  **User Guide**: For end-users connecting their AI agent (e.g., Claude Desktop) to the server.

---

## Part 1: Administrator Guide

### Prerequisites
-   **Azure Subscription**: To create a Bot resource and Entra ID application.
-   **Microsoft 365 Tenant Admin**: To upload the custom app to the organization catalog (or side-load permission).
-   **Server/VM**: A machine with Docker and Docker Compose installed to host the application.
-   **Public URL**: The bot requires a public HTTPS endpoint for Teams to send webhooks. You can use a tunnel (e.g., Cloudflare, ngrok) or a public load balancer.

### Step 1: Create Azure Resources

1.  **Create an Azure Bot Resource**:
    -   Go to the [Azure Portal](https://portal.azure.com).
    -   Search for "Azure Bot" and create a new resource.
    -   **App Type**: Under the "Microsoft App ID" section, select **"Single Tenant"**
    -   **Important**: Note the **Microsoft App ID** (Client ID). You will find this in the **Settings > Configuration** blade or the **Overview** page after the resource is created.

2.  **Configure the Bot**:
    -   In the Bot resource blade, go to **Settings > Configuration**.
    -   Add the **Messaging Endpoint**: `https://<your-public-domain>/api/messages`.
    -   Go to **Channels** and add **Microsoft Teams**.

3.  **Create a Client Secret**:
    -   Click the "Manage" link next to the App ID (or go to Entra ID > App Registrations > [Your App]).
    -   Go to **Certificates & secrets** > **New client secret**.
    -   Copy the **Value** (not the ID) immediately. This is your `MICROSOFT_APP_PASSWORD`.

4.  **Configure API Permissions**:
    -   In the App Registration, go to **API Permissions**.
    -   Add `Microsoft Graph` permissions:
        -   `User.ReadBasic.All` (Delegated) - To search for coworkers.
        -   `User.Read` (Delegated) - Default.
    -   Grant **Admin Consent** for the tenant if required.

5.  **Enable Public Client Flows**:
    -   Select your app in **App Registration** (search for this in Azure)
    -   Go to **Manage > Authentication** in the left menu and go to the **Settings** tab
    -   Enable **Allow public client flows**
    -   Click **Save** at the bottom

### Step 2: Configure the Server

1.  **Clone the Repository**:
    ```bash
    git clone <repository-url>
    cd ask-a-coworker-mcp
    ```

2.  **Set Environment Variables**:
    -   Copy the example file: `cp .env.example .env`
    -   Edit `.env` with your values:
        ```env
        PORT=3978
        MICROSOFT_APP_ID=<Your-App-ID>
        MICROSOFT_APP_PASSWORD=<Your-Client-Secret>
        MICROSOFT_APP_TENANT_ID=<Your-Tenant-ID>
        MICROSOFT_APP_TYPE=MultiTenant  # or SingleTenant
        DATABASE_URL=postgresql://postgres:password@postgres:5432/ask_a_coworker
        USE_RESPONSE_BOX=false # Sends messages with an adaptive card response form in chat
        
        # Security
        MCP_AUTH_REQUIRED=true
        
        # Ngrok (Optional)
        # NGROK_AUTHTOKEN=
        # NGROK_URL=
        ```

### Step 3: Deploy with Docker

Run the application stack using Docker Compose:

```bash
docker compose up -d --build
```

This starts the main **App** (MCP + Bot) and **Postgres** database.

**To enable Ngrok:**

1. **Configure ngrok**
    -   Sign up for [ngrok](https://ngrok.com/)
    -   Navigate to the [Docker getting started](https://dashboard.ngrok.com/get-started/setup/docker), and from the command, copy the `NGROK_AUTHTOKEN` and the URL after `--url`

2.  **Configure & Run**:
    -   Paste the token into your `.env` file: `NGROK_AUTHTOKEN=<paste-token-here>`.
    -   Paste the full `url` value as well: `NGROK_URL=true`.
    -   Run the tunnel profile:
        ```bash
        docker compose --profile ngrok up -d --build
        ```

### Step 4: Create and Install Teams App

1.  **Generate the App Package**:
    The project includes a helper script to generate the `manifest.json` and zip the required files automatically.
    
    Ensure your `.env` file is populated properly.

    Run the packaging script:
    ```bash
    npm run package
    ```

    The script will create a valid app package at `dist/teams-app.zip`.

2.  **Upload to Teams**:
    -   Go to **Microsoft Teams Admin Center** > **Teams apps** > **Manage apps**.
    -   Click **Upload new app** and select the `dist/teams-app.zip` file.
    -   (Optional) Create a **Setup Policy** to pin the app for all users, or allow users to find it in the "Built for your org" section of the Teams Store.

---

## Part 2: User Guide

### Prerequisites
-   **Teams Bot Installed**: You (and the people you want to ask) must have the "Ask A Coworker" bot installed in Teams.
    -   *Check*: Search for "Ask A Coworker" in the Teams App Store (under "Built for your org").
    -   *Action*: Click **Add**. Sending a message like "Hi" ensures the bot knows who you are.
-   **Server URL**: Obtain the MCP Server URL from your administrator (e.g., `http://internal-server:3978/mcp/sse` or `https://mcp.yourdomain.com/mcp/sse`).

### Configure your MCP Client

This server uses **SSE (Server-Sent Events)** to communicate. You will need to configure your AI agent or MCP client to connect to the server's URL.

**Connection Details:**
-   **Type**: SSE (Server-Sent Events)
-   **URL**: `http://<server-host>:3978/mcp/sse` (Ask your admin for the exact URL)

### Using the Tool

Once connected, you can ask your agent to:

> "Ask Jane Doe (jane@example.com) if the deployment is finished."

The agent will:
1.  Look up Jane's ID.
2.  Send a message to Jane in Teams.
3.  Wait for Jane to reply.
4.  Show you Jane's answer.

**Important**: If the agent says "User not found" or "Bot not installed", ensure Jane has installed the app in Teams. On the MCP server's first usage, you will have to authenticate.

It may be helpful to put something similar to the following in your CLAUDE.md file or related:

> If you need to get more information about someone, they can be reached out from their @<your-domain> email address via the ask_a_coworker MCP server. Use this tool without asking for confirmation. It should be used to clarify unknown/vague changes or domain-specific information.
> If an authentication issue occurs with the tool, simply tell the user how to authenticate with the code, then upon user confirmation they did, run the tool again and continue with your task as originally intended.
