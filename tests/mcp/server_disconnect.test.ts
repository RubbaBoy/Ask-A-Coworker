import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';

// Hoist mocks
const mocks = vi.hoisted(() => {
  const mcpServerInstance = {
    tool: vi.fn(),
    connect: vi.fn(),
    close: vi.fn()
  };
  
  const sseTransportInstance = {
    sessionId: 'test-session',
    start: vi.fn(), // start is called by connect usually
    handlePostMessage: vi.fn(),
    close: vi.fn(),
    onclose: undefined as Function | undefined
  };

  // Mock constructors using function syntax to avoid Vitest warning
  const McpServerMock = vi.fn(function(this: any) { return mcpServerInstance; });
  const SSEServerTransportMock = vi.fn(function(this: any) { return sseTransportInstance; });

  return {
    mcpServer: mcpServerInstance,
    sseTransport: sseTransportInstance,
    McpServerMock,
    SSEServerTransportMock
  };
});

// Mock modules
vi.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({
  McpServer: mocks.McpServerMock
}));

vi.mock('@modelcontextprotocol/sdk/server/sse.js', () => ({
  SSEServerTransport: mocks.SSEServerTransportMock
}));

vi.mock('../../src/mcp/tools/askCoworker.js', () => ({
  createAskCoworkerTool: vi.fn(() => ({
    name: 'ask_a_coworker',
    description: 'desc',
    parameters: { shape: {} },
    execute: vi.fn()
  }))
}));
vi.mock('../../src/mcp/tools/listPeople.js', () => ({
  createListPeopleTool: vi.fn(() => ({
    name: 'list_available_people',
    description: 'desc',
    parameters: { shape: {} },
    execute: vi.fn()
  }))
}));

vi.mock('../../src/auth/userAuth.js', () => {
  return {
    UserAuthClient: vi.fn(function(this: any) {
      this.getUserToken = vi.fn();
      this.msalClient = {};
    })
  };
});

import { setupMcpServer } from '../../src/mcp/server.js';

describe('MCP Server Disconnect', () => {
  let mockApp: any;
  let sseHandler: Function;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockApp = {
      get: vi.fn(),
      post: vi.fn()
    };
    
    setupMcpServer(mockApp as any);
    
    // Capture the SSE handler
    // app.get("/mcp/sse", async (req, res) => { ... })
    const getCalls = mockApp.get.mock.calls;
    const call = getCalls.find((c: any[]) => c[0] === '/mcp/sse');
    if (!call) throw new Error('SSE endpoint not registered');
    sseHandler = call[1];
  });

  it('should not call server.close() recursively on transport close', async () => {
    const req = {};
    const res = {};

    // Execute the handler
    await sseHandler(req, res);

    // Verify setup
    expect(mocks.McpServerMock).toHaveBeenCalled();
    expect(mocks.SSEServerTransportMock).toHaveBeenCalled();
    expect(mocks.mcpServer.connect).toHaveBeenCalledWith(mocks.sseTransport);

    // Verify onclose handler is set
    expect(mocks.sseTransport.onclose).toBeDefined();

    // Trigger onclose
    if (mocks.sseTransport.onclose) {
        mocks.sseTransport.onclose();
    } else {
        throw new Error('onclose handler not set');
    }

    // Assert server.close() is NOT called
    // This confirms the fix that removed server.close() from the onclose handler
    expect(mocks.mcpServer.close).not.toHaveBeenCalled();
  });
});
