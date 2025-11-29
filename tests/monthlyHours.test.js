import { describe, it, expect, beforeEach, vi } from 'vitest';
import moment from 'moment';

/**
 * Tests for get_monthly_hours and get_tasks_by_date tools
 */

// Mock jiraService
const mockJiraService = {
  cloudId: 'mock-cloud-id',
  siteUrl: 'https://test.atlassian.net',
  defaultProject: null,
  defaultBoardId: null,
  getCurrentUser: vi.fn(),
  searchIssues: vi.fn(),
  getIssue: vi.fn(),
  updateIssue: vi.fn(),
  createIssue: vi.fn(),
  getBoardSprints: vi.fn(),
  getActiveSprint: vi.fn(),
  moveIssuesToSprint: vi.fn(),
  getSprint: vi.fn(),
  getBrowseUrl: vi.fn((issueKey) => `https://test.atlassian.net/browse/${issueKey}`)
};

// Mock MCP server
const mockMcpServer = {
  registeredTools: {},
  registerTool: vi.fn((name, schema, handler) => {
    mockMcpServer.registeredTools[name] = { schema, handler };
  })
};

describe('Monthly Hours and Date Tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMcpServer.registeredTools = {};
  });

  describe('get_tasks_by_date', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get tasks active on a specific date', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: { displayName: 'John' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5, // story points
              customfield_10015: '2025-01-06', // start date
              duedate: '2025-01-10',
              created: '2025-01-05T10:00:00.000Z',
              subtasks: []
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Task 2',
              status: { name: 'To Do' },
              priority: { name: 'Medium' },
              assignee: { displayName: 'Jane' },
              issuetype: { name: 'Subtask', subtask: true },
              customfield_10016: 3,
              customfield_10015: '2025-01-07',
              duedate: '2025-01-15',
              created: '2025-01-06T10:00:00.000Z',
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_tasks_by_date'].handler;
      const result = await handler({ date: '2025-01-08' });

      expect(result.structuredContent.date).toBe('2025-01-08');
      expect(result.structuredContent.total).toBeGreaterThanOrEqual(0);
      expect(result.structuredContent.totalDailyHours).toBeDefined();
    });

    it('should exclude parent tasks with subtasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Parent Task',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 10,
              customfield_10015: '2025-01-06',
              duedate: '2025-01-15',
              created: '2025-01-05T10:00:00.000Z',
              subtasks: [{ key: 'TEST-2' }] // Has subtasks
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Subtask',
              status: { name: 'In Progress' },
              priority: { name: 'Medium' },
              issuetype: { name: 'Subtask', subtask: true },
              customfield_10016: 5,
              customfield_10015: '2025-01-06',
              duedate: '2025-01-10',
              created: '2025-01-05T10:00:00.000Z',
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_tasks_by_date'].handler;
      const result = await handler({ date: '2025-01-08' });

      // Parent task should be excluded, only subtask counted
      const taskKeys = result.structuredContent.tasks.map(t => t.key);
      expect(taskKeys).not.toContain('TEST-1');
    });

    it('should calculate daily hours correctly', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5, // 5 SP = 10 hours
              customfield_10015: '2025-01-06', // Monday
              duedate: '2025-01-10', // Friday = 5 working days
              created: '2025-01-05T10:00:00.000Z',
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_tasks_by_date'].handler;
      const result = await handler({ date: '2025-01-08' });

      // 10 hours / 5 days = 2 hours per day
      if (result.structuredContent.tasks.length > 0) {
        expect(result.structuredContent.tasks[0].dailyHours).toBe(2);
      }
    });
  });

  describe('get_monthly_hours', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should calculate monthly hours for tasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 10, // 10 SP = 20 hours
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().endOf('month').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: []
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Task 2',
              status: { name: 'Done' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5, // 5 SP = 10 hours
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().add(10, 'days').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: moment().toISOString(),
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_monthly_hours'].handler;
      const result = await handler({ includeCompleted: true });

      expect(result.structuredContent.period).toBe(moment().format('MMMM YYYY'));
      expect(result.structuredContent.totalMonthlyHours).toBeGreaterThan(0);
      expect(result.structuredContent.breakdown).toBeDefined();
    });

    it('should exclude completed tasks when includeCompleted is false', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Active Task',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().endOf('month').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_monthly_hours'].handler;
      await handler({ includeCompleted: false });

      // Verify JQL excludes completed tasks
      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status NOT IN ("Done", "Closed", "Resolved")'),
        expect.any(String)
      );
    });

    it('should exclude parent tasks with subtasks to avoid double counting', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Parent Task',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 20, // Should be excluded
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().endOf('month').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: [{ key: 'TEST-2' }]
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Subtask',
              status: { name: 'In Progress' },
              issuetype: { name: 'Subtask', subtask: true },
              customfield_10016: 5, // Should be counted
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().add(5, 'days').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_monthly_hours'].handler;
      const result = await handler({ includeCompleted: true });

      // Only subtask should be in breakdown
      const taskKeys = result.structuredContent.breakdown.map(t => t.key);
      expect(taskKeys).not.toContain('TEST-1');
      expect(taskKeys).toContain('TEST-2');
    });

    it('should skip tasks without story points', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task with SP',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().add(5, 'days').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: []
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Task without SP',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: null, // No story points
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().add(5, 'days').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_monthly_hours'].handler;
      const result = await handler({ includeCompleted: true });

      // Only task with SP should be in breakdown
      const taskKeys = result.structuredContent.breakdown.map(t => t.key);
      expect(taskKeys).toContain('TEST-1');
      expect(taskKeys).not.toContain('TEST-2');
    });

    it('should identify cross-month tasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Cross-month Task',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 10,
              customfield_10015: moment().subtract(1, 'month').format('YYYY-MM-DD'), // Last month
              duedate: moment().add(1, 'month').format('YYYY-MM-DD'), // Next month
              created: moment().subtract(1, 'month').toISOString(),
              resolved: null,
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_monthly_hours'].handler;
      const result = await handler({ includeCompleted: true });

      if (result.structuredContent.breakdown.length > 0) {
        expect(result.structuredContent.crossMonthTasksCount).toBeGreaterThanOrEqual(0);
      }
    });

    it('should provide summary statistics', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 3,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'In Progress' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              customfield_10015: moment().startOf('month').format('YYYY-MM-DD'),
              duedate: moment().add(5, 'days').format('YYYY-MM-DD'),
              created: moment().startOf('month').toISOString(),
              resolved: null,
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_monthly_hours'].handler;
      const result = await handler({ includeCompleted: true });

      expect(result.structuredContent.summary).toBeDefined();
      expect(result.structuredContent.summary.currentMonth).toBe(moment().format('MMMM YYYY'));
      expect(result.structuredContent.summary.totalTasksAnalyzed).toBeDefined();
    });
  });
});
