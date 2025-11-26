import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock axios before importing tokenManager
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

// Import after mocking
import axios from 'axios';

// We need to create a fresh instance for testing
// First, let's test the TokenManager class directly
describe('TokenManager', () => {
  let tokenManager;
  const testCacheDir = path.join(os.tmpdir(), '.jira-mcp-test-' + Date.now());

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Dynamically import to get fresh instance
    const module = await import('../config/tokenManager.js');
    tokenManager = module.default;
    
    // Override cache paths for testing
    tokenManager.cacheDir = testCacheDir;
    tokenManager.cacheFile = path.join(testCacheDir, 'cloud-id.cache');
    tokenManager.tokenCacheFile = path.join(testCacheDir, 'tokens.cache');
    
    // Reset state
    tokenManager.accessToken = null;
    tokenManager.refreshToken = null;
    tokenManager.clientId = null;
    tokenManager.clientSecret = null;
    tokenManager.cloudId = null;
    tokenManager.isRefreshing = false;
    tokenManager.refreshPromise = null;
  });

  afterEach(() => {
    // Clean up test cache directory
    try {
      if (fs.existsSync(testCacheDir)) {
        fs.rmSync(testCacheDir, { recursive: true });
      }
    } catch (_e) {
      // Ignore cleanup errors
    }
  });

  describe('setCredentials', () => {
    it('should set credentials from config', () => {
      const config = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        cloud_id: 'test-cloud-id'
      };

      tokenManager.setCredentials(config);

      expect(tokenManager.accessToken).toBe('test-access-token');
      expect(tokenManager.refreshToken).toBe('test-refresh-token');
      expect(tokenManager.clientId).toBe('test-client-id');
      expect(tokenManager.clientSecret).toBe('test-client-secret');
      expect(tokenManager.cloudId).toBe('test-cloud-id');
    });

    it('should save tokens to cache after setting credentials', () => {
      const config = {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        cloud_id: 'test-cloud-id'
      };

      tokenManager.setCredentials(config);

      expect(fs.existsSync(tokenManager.tokenCacheFile)).toBe(true);
      const cached = JSON.parse(fs.readFileSync(tokenManager.tokenCacheFile, 'utf8'));
      expect(cached.accessToken).toBe('test-access-token');
      expect(cached.refreshToken).toBe('test-refresh-token');
    });
  });

  describe('decodeJWT', () => {
    it('should decode a valid JWT token', () => {
      // Create a simple JWT with payload { "sub": "123", "exp": 1234567890 }
      const payload = { sub: '123', exp: 1234567890 };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const fakeJWT = `header.${base64Payload}.signature`;

      const decoded = tokenManager.decodeJWT(fakeJWT);

      expect(decoded.sub).toBe('123');
      expect(decoded.exp).toBe(1234567890);
    });

    it('should throw error for invalid JWT', () => {
      expect(() => tokenManager.decodeJWT('invalid')).toThrow('Invalid JWT token');
      expect(() => tokenManager.decodeJWT('')).toThrow('Invalid JWT token');
    });
  });

  describe('getAccessToken', () => {
    it('should return current access token', () => {
      tokenManager.accessToken = 'my-token';
      expect(tokenManager.getAccessToken()).toBe('my-token');
    });
  });

  describe('getCloudId', () => {
    it('should return current cloud ID', () => {
      tokenManager.cloudId = 'my-cloud-id';
      expect(tokenManager.getCloudId()).toBe('my-cloud-id');
    });
  });

  describe('loadCachedCloudId', () => {
    it('should return null if cache file does not exist', () => {
      const result = tokenManager.loadCachedCloudId();
      expect(result).toBeNull();
    });

    it('should return cached cloud ID if valid', () => {
      // Create cache directory and file
      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.cacheFile, JSON.stringify({
        cloudId: 'cached-cloud-id',
        timestamp: Date.now()
      }));

      const result = tokenManager.loadCachedCloudId();
      expect(result).toBe('cached-cloud-id');
    });

    it('should return null if cache is expired (> 7 days)', () => {
      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.cacheFile, JSON.stringify({
        cloudId: 'old-cloud-id',
        timestamp: Date.now() - (8 * 24 * 60 * 60 * 1000) // 8 days ago
      }));

      const result = tokenManager.loadCachedCloudId();
      expect(result).toBeNull();
    });
  });

  describe('saveCachedCloudId', () => {
    it('should save cloud ID to cache file', () => {
      tokenManager.saveCachedCloudId('new-cloud-id');

      expect(fs.existsSync(tokenManager.cacheFile)).toBe(true);
      const cached = JSON.parse(fs.readFileSync(tokenManager.cacheFile, 'utf8'));
      expect(cached.cloudId).toBe('new-cloud-id');
      expect(cached.timestamp).toBeDefined();
    });
  });

  describe('refreshAccessToken', () => {
    it('should refresh token successfully', async () => {
      tokenManager.clientId = 'test-client-id';
      tokenManager.clientSecret = 'test-client-secret';
      tokenManager.refreshToken = 'old-refresh-token';

      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token'
        }
      });

      await tokenManager.refreshAccessToken();

      expect(tokenManager.accessToken).toBe('new-access-token');
      expect(tokenManager.refreshToken).toBe('new-refresh-token');
      expect(axios.post).toHaveBeenCalledWith(
        'https://auth.atlassian.com/oauth/token',
        {
          grant_type: 'refresh_token',
          client_id: 'test-client-id',
          client_secret: 'test-client-secret',
          refresh_token: 'old-refresh-token'
        },
        expect.any(Object)
      );
    });

    it('should retry on failure', async () => {
      tokenManager.clientId = 'test-client-id';
      tokenManager.clientSecret = 'test-client-secret';
      tokenManager.refreshToken = 'old-refresh-token';

      axios.post
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token'
          }
        });

      await tokenManager.refreshAccessToken(3, 10); // Short delay for testing

      expect(axios.post).toHaveBeenCalledTimes(2);
      expect(tokenManager.accessToken).toBe('new-access-token');
    });

    it('should throw after max retries', async () => {
      tokenManager.clientId = 'test-client-id';
      tokenManager.clientSecret = 'test-client-secret';
      tokenManager.refreshToken = 'old-refresh-token';

      axios.post.mockRejectedValue(new Error('Persistent error'));

      await expect(tokenManager.refreshAccessToken(2, 10)).rejects.toThrow('Failed to refresh access token');
      expect(axios.post).toHaveBeenCalledTimes(2);
    });
  });

  describe('validateAndRefreshToken', () => {
    it('should not refresh if token is still valid', async () => {
      // Create a token that expires in 10 minutes
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      const payload = { exp: futureExp };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      tokenManager.accessToken = `header.${base64Payload}.signature`;

      await tokenManager.validateAndRefreshToken();

      expect(axios.post).not.toHaveBeenCalled();
    });

    it('should refresh if token expires within 5 minutes', async () => {
      tokenManager.clientId = 'test-client-id';
      tokenManager.clientSecret = 'test-client-secret';
      tokenManager.refreshToken = 'old-refresh-token';

      // Create a token that expires in 2 minutes
      const soonExp = Math.floor(Date.now() / 1000) + 120;
      const payload = { exp: soonExp };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      tokenManager.accessToken = `header.${base64Payload}.signature`;

      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token'
        }
      });

      await tokenManager.validateAndRefreshToken();

      expect(axios.post).toHaveBeenCalled();
    });

    it('should refresh if token is invalid/malformed', async () => {
      tokenManager.clientId = 'test-client-id';
      tokenManager.clientSecret = 'test-client-secret';
      tokenManager.refreshToken = 'old-refresh-token';
      tokenManager.accessToken = 'invalid-token';

      axios.post.mockResolvedValueOnce({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token'
        }
      });

      await tokenManager.validateAndRefreshToken();

      expect(axios.post).toHaveBeenCalled();
    });

    it('should prevent concurrent refresh calls', async () => {
      tokenManager.clientId = 'test-client-id';
      tokenManager.clientSecret = 'test-client-secret';
      tokenManager.refreshToken = 'old-refresh-token';
      tokenManager.accessToken = 'invalid-token';

      let resolveRefresh;
      axios.post.mockImplementationOnce(() => new Promise(resolve => {
        resolveRefresh = () => resolve({
          data: {
            access_token: 'new-access-token',
            refresh_token: 'new-refresh-token'
          }
        });
      }));

      // Start two concurrent refresh calls
      const promise1 = tokenManager.validateAndRefreshToken();
      const promise2 = tokenManager.validateAndRefreshToken();

      // Resolve the refresh
      resolveRefresh();

      await Promise.all([promise1, promise2]);

      // Should only call axios.post once
      expect(axios.post).toHaveBeenCalledTimes(1);
    });
  });

  describe('fetchCloudId', () => {
    it('should fetch and cache cloud ID', async () => {
      tokenManager.accessToken = 'test-token';

      axios.get.mockResolvedValueOnce({
        data: [{ id: 'fetched-cloud-id', name: 'Test Site' }]
      });

      await tokenManager.fetchCloudId();

      expect(tokenManager.cloudId).toBe('fetched-cloud-id');
      expect(axios.get).toHaveBeenCalledWith(
        'https://api.atlassian.com/oauth/token/accessible-resources',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-token',
            'Accept': 'application/json'
          }
        })
      );
    });

    it('should throw if no accessible resources', async () => {
      tokenManager.accessToken = 'test-token';

      axios.get.mockResolvedValueOnce({ data: [] });

      await expect(tokenManager.fetchCloudId(1, 10)).rejects.toThrow('No accessible resources found');
    });

    it('should retry on failure', async () => {
      tokenManager.accessToken = 'test-token';

      axios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          data: [{ id: 'fetched-cloud-id' }]
        });

      await tokenManager.fetchCloudId(3, 10);

      expect(axios.get).toHaveBeenCalledTimes(2);
      expect(tokenManager.cloudId).toBe('fetched-cloud-id');
    });
  });
});
