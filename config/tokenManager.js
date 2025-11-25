import axios from 'axios';
import fs from 'fs';
import path from 'path';
import os from 'os';

class TokenManager {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.clientId = null;
    this.clientSecret = null;
    this.cloudId = null;
    this.tokenUrl = 'https://auth.atlassian.com/oauth/token';
    this.resourcesUrl = 'https://api.atlassian.com/oauth/token/accessible-resources';
    this.cacheDir = path.join(os.homedir(), '.jira-mcp');
    this.cacheFile = path.join(this.cacheDir, 'cloud-id.cache');
    this.tokenCacheFile = path.join(this.cacheDir, 'tokens.cache');
    this.isRefreshing = false; // Prevent concurrent refresh
    this.refreshPromise = null; // Store ongoing refresh promise
  }

  setCredentials(config) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    
    // Try to load cached tokens first
    const cachedTokens = this.loadCachedTokens();
    
    if (cachedTokens && cachedTokens.clientId === this.clientId) {
      // Use cached tokens if they match the same client (silent load)
      this.accessToken = cachedTokens.accessToken;
      this.refreshToken = cachedTokens.refreshToken;
      this.cloudId = cachedTokens.cloudId;
    } else {
      // Use provided tokens
      this.accessToken = config.access_token;
      this.refreshToken = config.refresh_token;
      this.cloudId = config.cloud_id;
      
      // Save to cache
      if (this.accessToken && this.refreshToken) {
        this.saveCachedTokens();
      }
    }
    
    // Try to load cached cloud ID if not set
    if (!this.cloudId) {
      this.cloudId = this.loadCachedCloudId();
    }
  }

  loadCachedCloudId() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        const cached = JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
        // Cache valid for 7 days
        if (cached.cloudId && cached.timestamp && (Date.now() - cached.timestamp < 7 * 24 * 60 * 60 * 1000)) {
          // Silent load
          return cached.cloudId;
        }
      }
    } catch (_error) {
      // Ignore cache errors
    }
    return null;
  }

  saveCachedCloudId(cloudId) {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      fs.writeFileSync(this.cacheFile, JSON.stringify({
        cloudId: cloudId,
        timestamp: Date.now()
      }));
    } catch (error) {
      console.error('Warning: Failed to cache cloud ID:', error.message);
    }
  }

  loadCachedTokens() {
    try {
      if (fs.existsSync(this.tokenCacheFile)) {
        const cached = JSON.parse(fs.readFileSync(this.tokenCacheFile, 'utf8'));
        
        // Validate token is not expired
        if (cached.accessToken && cached.refreshToken) {
          try {
            const tokenPayload = this.decodeJWT(cached.accessToken);
            const currentTime = Math.floor(Date.now() / 1000);
            
            // If token expires in more than 5 minutes, it's still good
            if (tokenPayload.exp > currentTime + 300) {
              // Tokens valid, silent load
              return cached;
            } else {
              // Tokens expired, will refresh on first use
              return cached;
            }
          } catch (error) {
            console.error('⚠️  Failed to decode cached token:', error.message);
          }
        }
      }
    } catch (error) {
      console.error('⚠️  Failed to load cached tokens:', error.message);
    }
    return null;
  }

  saveCachedTokens() {
    try {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      
      const tokenData = {
        accessToken: this.accessToken,
        refreshToken: this.refreshToken,
        cloudId: this.cloudId,
        clientId: this.clientId,
        timestamp: Date.now(),
        lastRefreshed: new Date().toISOString()
      };
      
      fs.writeFileSync(this.tokenCacheFile, JSON.stringify(tokenData, null, 2));
      // Silent save, only log errors
    } catch (error) {
      console.error('Warning: Failed to cache tokens:', error.message);
    }
  }

  async initialize() {
    if (!this.accessToken || !this.refreshToken || !this.clientId || !this.clientSecret) {
      throw new Error('Missing required OAuth credentials. Please provide: access_token, refresh_token, client_id, client_secret');
    }

    // Get cloud ID if not set - do this in background to avoid blocking
    if (!this.cloudId) {
      // Don't await - fetch in background
      this.fetchCloudId().catch(err => {
        console.error('Warning: Failed to fetch cloud ID:', err.message);
      });
      
      // Give it a short time to complete
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.error('✅ Token manager initialized');
    if (this.cloudId) {
      console.error(`   Cloud ID: ${this.cloudId}`);
    }
    
    // Note: Token validation happens lazily on first use
  }

  decodeJWT(token) {
    try {
      const base64Payload = token.split('.')[1];
      const payload = Buffer.from(base64Payload, 'base64').toString('utf-8');
      return JSON.parse(payload);
    } catch {
      throw new Error('Invalid JWT token');
    }
  }

  async validateAndRefreshToken() {
    try {
      // If already refreshing, wait for that to complete
      if (this.isRefreshing && this.refreshPromise) {
        // Silently wait, no need to log every time
        await this.refreshPromise;
        return;
      }

      // Try to decode and validate token
      let tokenPayload;
      try {
        tokenPayload = this.decodeJWT(this.accessToken);
      } catch (_decodeError) {
        // Token is invalid or malformed, force refresh
        // Only log critical errors
        console.error('⚠️  Token invalid, refreshing...');
        this.isRefreshing = true;
        this.refreshPromise = this.refreshAccessToken()
          .finally(() => {
            this.isRefreshing = false;
            this.refreshPromise = null;
          });
        await this.refreshPromise;
        return;
      }

      const currentTime = Math.floor(Date.now() / 1000);

      // If token expires in less than 5 minutes, refresh it
      if (tokenPayload.exp > currentTime + 300) {
        // Token is still valid, no need to refresh
        return;
      }

      // Token expired, refresh silently (will log if fails)
      
      // Set refreshing flag and store promise
      this.isRefreshing = true;
      this.refreshPromise = this.refreshAccessToken()
        .finally(() => {
          this.isRefreshing = false;
          this.refreshPromise = null;
        });
      
      await this.refreshPromise;
    } catch (_error) {
      console.error('❌ Token validation error:', _error.message);
      throw new Error('Token validation failed: ' + _error.message);
    }
  }

  async refreshAccessToken(retries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        // Only log on first attempt or failures
        if (attempt === 1) {
          console.error('🔄 Refreshing token...');
        }
        
        const response = await axios.post(this.tokenUrl, {
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: this.refreshToken
        }, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 15000 // Increased to 15s
        });

        // Update tokens in memory
        this.accessToken = response.data.access_token;
        this.refreshToken = response.data.refresh_token;

        // Save to cache immediately
        this.saveCachedTokens();

        // Only log if it took multiple attempts
        if (attempt > 1) {
          console.error(`✅ Token refreshed after ${attempt} attempts`);
        }
        return response.data;
      } catch (error) {
        const isLastAttempt = attempt === retries;
        const errorMsg = error.response?.data?.error_description || error.response?.data?.error || error.message;
        
        if (isLastAttempt) {
          console.error(`❌ Token refresh failed after ${retries} attempts:`, errorMsg);
          throw new Error(`Failed to refresh access token: ${errorMsg}`);
        }
        
        console.error(`⚠️  Attempt ${attempt} failed: ${errorMsg}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Exponential backoff
      }
    }
  }

  async fetchCloudId(retries = 3, delay = 1000) {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        console.error(`🔄 Fetching Cloud ID (attempt ${attempt}/${retries})...`);
        
        const response = await axios.get(this.resourcesUrl, {
          headers: {
            'Authorization': `Bearer ${this.accessToken}`,
            'Accept': 'application/json'
          },
          timeout: 10000 // 10s timeout
        });

        if (response.data && response.data.length > 0) {
          this.cloudId = response.data[0].id;
          this.saveCachedCloudId(this.cloudId);
          console.error('✅ Fetched Cloud ID:', this.cloudId);
          return;
        } else {
          throw new Error('No accessible resources found');
        }
      } catch (error) {
        const isLastAttempt = attempt === retries;
        
        if (isLastAttempt) {
          console.error(`❌ Failed to fetch cloud ID after ${retries} attempts:`, error.message);
          throw error;
        }
        
        console.error(`⚠️  Attempt ${attempt} failed: ${error.message}, retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Exponential backoff
        delay *= 2;
      }
    }
  }

  getAccessToken() {
    return this.accessToken;
  }

  getCloudId() {
    return this.cloudId;
  }
}

export default new TokenManager();
