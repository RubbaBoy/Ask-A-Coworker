import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getBotToken, botMsalClient } from '../src/auth/botAuth.js';

// Mock MSAL
vi.mock('@azure/msal-node', () => {
  return {
    ConfidentialClientApplication: vi.fn(function() {
      return {
        acquireTokenByClientCredential: vi.fn()
      };
    }),
    LogLevel: {
      Error: 0
    }
  };
});

// Mock config
vi.mock('../src/config.js', () => ({
  config: {
    MICROSOFT_APP_ID: 'test-id',
    MICROSOFT_APP_PASSWORD: 'test-password',
    MICROSOFT_APP_TENANT_ID: 'test-tenant'
  }
}));

describe('getBotToken', () => {
  it('should return access token on success', async () => {
    const mockResult = { accessToken: 'mock-access-token' };
    vi.mocked(botMsalClient.acquireTokenByClientCredential).mockResolvedValue(mockResult as any);

    const token = await getBotToken();

    expect(token).toBe('mock-access-token');
    expect(botMsalClient.acquireTokenByClientCredential).toHaveBeenCalledWith({
      scopes: ['https://graph.microsoft.com/.default']
    });
  });

  it('should return null and log error on failure', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(botMsalClient.acquireTokenByClientCredential).mockRejectedValue(new Error('MSAL Error'));

    const token = await getBotToken();

    expect(token).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith('Error acquiring bot token:', expect.any(Error));
    
    consoleSpy.mockRestore();
  });
});
