import { config } from '../config.js';

export interface AuthenticatedUser {
  oid: string;
  tid: string;
  email: string;
  displayName?: string;
}

/**
 * Middleware to validate Entra ID bearer tokens.
 */
export async function authMiddleware(req: any, res: any, next: any) {
  if (!config.MCP_AUTH_REQUIRED) {
    // For development, inject a mock user if auth is disabled
    req.user = {
      oid: 'mock-oid',
      tid: config.MICROSOFT_APP_TENANT_ID,
      email: 'mock-user@example.com',
      displayName: 'Mock User',
    };
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid bearer token' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    // Basic validation: decode and check tenant ID. 
    // In a full implementation, we should use a library like `jose` to verify signatures against Microsoft's JWKS.
    const decodedToken = decodeToken(token);
    
    if (!decodedToken) {
       res.status(401).json({ error: 'Unauthorized: Invalid token format' });
       return;
    }

    if (decodedToken.tid !== config.MICROSOFT_APP_TENANT_ID) {
      res.status(401).json({ error: 'Unauthorized: Token is from an untrusted tenant' });
      return;
    }

    req.user = {
      oid: decodedToken.oid,
      tid: decodedToken.tid,
      email: decodedToken.preferred_username || decodedToken.upn || decodedToken.email,
      displayName: decodedToken.name,
    };

    next();
  } catch (error) {
    console.error('Token validation error:', error);
    res.status(401).json({ error: 'Unauthorized: Token validation failed' });
  }
}

function decodeToken(token: string): any {
  try {
    const parts = token.split('.');
    const payload = parts[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64').toString());
  } catch {
    return null;
  }
}
