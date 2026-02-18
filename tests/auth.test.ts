import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { authMiddleware } from '../src/auth/middleware.js';
import { config } from '../src/config.js';

// Mock config for tests
vi.mock('../src/config.js', () => ({
  config: {
    MCP_AUTH_REQUIRED: true,
    MICROSOFT_APP_TENANT_ID: 'test-tenant-id'
  }
}));

describe('authMiddleware', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    app.use(authMiddleware);
    app.get('/test', (req, res) => {
      res.status(200).json({ user: (req as any).user });
    });
  });

  it('should return 401 if no authorization header is present', async () => {
    const response = await request(app).get('/test');
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing or invalid bearer token');
  });

  it('should return 401 if authorization header does not start with Bearer', async () => {
    const response = await request(app)
      .get('/test')
      .set('Authorization', 'Basic token');
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Missing or invalid bearer token');
  });

  it('should return 401 if token format is invalid', async () => {
    const response = await request(app)
      .get('/test')
      .set('Authorization', 'Bearer invalid-token');
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Invalid token format');
  });

  it('should return 401 if token tenant ID does not match config', async () => {
    const payload = Buffer.from(JSON.stringify({ tid: 'wrong-tenant', oid: 'user-oid' })).toString('base64');
    const token = `header.${payload}.signature`;
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(401);
    expect(response.body.error).toContain('Token is from an untrusted tenant');
  });

  it('should inject user into request if token is valid', async () => {
    const payload = Buffer.from(JSON.stringify({ 
      tid: 'test-tenant-id', 
      oid: 'user-oid',
      preferred_username: 'test@example.com',
      name: 'Test User'
    })).toString('base64');
    const token = `header.${payload}.signature`;
    
    const response = await request(app)
      .get('/test')
      .set('Authorization', `Bearer ${token}`);
    
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      oid: 'user-oid',
      tid: 'test-tenant-id',
      email: 'test@example.com',
      displayName: 'Test User'
    });
  });

  it('should inject mock user if MCP_AUTH_REQUIRED is false', async () => {
    // Override mock for this specific test
    vi.mocked(config).MCP_AUTH_REQUIRED = false;
    
    const response = await request(app).get('/test');
    
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      oid: 'mock-oid',
      tid: 'test-tenant-id',
      email: 'mock-user@example.com',
      displayName: 'Mock User'
    });
    
    // Reset for other tests
    vi.mocked(config).MCP_AUTH_REQUIRED = true;
  });
});
