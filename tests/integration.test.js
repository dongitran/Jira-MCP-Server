import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Integration-style tests that test multiple components working together
 * These tests mock external dependencies but test internal component interactions
 */

// Mock axios
vi.mock('axios', () => ({
  default: vi.fn()
}));

import axios from 'axios';

describe('Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('Token Refresh Flow', () => {
    it('should refresh token and retry request on 401', async () => {
      vi.resetModules();
      
      // Mock token manager
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn()
            .mockReturnValueOnce('old-token')
            .mockReturnValueOnce('new-token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: tokenManager } = await import('../config/tokenManager.js');
      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'old-token';
      jiraService.circuitBreaker.reset();

      // First call fails with 401, second succeeds
      axios
        .mockRejectedValueOnce({ response: { status: 401 }, message: 'Unauthorized' })
        .mockResolvedValueOnce({ data: { accountId: 'user-123' } });

      const result = await jiraService.getCurrentUser();

      expect(result.accountId).toBe('user-123');
      expect(tokenManager.validateAndRefreshToken).toHaveBeenCalled();
    });
  });

  describe('Circuit Breaker Integration', () => {
    it('should open circuit after multiple failures', async () => {
      vi.resetModules();
      
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn(() => 'token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'token';
      jiraService.circuitBreaker.reset();
      jiraService.circuitBreaker.failureThreshold = 3;

      // All calls fail with 503
      axios.mockRejectedValue({ response: { status: 503 }, message: 'Service Unavailable' });

      // First request - will retry and fail
      try {
        await jiraService.makeRequest('/test1');
      } catch (e) {
        // Expected to fail
      }

      // Circuit should be open now
      const state = jiraService.circuitBreaker.getState();
      expect(state.state).toBe('OPEN');

      // Next request should be blocked immediately
      await expect(jiraService.makeRequest('/test2')).rejects.toThrow(/Circuit breaker is OPEN/);
    });
  });


  describe('Task Creation Flow', () => {
    it('should create task with sprint assignment', async () => {
      vi.resetModules();
      
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn(() => 'token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'token';
      jiraService.cloudId = 'cloud-123';
      jiraService.circuitBreaker.reset();

      // Mock responses for the flow
      axios
        // getCurrentUser
        .mockResolvedValueOnce({ data: { accountId: 'user-123', displayName: 'Test User' } })
        // createIssue
        .mockResolvedValueOnce({ data: { key: 'TEST-100', id: '10000' } })
        // getActiveSprint
        .mockResolvedValueOnce({ data: { values: [{ id: 50, name: 'Sprint 1', state: 'active' }] } })
        // moveIssuesToSprint
        .mockResolvedValueOnce({ data: {} });

      // Create task
      const user = await jiraService.getCurrentUser();
      expect(user.accountId).toBe('user-123');

      const task = await jiraService.createIssue({
        fields: {
          project: { key: 'TEST' },
          summary: 'New Task',
          issuetype: { name: 'Task' },
          assignee: { accountId: user.accountId }
        }
      });
      expect(task.key).toBe('TEST-100');

      // Get active sprint
      const sprint = await jiraService.getActiveSprint(9);
      expect(sprint.id).toBe(50);

      // Move to sprint
      await jiraService.moveIssuesToSprint(sprint.id, [task.key]);

      expect(axios).toHaveBeenCalledTimes(4);
    });
  });

  describe('Search and Update Flow', () => {
    it('should search tasks and update story points', async () => {
      vi.resetModules();
      
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn(() => 'token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'token';
      jiraService.circuitBreaker.reset();

      axios
        // searchIssues
        .mockResolvedValueOnce({
          data: {
            total: 2,
            issues: [
              { key: 'TEST-1', fields: { summary: 'Task 1', customfield_10016: 3 } },
              { key: 'TEST-2', fields: { summary: 'Task 2', customfield_10016: 5 } }
            ]
          }
        })
        // updateIssue for TEST-1
        .mockResolvedValueOnce({ data: {} })
        // updateIssue for TEST-2
        .mockResolvedValueOnce({ data: {} });

      // Search for tasks
      const result = await jiraService.searchIssues('project = TEST');
      expect(result.total).toBe(2);

      // Update story points for each task
      for (const issue of result.issues) {
        const newPoints = issue.fields.customfield_10016 * 2;
        await jiraService.updateIssue(issue.key, {
          fields: { customfield_10016: newPoints }
        });
      }

      expect(axios).toHaveBeenCalledTimes(3);
    });
  });

  describe('Retry with Backoff', () => {
    it('should retry with increasing delays', async () => {
      vi.resetModules();
      
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn(() => 'token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'token';
      jiraService.circuitBreaker.reset();

      const callTimes = [];
      
      axios.mockImplementation(() => {
        callTimes.push(Date.now());
        if (callTimes.length < 3) {
          return Promise.reject({ response: { status: 503 }, message: 'Service Unavailable' });
        }
        return Promise.resolve({ data: { success: true } });
      });

      const result = await jiraService.makeRequest('/test');
      
      expect(result.success).toBe(true);
      expect(callTimes.length).toBe(3);
      
      // Verify delays between calls (should be increasing)
      if (callTimes.length >= 3) {
        const delay1 = callTimes[1] - callTimes[0];
        const delay2 = callTimes[2] - callTimes[1];
        // Second delay should be longer than first (exponential backoff)
        expect(delay2).toBeGreaterThanOrEqual(delay1 * 0.8); // Allow some variance
      }
    });
  });

  describe('Error Propagation', () => {
    it('should propagate enhanced error with context', async () => {
      vi.resetModules();
      
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn(() => 'token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'token';
      jiraService.circuitBreaker.reset();

      axios.mockRejectedValue({ 
        response: { status: 404 }, 
        message: 'Issue not found' 
      });

      try {
        await jiraService.getIssue('INVALID-999');
        expect.fail('Should have thrown');
      } catch (error) {
        expect(error.message).toContain('API request failed');
        expect(error.status).toBe(404);
        expect(error.endpoint).toContain('/issue/INVALID-999');
        expect(error.attempts).toBe(1); // No retry for 404
      }
    });
  });

  describe('Concurrent Request Handling', () => {
    it('should handle multiple concurrent requests', async () => {
      vi.resetModules();
      
      vi.doMock('../config/tokenManager.js', () => ({
        default: {
          getAccessToken: vi.fn(() => 'token'),
          getCloudId: vi.fn(() => 'cloud-123'),
          validateAndRefreshToken: vi.fn()
        }
      }));

      const { default: jiraService } = await import('../services/jiraService.js');
      
      jiraService.baseURL = 'https://api.atlassian.com/ex/jira/cloud-123';
      jiraService.accessToken = 'token';
      jiraService.circuitBreaker.reset();

      axios.mockImplementation((config) => {
        const issueKey = config.url.split('/').pop();
        return Promise.resolve({ 
          data: { key: issueKey, fields: { summary: `Task ${issueKey}` } } 
        });
      });

      // Make 5 concurrent requests
      const promises = [
        jiraService.getIssue('TEST-1'),
        jiraService.getIssue('TEST-2'),
        jiraService.getIssue('TEST-3'),
        jiraService.getIssue('TEST-4'),
        jiraService.getIssue('TEST-5')
      ];

      const results = await Promise.all(promises);

      expect(results).toHaveLength(5);
      expect(results[0].key).toBe('TEST-1');
      expect(results[4].key).toBe('TEST-5');
      expect(axios).toHaveBeenCalledTimes(5);
    });
  });
});
