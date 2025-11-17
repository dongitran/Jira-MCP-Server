import axios from 'axios';
import tokenManager from '../config/tokenManager.js';

class JiraService {
  constructor() {
    this.baseURL = null;
    this.accessToken = null;
    this.cloudId = null;
  }

  async initialize() {
    this.accessToken = tokenManager.getAccessToken();
    this.cloudId = tokenManager.getCloudId();
    this.baseURL = `https://api.atlassian.com/ex/jira/${this.cloudId}`;
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    try {
      // Validate and refresh token if needed
      await tokenManager.validateAndRefreshToken();
      
      // Get fresh token (might have been refreshed)
      this.accessToken = tokenManager.getAccessToken();
      
      const config = {
        method,
        url: `${this.baseURL}/rest/api/3${endpoint}`,
        headers: {
          'Authorization': `Bearer ${this.accessToken}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        }
      };

      if (data) {
        config.data = data;
      }

      const response = await axios(config);
      return response.data;
    } catch (error) {
      console.error(`Jira API error for ${endpoint}:`, error.response?.data || error.message);
      throw error;
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

    try {
      return await this.makeRequest('/search/jql', 'POST', requestBody);
    } catch {
      console.log('Trying fallback /search endpoint');
      return await this.makeRequest('/search', 'POST', requestBody);
    }
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
