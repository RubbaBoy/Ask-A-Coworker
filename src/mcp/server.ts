import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { createAskCoworkerTool } from "./tools/askCoworker.js";
import { createListPeopleTool } from "./tools/listPeople.js";
import { UserAuthClient } from "../auth/userAuth.js";

export function setupMcpServer(app: express.Express) {
  const transports = new Map<string, SSEServerTransport>();

  app.get("/mcp/sse", async (req, res) => {
    console.log("New SSE connection");
    
    const userAuthClient = new UserAuthClient();

    const server = new McpServer({
      name: "Ask A Coworker",
      version: "1.0.0"
    });

    const askCoworkerTool = createAskCoworkerTool(userAuthClient);
    server.tool(
      askCoworkerTool.name,
      askCoworkerTool.description,
      askCoworkerTool.parameters.shape, 
      askCoworkerTool.execute
    );

    const listPeopleTool = createListPeopleTool(userAuthClient);
    server.tool(
      listPeopleTool.name,
      listPeopleTool.description,
      listPeopleTool.parameters.shape,
      listPeopleTool.execute
    );

    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    transport.onclose = () => {
      console.log("SSE connection closed", transport.sessionId);
      transports.delete(transport.sessionId);
    };

    await server.connect(transport);
  });

  const handleMessages = async (req: express.Request, res: express.Response) => {
    const sessionId = req.query.sessionId as string;
    // console.log("Received message for session", sessionId);
    if (!sessionId) {
      res.status(400).send("Missing sessionId");
      return;
    }
    const transport = transports.get(sessionId);
    if (!transport) {
      res.status(404).send("Session not found");
      return;
    }
    await transport.handlePostMessage(req, res);
  };

  app.post("/mcp/messages", handleMessages);
  app.post("/messages", handleMessages);
  
  console.log("MCP Server setup complete, endpoints mounted at /mcp/sse, /mcp/messages, and /messages");
}
