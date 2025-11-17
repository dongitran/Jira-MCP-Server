import axios from 'axios';

class TokenManager {
  constructor() {
    this.accessToken = null;
    this.refreshToken = null;
    this.clientId = null;
    this.clientSecret = null;
    this.cloudId = null;
    this.tokenUrl = 'https://auth.atlassian.com/oauth/token';
    this.resourcesUrl = 'https://api.atlassian.com/oauth/token/accessible-resources';
  }

  setCredentials(config) {
    this.accessToken = config.access_token;
    this.refreshToken = config.refresh_token;
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.cloudId = config.cloud_id;
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
      const tokenPayload = this.decodeJWT(this.accessToken);
      const currentTime = Math.floor(Date.now() / 1000);

      // If token expires in less than 5 minutes, refresh it
      if (tokenPayload.exp > currentTime + 300) {
        console.error('✅ Access token is still valid');
        return;
      }

      console.error('🔄 Access token expired, refreshing...');
      await this.refreshAccessToken();
    } catch (_error) {
      console.error('Token validation error:', _error.message);
      throw new Error('Token validation failed');
    }
  }

  async refreshAccessToken() {
    try {
      const response = await axios.post(this.tokenUrl, {
        grant_type: 'refresh_token',
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token;

      console.error('✅ Token refreshed successfully');
      return response.data;
    } catch (error) {
      console.error('Token refresh error:', error.response?.data || error.message);
      throw new Error('Failed to refresh access token');
    }
  }

  async fetchCloudId() {
    try {
      const response = await axios.get(this.resourcesUrl, {
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json'
        }
      });

      if (response.data && response.data.length > 0) {
        this.cloudId = response.data[0].id;
        console.error('✅ Fetched Cloud ID:', this.cloudId);
      } else {
        throw new Error('No accessible resources found');
      }
    } catch (error) {
      console.error('Failed to fetch cloud ID:', error.message);
      throw error;
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
