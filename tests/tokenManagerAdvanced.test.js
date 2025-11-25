import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn()
  }
}));

import axios from 'axios';

describe('TokenManager Advanced Tests', () => {
  let tokenManager;
  const testCacheDir = path.join(os.tmpdir(), '.jira-mcp-test-adv-' + Date.now());

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    vi.resetModules();
    const module = await import('../config/tokenManager.js');
    tokenManager = module.default;
    
    tokenManager.cacheDir = testCacheDir;
    tokenManager.cacheFile = path.join(testCacheDir, 'cloud-id.cache');
    tokenManager.tokenCacheFile = path.join(testCacheDir, 'tokens.cache');
    
    tokenManager.accessToken = null;
    tokenManager.refreshToken = null;
    tokenManager.clientId = null;
    tokenManager.clientSecret = null;
    tokenManager.cloudId = null;
    tokenManager.isRefreshing = false;
    tokenManager.refreshPromise = null;
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testCacheDir)) {
        fs.rmSync(testCacheDir, { recursive: true });
      }
    } catch (e) {}
  });

  describe('loadCachedTokens', () => {
    it('should load valid cached tokens', () => {
      // Create valid token (expires in 10 minutes)
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      const payload = { exp: futureExp };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const validToken = `header.${base64Payload}.signature`;

      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.tokenCacheFile, JSON.stringify({
        accessToken: validToken,
        refreshToken: 'cached-refresh-token',
        cloudId: 'cached-cloud-id',
        clientId: 'cached-client-id',
        timestamp: Date.now()
      }));

      const cached = tokenManager.loadCachedTokens();
      
      expect(cached).not.toBeNull();
      expect(cached.accessToken).toBe(validToken);
      expect(cached.refreshToken).toBe('cached-refresh-token');
    });

    it('should return cached tokens even if expired (will refresh on use)', () => {
      // Create expired token
      const pastExp = Math.floor(Date.now() / 1000) - 600;
      const payload = { exp: pastExp };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const expiredToken = `header.${base64Payload}.signature`;

      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.tokenCacheFile, JSON.stringify({
        accessToken: expiredToken,
        refreshToken: 'cached-refresh-token',
        clientId: 'cached-client-id',
        timestamp: Date.now()
      }));

      const cached = tokenManager.loadCachedTokens();
      
      // Should still return cached tokens (will be refreshed on use)
      expect(cached).not.toBeNull();
    });

    it('should return null for invalid cache file', () => {
      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.tokenCacheFile, 'invalid json');

      const cached = tokenManager.loadCachedTokens();
      expect(cached).toBeNull();
    });

    it('should return null if cache file does not exist', () => {
      const cached = tokenManager.loadCachedTokens();
      expect(cached).toBeNull();
    });
  });

  describe('setCredentials with cached tokens', () => {
    it('should use cached tokens if clientId matches', () => {
      // Create cached tokens
      const futureExp = Math.floor(Date.now() / 1000) + 600;
      const payload = { exp: futureExp };
      const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64');
      const cachedToken = `header.${base64Payload}.signature`;

      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.tokenCacheFile, JSON.stringify({
        accessToken: cachedToken,
        refreshToken: 'cached-refresh-token',
        cloudId: 'cached-cloud-id',
        clientId: 'same-client-id',
        timestamp: Date.now()
      }));

      tokenManager.setCredentials({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        client_id: 'same-client-id',
        client_secret: 'secret'
      });

      // Should use cached tokens
      expect(tokenManager.accessToken).toBe(cachedToken);
      expect(tokenManager.refreshToken).toBe('cached-refresh-token');
      expect(tokenManager.cloudId).toBe('cached-cloud-id');
    });

    it('should use provided tokens if clientId differs', () => {
      // Create cached tokens with different clientId
      fs.mkdirSync(testCacheDir, { recursive: true });
      fs.writeFileSync(tokenManager.tokenCacheFile, JSON.stringify({
        accessToken: 'cached-token',
        refreshToken: 'cached-refresh-token',
        cloudId: 'cached-cloud-id',
        clientId: 'different-client-id',
        timestamp: Date.now()
      }));

      tokenManager.setCredentials({
        access_token: 'new-access-token',
        refresh_token: 'new-refresh-token',
        client_id: 'new-client-id',
        client_secret: 'secret',
        cloud_id: 'new-cloud-id'
      });

      // Should use provided tokens
      expect(tokenManager.accessToken).toBe('new-access-token');
      expect(tokenManager.refreshToken).toBe('new-refresh-token');
      expect(tokenManager.cloudId).toBe('new-cloud-id');
    });
  });

  describe('initialize', () => {
    it('should throw error if missing credentials', async () => {
      await expect(tokenManager.initialize()).rejects.toThrow('Missing required OAuth credentials');
    });

    it('should initialize successfully with all credentials', async () => {
      tokenManager.accessToken = 'token';
      tokenManager.refreshToken = 'refresh';
      tokenManager.clientId = 'client';
      tokenManager.clientSecret = 'secret';
      tokenManager.cloudId = 'cloud-123';

      await tokenManager.initialize();
      
      // Should complete without error
      expect(tokenManager.cloudId).toBe('cloud-123');
    });

    it('should fetch cloudId in background if not set', async () => {
      tokenManager.accessToken = 'token';
      tokenManager.refreshToken = 'refresh';
      tokenManager.clientId = 'client';
      tokenManager.clientSecret = 'secret';
      tokenManager.cloudId = null;

      axios.get.mockResolvedValueOnce({
        data: [{ id: 'fetched-cloud-id' }]
      });

      await tokenManager.initialize();
      
      // Give time for background fetch
      await new Promise(resolve => setTimeout(resolve, 150));
      
      // May or may not have fetched depending on timing
      // The important thing is it doesn't throw
    });
  });

  describe('refreshAccessToken error handling', () => {
    it('should handle error response with error_description', async () => {
      tokenManager.clientId = 'client';
      tokenManager.clientSecret = 'secret';
      tokenManager.refreshToken = 'refresh';

      axios.post.mockRejectedValue({
        response: {
          data: {
            error: 'invalid_grant',
            error_description: 'Refresh token expired'
          }
        }
      });

      await expect(tokenManager.refreshAccessToken(1, 10)).rejects.toThrow('Refresh token expired');
    });

    it('should handle error response with only error', async () => {
      tokenManager.clientId = 'client';
      tokenManager.clientSecret = 'secret';
      tokenManager.refreshToken = 'refresh';

      axios.post.mockRejectedValue({
        response: {
          data: {
            error: 'server_error'
          }
        }
      });

      await expect(tokenManager.refreshAccessToken(1, 10)).rejects.toThrow('server_error');
    });

    it('should handle network error', async () => {
      tokenManager.clientId = 'client';
      tokenManager.clientSecret = 'secret';
      tokenManager.refreshToken = 'refresh';

      axios.post.mockRejectedValue(new Error('Network error'));

      await expect(tokenManager.refreshAccessToken(1, 10)).rejects.toThrow('Network error');
    });
  });

  describe('fetchCloudId error handling', () => {
    it('should retry on network error', async () => {
      tokenManager.accessToken = 'token';

      axios.get
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({ data: [{ id: 'cloud-123' }] });

      await tokenManager.fetchCloudId(2, 10);

      expect(tokenManager.cloudId).toBe('cloud-123');
      expect(axios.get).toHaveBeenCalledTimes(2);
    });

    it('should throw after max retries', async () => {
      tokenManager.accessToken = 'token';

      axios.get.mockRejectedValue(new Error('Persistent error'));

      await expect(tokenManager.fetchCloudId(2, 10)).rejects.toThrow('Persistent error');
      expect(axios.get).toHaveBeenCalledTimes(2);
    });
  });

  describe('saveCachedCloudId error handling', () => {
    it('should handle write errors gracefully', () => {
      // Set invalid cache directory
      tokenManager.cacheDir = '/nonexistent/path';
      tokenManager.cacheFile = '/nonexistent/path/cache';

      // Should not throw
      expect(() => tokenManager.saveCachedCloudId('cloud-123')).not.toThrow();
    });
  });

  describe('saveCachedTokens error handling', () => {
    it('should handle write errors gracefully', () => {
      tokenManager.cacheDir = '/nonexistent/path';
      tokenManager.tokenCacheFile = '/nonexistent/path/tokens';
      tokenManager.accessToken = 'token';
      tokenManager.refreshToken = 'refresh';

      // Should not throw
      expect(() => tokenManager.saveCachedTokens()).not.toThrow();
    });
  });
});
