import express from 'express';
import cors from 'cors';
import { config } from './config.js';
import { adapter } from './bot/adapter.js';
import { BotHandler } from './bot/handler.js';
import { replyRegistry } from './pendingReplies/registry.js';
import { setupMcpServer } from './mcp/server.js';
import { startCleanupTask } from './bot/cleanup.js';

const app = express();
app.use(cors());
const port = config.PORT;

const bot = new BotHandler();

// Setup MCP Server before body parsers consume the stream
setupMcpServer(app);

app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Bot endpoint
app.post('/api/messages', async (req, res) => {
  await adapter.process(req, res, (context) => bot.run(context));
});


const server = app.listen(port, () => {
  console.log(`Ask A Coworker server listening on port ${port}`);
  startCleanupTask();
});

// Graceful shutdown
function handleShutdown() {
  console.log('Shutting down server...');
  replyRegistry.cleanup();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
}

process.on('SIGTERM', handleShutdown);
process.on('SIGINT', handleShutdown);

export { app };
