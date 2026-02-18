# Ask A Coworker MCP

An MCP (Model Context Protocol) server that allows AI agents to send questions to coworkers via Microsoft Teams and wait for their replies.

## Overview

This tool lets your AI agent get knowledge from the most valuable source possible - your coworkers. When an agent needs information only a specific person has, it can use the `ask_a_coworker` tool to send a direct message to that user in Teams. The agent pauses execution until the user replies or a timeout occurs.

A dedicated bot is used to ensure clarity and to avoid impersonation.

![A usage screenshot, showing an AI agent on the left, and a Teams chat on the right](screenshots/usage.png)

## Features

- **Direct Teams Integration**: Sends questions as Adaptive Cards or normal text in 1:1 chats.
- **Synchronous Execution**: The AI agent waits for the reply, enabling seamless multi-step workflows.
- **Secure**: Uses Microsoft Entra ID for authentication and delegated permissions.
- **Dockerized**: Easy to deploy with Docker Compose.
- **Resilient**: Handles timeouts and stores pending questions in PostgreSQL.

## Prerequisites

- **Docker & Docker Compose**
- **Microsoft 365 Tenant** with administrative access to register applications.
- **ngrok** (optional, for exposing the local bot to the internet).

## Setup

For detailed step-by-step instructions on setting up the server (for Administrators) and connecting to it (for Users), please refer to the **[Setup Guide](SETUP_GUIDE.md)**.

### Quick Start (Local Docker)

1.  Copy `.env.example` to `.env` and fill in your Azure Bot credentials.
2.  Run:
    ```bash
    docker compose up --build -d
    ```
3.  The MCP server will be available at `http://localhost:3978/mcp/sse`.

## Usage with MCP Client

Configure your MCP client (e.g., Claude Desktop, etc.) to connect to the SSE endpoint:

-   **URL**: `http://localhost:3978/mcp/sse`

### Available Tools

-   `ask_a_coworker(question: string, targetEmail: string, timeout: number)`: Sends a question to a user and waits for a reply.
-   `list_people(query: string)`: Searches for people in the organization.

## Development

Install dependencies:
```bash
npm install
```

Run migrations:
```bash
npm run migrate
```

Start in dev mode:
```bash
npm run dev
```

## Teams App Packaging

To generate the Teams app package (manifest.json + icons):
```bash
npm run package
```
This creates `dist/teams-app.zip` which you can upload to the Teams Admin Center.

## Database Migrations

Database schema is managed via Kysely migrations.
To run migrations manually:
```bash
npm run migrate
```
When running via Docker, migrations are applied automatically on startup.
