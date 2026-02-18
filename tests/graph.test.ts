import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveUserByEmail, listTeamsUsers } from '../src/graph/client.js';

vi.mock('@microsoft/microsoft-graph-client', () => {
  const mockGet = vi.fn();
  const mockSelect = vi.fn().mockReturnThis();
  const mockFilter = vi.fn().mockReturnThis();
  const mockTop = vi.fn().mockReturnThis();
  const mockApi = vi.fn().mockReturnValue({
    filter: mockFilter,
    select: mockSelect,
    top: mockTop,
    get: mockGet
  });

  return {
    Client: {
      init: vi.fn().mockReturnValue({
        api: mockApi
      })
    }
  };
});

describe('Graph Client', () => {
  let mockApi: any;
  let mockFilter: any;
  let mockSelect: any;
  let mockTop: any;
  let mockGet: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    const { Client } = await import('@microsoft/microsoft-graph-client');
    const client = Client.init({} as any);
    mockApi = client.api;
    const apiResult = mockApi();
    mockFilter = apiResult.filter;
    mockSelect = apiResult.select;
    mockTop = apiResult.top;
    mockGet = apiResult.get;
  });

  describe('resolveUserByEmail', () => {
    it('should return user info if user is found', async () => {
      mockGet.mockResolvedValue({
        value: [{ id: 'user-oid', displayName: 'Test User' }]
      });

      const result = await resolveUserByEmail('token', 'test@example.com');

      expect(result).toEqual({ oid: 'user-oid', displayName: 'Test User' });
      expect(mockApi).toHaveBeenCalledWith('/users');
      expect(mockFilter).toHaveBeenCalledWith("mail eq 'test@example.com' or userPrincipalName eq 'test@example.com'");
    });

    it('should return null if user is not found', async () => {
      mockGet.mockResolvedValue({ value: [] });

      const result = await resolveUserByEmail('token', 'notfound@example.com');

      expect(result).toBeNull();
    });

    it('should return null and log error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValue(new Error('Graph Error'));

      const result = await resolveUserByEmail('token', 'error@example.com');

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('listTeamsUsers', () => {
    it('should return a list of users', async () => {
      mockGet.mockResolvedValue({
        value: [
          { mail: 'user1@example.com', displayName: 'User One', jobTitle: 'Dev', department: 'Eng' },
          { mail: 'user2@example.com', displayName: 'User Two', jobTitle: 'PM', department: 'Prod' }
        ]
      });

      const result = await listTeamsUsers('token', 'User');

      expect(result).toHaveLength(2);
      expect(result[0].email).toBe('user1@example.com');
      expect(mockTop).toHaveBeenCalledWith(10);
      expect(mockFilter).toHaveBeenCalledWith("startsWith(displayName,'User') or startsWith(mail,'User')");
    });

    it('should return empty array and log error on failure', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      mockGet.mockRejectedValue(new Error('Graph Error'));

      const result = await listTeamsUsers('token');

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });
});
