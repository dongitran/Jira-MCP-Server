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
   * Make HTTP request with retry logic
   */
  async makeRequest(endpoint, method = 'GET', data = null, retryCount = 0, forceTokenRefresh = false) {
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
      // Validate and refresh token only on first attempt or when forced (after 401 error)
      if (retryCount === 0 || forceTokenRefresh) {
        await tokenManager.validateAndRefreshToken();
        this.accessToken = tokenManager.getAccessToken();
      }
      
      const config = {
        method,
        url: `${this.baseURL}/rest/api/3${endpoint}`,
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
      
      // Log success on retry (only to file, not stderr to avoid noise)
      if (retryCount > 0) {
        logger.info(`Request succeeded after ${retryCount} retries: ${method} ${endpoint}`);
      }
      
      return response.data;
    } catch (error) {
      // Special handling for 401 Unauthorized - token might be expired
      // Only try to refresh token once per request to avoid infinite loop
      if (error.response?.status === 401 && !forceTokenRefresh && retryCount === 0) {
        logger.warn('Got 401 Unauthorized, forcing token refresh and retrying once...');
        try {
          await tokenManager.validateAndRefreshToken();
          this.accessToken = tokenManager.getAccessToken();
          // Retry with forceTokenRefresh=true to prevent infinite loop
          return this.makeRequest(endpoint, method, data, 0, true);
        } catch (refreshError) {
          console.error('❌ Token refresh failed after 401:', refreshError.message);
          // Fall through to normal error handling
        }
      }

      const isRetryable = this.isRetryableError(error);
      const isLastAttempt = retryCount >= this.maxRetries - 1;
      
      // Log error details
      const errorInfo = {
        endpoint,
        method,
        attempt: retryCount + 1,
        maxRetries: this.maxRetries,
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
        isRetryable,
        isLastAttempt
      };

      // Log to stderr only on last attempt to reduce noise
      if (isLastAttempt) {
        console.error(`⚠️  Jira API error [${method} ${endpoint}]:`, JSON.stringify({
          status: error.response?.status,
          message: error.message,
          attempt: retryCount + 1
        }));
      }

      // Also log to file
      logger.error(`Jira API error for ${endpoint}`, errorInfo);

      // Record failure in circuit breaker BEFORE retry (for each failed attempt)
      // This ensures circuit breaker opens faster when service is down
      if (isRetryable) {
        this.circuitBreaker.recordFailure();
      }

      // If retryable and not last attempt, retry
      if (isRetryable && !isLastAttempt) {
        const delay = calculateRetryDelay(retryCount);
        // Log to file only to reduce stderr noise
        logger.info(`Retrying in ${Math.round(delay)}ms... (attempt ${retryCount + 2}/${this.maxRetries})`);
        
        await this.sleep(delay);
        return this.makeRequest(endpoint, method, data, retryCount + 1, false);
      }

      // If not retryable or last attempt, throw error with context
      const enhancedError = new Error(
        `Jira API request failed after ${retryCount + 1} attempts: ${error.message}`
      );
      enhancedError.originalError = error;
      enhancedError.endpoint = endpoint;
      enhancedError.method = method;
      enhancedError.status = error.response?.status;
      enhancedError.attempts = retryCount + 1;
      enhancedError.isRetryable = isRetryable;
      
      throw enhancedError;
    }
  }

  async getCurrentUser() {
    return await this.makeRequest('/myself');
  }

  async searchIssues(jql, fields = null, maxResults = 100) {
    const requestBody = {
      jql,
      maxResults,
      fields: fields ? fields.split(',') : ['summary', 'status', 'assignee', 'priority', 'duedate', 'created', 'updated', 'issuetype', 'project']
    };

    // Use only /search/jql (the correct API endpoint)
    // The /search endpoint has been removed by Atlassian
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
