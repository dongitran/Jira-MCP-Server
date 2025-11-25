import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock dependencies before importing
vi.mock('axios', () => ({
  default: vi.fn()
}));

vi.mock('../config/tokenManager.js', () => ({
  default: {
    getAccessToken: vi.fn(() => 'mock-access-token'),
    getCloudId: vi.fn(() => 'mock-cloud-id'),
    validateAndRefreshToken: vi.fn()
  }
}));

vi.mock('../utils/logger.js', () => ({
  default: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn()
  }
}));

import axios from 'axios';
import tokenManager from '../config/tokenManager.js';

describe('JiraService', () => {
  let jiraService;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    
    // Reset module cache and reimport
    vi.resetModules();
    const module = await import('../services/jiraService.js');
    jiraService = module.default;
    
    // Set up service
    jiraService.baseURL = 'https://api.atlassian.com/ex/jira/mock-cloud-id';
    jiraService.accessToken = 'mock-access-token';
    jiraService.cloudId = 'mock-cloud-id';
    
    // Reset circuit breaker
    jiraService.circuitBreaker.reset();
  });

  describe('isRetryableError', () => {
    it('should return true for network errors (no response)', () => {
      const error = new Error('Network error');
      expect(jiraService.isRetryableError(error)).toBe(true);
    });

    it('should return true for retryable status codes', () => {
      const retryableCodes = [408, 429, 500, 502, 503, 504];
      
      for (const status of retryableCodes) {
        const error = { response: { status } };
        expect(jiraService.isRetryableError(error)).toBe(true);
      }
    });

    it('should return false for non-retryable status codes', () => {
      const nonRetryableCodes = [400, 401, 403, 404, 422];
      
      for (const status of nonRetryableCodes) {
        const error = { response: { status } };
        expect(jiraService.isRetryableError(error)).toBe(false);
      }
    });
  });

  describe('sleep', () => {
    it('should delay for specified milliseconds', async () => {
      const start = Date.now();
      await jiraService.sleep(50);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(45);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('makeRequest', () => {
    it('should make successful GET request', async () => {
      axios.mockResolvedValueOnce({
        data: { id: '123', name: 'Test User' }
      });

      const result = await jiraService.makeRequest('/myself');

      expect(result).toEqual({ id: '123', name: 'Test User' });
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'GET',
        url: 'https://api.atlassian.com/ex/jira/mock-cloud-id/rest/api/3/myself',
        headers: expect.objectContaining({
          'Authorization': 'Bearer mock-access-token'
        })
      }));
    });

    it('should make successful POST request with data', async () => {
      axios.mockResolvedValueOnce({
        data: { key: 'TEST-123' }
      });

      const result = await jiraService.makeRequest('/issue', 'POST', { fields: { summary: 'Test' } });

      expect(result).toEqual({ key: 'TEST-123' });
      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        method: 'POST',
        data: { fields: { summary: 'Test' } }
      }));
    });

    it('should use agile API path when apiType is agile', async () => {
      axios.mockResolvedValueOnce({
        data: { values: [] }
      });

      await jiraService.makeRequest('/board/1/sprint', 'GET', null, { apiType: 'agile' });

      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        url: 'https://api.atlassian.com/ex/jira/mock-cloud-id/rest/agile/1.0/board/1/sprint'
      }));
    });

    it('should validate and refresh token before request', async () => {
      axios.mockResolvedValueOnce({ data: {} });

      await jiraService.makeRequest('/myself');

      expect(tokenManager.validateAndRefreshToken).toHaveBeenCalled();
    });

    it('should retry on retryable errors', async () => {
      axios
        .mockRejectedValueOnce({ response: { status: 503 }, message: 'Service Unavailable' })
        .mockResolvedValueOnce({ data: { success: true } });

      const result = await jiraService.makeRequest('/myself');

      expect(result).toEqual({ success: true });
      expect(axios).toHaveBeenCalledTimes(2);
    });

    it('should not retry on non-retryable errors', async () => {
      axios.mockRejectedValueOnce({ response: { status: 404 }, message: 'Not Found' });

      await expect(jiraService.makeRequest('/myself')).rejects.toThrow();
      expect(axios).toHaveBeenCalledTimes(1);
    });

    it('should throw after max retries', async () => {
      axios.mockRejectedValue({ response: { status: 503 }, message: 'Service Unavailable' });

      await expect(jiraService.makeRequest('/myself')).rejects.toThrow(/API request failed after/);
      expect(axios).toHaveBeenCalledTimes(3); // maxRetries = 3
    });

    it('should handle 401 with token refresh', async () => {
      axios
        .mockRejectedValueOnce({ response: { status: 401 }, message: 'Unauthorized' })
        .mockResolvedValueOnce({ data: { success: true } });

      tokenManager.getAccessToken.mockReturnValue('new-access-token');

      const result = await jiraService.makeRequest('/myself');

      expect(result).toEqual({ success: true });
      // validateAndRefreshToken is called: 1) initial request, 2) after 401 refresh, 3) retry request
      expect(tokenManager.validateAndRefreshToken).toHaveBeenCalled();
      expect(axios).toHaveBeenCalledTimes(2);
    });

    it('should record success in circuit breaker', async () => {
      axios.mockResolvedValueOnce({ data: {} });
      const recordSuccessSpy = vi.spyOn(jiraService.circuitBreaker, 'recordSuccess');

      await jiraService.makeRequest('/myself');

      expect(recordSuccessSpy).toHaveBeenCalled();
    });

    it('should record failure in circuit breaker for retryable errors', async () => {
      axios.mockRejectedValue({ response: { status: 503 }, message: 'Service Unavailable' });
      const recordFailureSpy = vi.spyOn(jiraService.circuitBreaker, 'recordFailure');

      await expect(jiraService.makeRequest('/myself')).rejects.toThrow();

      expect(recordFailureSpy).toHaveBeenCalled();
    });

    it('should block requests when circuit breaker is open', async () => {
      // Force circuit breaker to open
      jiraService.circuitBreaker.state = 'OPEN';
      jiraService.circuitBreaker.nextAttempt = Date.now() + 60000;

      await expect(jiraService.makeRequest('/myself')).rejects.toThrow(/Circuit breaker is OPEN/);
      expect(axios).not.toHaveBeenCalled();
    });
  });

  describe('makeAgileRequest', () => {
    it('should call makeRequest with agile apiType', async () => {
      axios.mockResolvedValueOnce({ data: { values: [] } });

      await jiraService.makeAgileRequest('/board/1/sprint');

      expect(axios).toHaveBeenCalledWith(expect.objectContaining({
        url: expect.stringContaining('/rest/agile/1.0/')
      }));
    });
  });

  describe('API methods', () => {
    beforeEach(() => {
      axios.mockResolvedValue({ data: {} });
    });

    describe('getCurrentUser', () => {
      it('should call /myself endpoint', async () => {
        await jiraService.getCurrentUser();

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          url: expect.stringContaining('/myself')
        }));
      });
    });

    describe('searchIssues', () => {
      it('should call /search/jql with POST', async () => {
        await jiraService.searchIssues('project = TEST');

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/search/jql'),
          data: expect.objectContaining({
            jql: 'project = TEST'
          })
        }));
      });

      it('should use custom fields when provided', async () => {
        await jiraService.searchIssues('project = TEST', 'summary,status', 25);

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({
            fields: ['summary', 'status'],
            maxResults: 25
          })
        }));
      });
    });

    describe('getIssue', () => {
      it('should call /issue/{key} endpoint', async () => {
        await jiraService.getIssue('TEST-123');

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          url: expect.stringContaining('/issue/TEST-123')
        }));
      });

      it('should include fields parameter when provided', async () => {
        await jiraService.getIssue('TEST-123', 'summary,status');

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          url: expect.stringContaining('/issue/TEST-123?fields=summary,status')
        }));
      });
    });

    describe('updateIssue', () => {
      it('should call PUT /issue/{key}', async () => {
        await jiraService.updateIssue('TEST-123', { fields: { summary: 'Updated' } });

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          method: 'PUT',
          url: expect.stringContaining('/issue/TEST-123'),
          data: { fields: { summary: 'Updated' } }
        }));
      });
    });

    describe('createIssue', () => {
      it('should call POST /issue', async () => {
        await jiraService.createIssue({ fields: { summary: 'New Issue' } });

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/issue'),
          data: { fields: { summary: 'New Issue' } }
        }));
      });
    });

    describe('getProjects', () => {
      it('should call /project endpoint', async () => {
        await jiraService.getProjects();

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          url: expect.stringContaining('/project')
        }));
      });
    });

    describe('getBoardSprints', () => {
      it('should call agile API for board sprints', async () => {
        await jiraService.getBoardSprints(9, 'active');

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          url: expect.stringContaining('/rest/agile/1.0/board/9/sprint?state=active')
        }));
      });
    });

    describe('getActiveSprint', () => {
      it('should return active sprint', async () => {
        axios.mockResolvedValueOnce({
          data: { values: [{ id: 1, name: 'Sprint 1', state: 'active' }] }
        });

        const result = await jiraService.getActiveSprint(9);

        expect(result).toEqual({ id: 1, name: 'Sprint 1', state: 'active' });
      });

      it('should return null if no active sprint', async () => {
        axios.mockResolvedValueOnce({ data: { values: [] } });

        const result = await jiraService.getActiveSprint(9);

        expect(result).toBeNull();
      });

      it('should return null on error', async () => {
        axios.mockRejectedValueOnce(new Error('API Error'));

        const result = await jiraService.getActiveSprint(9);

        expect(result).toBeNull();
      });
    });

    describe('moveIssuesToSprint', () => {
      it('should call agile API to move issues', async () => {
        await jiraService.moveIssuesToSprint(123, ['TEST-1', 'TEST-2']);

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          method: 'POST',
          url: expect.stringContaining('/rest/agile/1.0/sprint/123/issue'),
          data: { issues: ['TEST-1', 'TEST-2'] }
        }));
      });

      it('should handle single issue key', async () => {
        await jiraService.moveIssuesToSprint(123, 'TEST-1');

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          data: { issues: ['TEST-1'] }
        }));
      });
    });

    describe('getSprint', () => {
      it('should call agile API for sprint details', async () => {
        await jiraService.getSprint(123);

        expect(axios).toHaveBeenCalledWith(expect.objectContaining({
          url: expect.stringContaining('/rest/agile/1.0/sprint/123')
        }));
      });
    });
  });

  describe('buildJQL', () => {
    it('should build JQL with assignee filter', () => {
      const jql = jiraService.buildJQL({ assignee: 'john.doe' });
      expect(jql).toBe('assignee = "john.doe"');
    });

    it('should build JQL with status filter (single)', () => {
      const jql = jiraService.buildJQL({ status: 'In Progress' });
      expect(jql).toBe('status = "In Progress"');
    });

    it('should build JQL with status filter (array)', () => {
      const jql = jiraService.buildJQL({ status: ['To Do', 'In Progress'] });
      expect(jql).toBe('status IN ("To Do","In Progress")');
    });

    it('should build JQL with project filter', () => {
      const jql = jiraService.buildJQL({ project: 'TEST' });
      expect(jql).toBe('project = "TEST"');
    });

    it('should build JQL with multiple filters', () => {
      const jql = jiraService.buildJQL({
        assignee: 'john.doe',
        project: 'TEST',
        status: 'In Progress'
      });
      expect(jql).toContain('assignee = "john.doe"');
      expect(jql).toContain('project = "TEST"');
      expect(jql).toContain('status = "In Progress"');
      expect(jql).toContain(' AND ');
    });

    it('should build JQL with date range', () => {
      const jql = jiraService.buildJQL({
        dateRange: {
          start: '2025-01-01',
          end: '2025-01-31'
        }
      });
      expect(jql).toContain('created >= "2025-01-01"');
      expect(jql).toContain('created <= "2025-01-31"');
    });

    it('should build JQL with text search', () => {
      const jql = jiraService.buildJQL({ text: 'bug fix' });
      expect(jql).toBe('text ~ "bug fix"');
    });

    it('should return empty string for empty filters', () => {
      const jql = jiraService.buildJQL({});
      expect(jql).toBe('');
    });
  });
});
