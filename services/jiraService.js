import axios from 'axios';
import tokenManager from '../config/tokenManager.js';
import logger from '../utils/logger.js';
import retryConfig, { calculateRetryDelay } from '../config/retryConfig.js';
import CircuitBreaker from '../utils/circuitBreaker.js';

class JiraService {
  constructor() {
    this.baseURL = null;
    this.accessToken = null;
    this.cloudId = null;
    this.maxRetries = retryConfig.maxRetries;
    this.requestTimeout = retryConfig.requestTimeout;
    
    // Circuit breaker to prevent cascading failures
    // Note: We record failure on each retry attempt, so with maxRetries=3,
    // a single failed request generates 3 failures. Threshold of 10 means
    // circuit opens after ~3-4 completely failed requests.
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 10,
      successThreshold: 2,
      timeout: 60000, // 60 seconds
      enabled: true // Set to false to disable circuit breaker
    });
  }

  async initialize() {
    this.accessToken = tokenManager.getAccessToken();
    this.cloudId = tokenManager.getCloudId();
    this.baseURL = `https://api.atlassian.com/ex/jira/${this.cloudId}`;
  }

  /**
   * Determine if an error is retryable
   */
  isRetryableError(error) {
    // Network errors (no response) - always retry
    if (!error.response) {
      return true;
    }

    const status = error.response.status;
    
    // Check if status code is in retryable list
    if (retryConfig.retryableStatusCodes.includes(status)) {
      return true;
    }

    // Don't retry on client errors (4xx) or other status codes
    return false;
  }

  /**
   * Sleep for specified milliseconds
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Make HTTP request with retry logic and circuit breaker
   * @param {string} endpoint - API endpoint (e.g., /myself, /issue/KEY-123)
   * @param {string} method - HTTP method
   * @param {object} data - Request body
   * @param {object} options - Additional options
   * @param {string} options.apiType - 'rest' (default) or 'agile'
   * @param {number} options.retryCount - Current retry attempt (internal use)
   * @param {boolean} options.forceTokenRefresh - Force token refresh (internal use)
   */
  async makeRequest(endpoint, method = 'GET', data = null, options = {}) {
    const { apiType = 'rest', retryCount = 0, forceTokenRefresh = false } = options;
    
    // Build full endpoint based on API type
    const apiPath = apiType === 'agile' ? '/rest/agile/1.0' : '/rest/api/3';
    const fullEndpoint = `${apiPath}${endpoint}`;

    // Check circuit breaker
    if (!this.circuitBreaker.canAttempt()) {
      const state = this.circuitBreaker.getState();
      const error = new Error(
        `Circuit breaker is OPEN. Service temporarily unavailable. Next attempt at: ${state.nextAttempt}`
      );
      error.circuitBreakerOpen = true;
      console.error('🚨 Circuit breaker blocked request:', error.message);
      throw error;
    }

    try {
      // Validate and refresh token only on first attempt or when forced
      if (retryCount === 0 || forceTokenRefresh) {
        await tokenManager.validateAndRefreshToken();
        this.accessToken = tokenManager.getAccessToken();
      }
      
      const config = {
        method,
        url: `${this.baseURL}${fullEndpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        timeout: this.requestTimeout
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      
      // Record success in circuit breaker
      this.circuitBreaker.recordSuccess();
      
      if (retryCount > 0) {
        logger.info(`Request succeeded after ${retryCount} retries: ${method} ${fullEndpoint}`);
      }
      
      return response.data;
    } catch (error) {
      // Handle 401 with token refresh
      if (error.response?.status === 401 && !forceTokenRefresh && retryCount === 0) {
        logger.warn('Got 401 Unauthorized, forcing token refresh and retrying once...');
        try {
          await tokenManager.validateAndRefreshToken();
          this.accessToken = tokenManager.getAccessToken();
          return this.makeRequest(endpoint, method, data, { apiType, retryCount: 0, forceTokenRefresh: true });
        } catch (refreshError) {
          console.error('❌ Token refresh failed after 401:', refreshError.message);
        }
      }

      const isRetryable = this.isRetryableError(error);
      const isLastAttempt = retryCount >= this.maxRetries - 1;
      
      const errorInfo = {
        endpoint: fullEndpoint,
        method,
        attempt: retryCount + 1,
        maxRetries: this.maxRetries,
        status: error.response?.status,
        message: error.message,
        isRetryable,
        isLastAttempt
      };

      if (isLastAttempt) {
        console.error(`⚠️  API error [${method} ${fullEndpoint}]:`, JSON.stringify({
          status: error.response?.status,
          message: error.message,
          attempt: retryCount + 1
        }));
      }

      logger.error(`API error for ${fullEndpoint}`, errorInfo);

      if (isRetryable) {
        this.circuitBreaker.recordFailure();
      }

      if (isRetryable && !isLastAttempt) {
        const delay = calculateRetryDelay(retryCount);
        logger.info(`Retrying in ${Math.round(delay)}ms... (attempt ${retryCount + 2}/${this.maxRetries})`);
        await this.sleep(delay);
        return this.makeRequest(endpoint, method, data, { apiType, retryCount: retryCount + 1, forceTokenRefresh: false });
      }

      const enhancedError = new Error(
        `API request failed after ${retryCount + 1} attempts: ${error.message}`
      );
      enhancedError.originalError = error;
      enhancedError.endpoint = fullEndpoint;
      enhancedError.method = method;
      enhancedError.status = error.response?.status;
      enhancedError.attempts = retryCount + 1;
      enhancedError.isRetryable = isRetryable;
      
      throw enhancedError;
    }
  }

  /**
   * Make HTTP request to Agile API (for Sprint operations)
   * Shorthand for makeRequest with apiType: 'agile'
   */
  async makeAgileRequest(endpoint, method = 'GET', data = null) {
    return this.makeRequest(endpoint, method, data, { apiType: 'agile' });
  }

  // ==================== REST API v3 Methods ====================

  async getCurrentUser() {
    return await this.makeRequest('/myself');
  }

  async searchIssues(jql, fields = null, maxResults = 100) {
    const requestBody = {
      jql,
      maxResults,
      fields: fields ? fields.split(',') : ['summary', 'status', 'assignee', 'priority', 'duedate', 'created', 'updated', 'issuetype', 'project']
    };
    return await this.makeRequest('/search/jql', 'POST', requestBody);
  }

  async getIssue(issueKey, fields = null) {
    const params = fields ? `?fields=${fields}` : '';
    return await this.makeRequest(`/issue/${issueKey}${params}`);
  }

  async updateIssue(issueKey, updateData) {
    return await this.makeRequest(`/issue/${issueKey}`, 'PUT', updateData);
  }

  async createIssue(issueData) {
    return await this.makeRequest('/issue', 'POST', issueData);
  }

  async getProjects() {
    return await this.makeRequest('/project');
  }

  /**
   * Get all sprints for a board
   * @param {number} boardId - Board ID
   * @param {string} state - Sprint state: 'active', 'future', 'closed', or comma-separated
   */
  async getBoardSprints(boardId, state = 'active,future') {
    return await this.makeAgileRequest(`/board/${boardId}/sprint?state=${state}`);
  }

  /**
   * Get active sprint for a board
   * @param {number} boardId - Board ID
   * @returns {object|null} Active sprint or null if none
   */
  async getActiveSprint(boardId) {
    try {
      const result = await this.makeAgileRequest(`/board/${boardId}/sprint?state=active`);
      if (result.values && result.values.length > 0) {
        return result.values[0];
      }
      return null;
    } catch (error) {
      logger.error(`Failed to get active sprint for board ${boardId}`, error);
      return null;
    }
  }

  /**
   * Move issues to a sprint
   * @param {number} sprintId - Sprint ID
   * @param {string[]} issueKeys - Array of issue keys to move
   */
  async moveIssuesToSprint(sprintId, issueKeys) {
    const data = {
      issues: Array.isArray(issueKeys) ? issueKeys : [issueKeys]
    };
    return await this.makeAgileRequest(`/sprint/${sprintId}/issue`, 'POST', data);
  }

  /**
   * Get sprint details
   * @param {number} sprintId - Sprint ID
   */
  async getSprint(sprintId) {
    return await this.makeAgileRequest(`/sprint/${sprintId}`);
  }

  buildJQL(filters) {
    const conditions = [];

    if (filters.assignee) {
      conditions.push(`assignee = "${filters.assignee}"`);
    }

    if (filters.status) {
      if (Array.isArray(filters.status)) {
        conditions.push(`status IN (${filters.status.map(s => `"${s}"`).join(',')})`);
      } else {
        conditions.push(`status = "${filters.status}"`);
      }
    }

    if (filters.project) {
      conditions.push(`project = "${filters.project}"`);
    }

    if (filters.issueType) {
      conditions.push(`issuetype = "${filters.issueType}"`);
    }

    if (filters.priority) {
      conditions.push(`priority = "${filters.priority}"`);
    }

    if (filters.dateRange) {
      if (filters.dateRange.start) {
        conditions.push(`created >= "${filters.dateRange.start}"`);
      }
      if (filters.dateRange.end) {
        conditions.push(`created <= "${filters.dateRange.end}"`);
      }
    }

    if (filters.text) {
      conditions.push(`text ~ "${filters.text}"`);
    }

    return conditions.join(' AND ');
  }
}

export default new JiraService();
