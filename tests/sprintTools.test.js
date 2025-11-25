import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Tests for sprint-related tools
 */

// Mock jiraService
const mockJiraService = {
  cloudId: 'mock-cloud-id',
  defaultProject: null,
  defaultBoardId: 9,
  getCurrentUser: vi.fn(),
  searchIssues: vi.fn(),
  getIssue: vi.fn(),
  updateIssue: vi.fn(),
  createIssue: vi.fn(),
  getBoardSprints: vi.fn(),
  getActiveSprint: vi.fn(),
  moveIssuesToSprint: vi.fn(),
  getSprint: vi.fn()
};

// Mock MCP server
const mockMcpServer = {
  registeredTools: {},
  registerTool: vi.fn((name, schema, handler) => {
    mockMcpServer.registeredTools[name] = { schema, handler };
  })
};

describe('Sprint Tools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMcpServer.registeredTools = {};
    mockJiraService.defaultBoardId = 9;
  });

  describe('get_sprint_tasks', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get all tasks in active sprint', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active',
        startDate: '2025-01-06',
        endDate: '2025-01-17'
      });
      
      mockJiraService.searchIssues.mockResolvedValue({
        total: 3,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'To Do' },
              priority: { name: 'High' },
              assignee: { displayName: 'John', accountId: 'john-123' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              customfield_10015: '2025-01-06',
              duedate: '2025-01-10',
              subtasks: []
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Task 2',
              status: { name: 'In Progress' },
              priority: { name: 'Medium' },
              assignee: { displayName: 'Jane', accountId: 'jane-456' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 3,
              customfield_10015: null,
              duedate: null,
              subtasks: []
            }
          },
          {
            key: 'TEST-3',
            fields: {
              summary: 'Task 3',
              status: { name: 'Done' },
              priority: { name: 'Low' },
              assignee: { displayName: 'John', accountId: 'john-123' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 2,
              customfield_10015: null,
              duedate: null,
              subtasks: []
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      const result = await handler({ boardId: 9, status: 'all' });

      expect(result.structuredContent.sprint.id).toBe(50);
      expect(result.structuredContent.sprint.name).toBe('Sprint 10');
      expect(result.structuredContent.total).toBe(3);
      expect(result.structuredContent.totalStoryPoints).toBe(10);
      expect(result.structuredContent.teamSummary).toHaveLength(2);
      
      // John has 2 tasks (7 SP), Jane has 1 task (3 SP)
      const johnSummary = result.structuredContent.teamSummary.find(t => t.name === 'John');
      expect(johnSummary.taskCount).toBe(2);
      expect(johnSummary.totalStoryPoints).toBe(7);
    });

    it('should filter by status', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      await handler({ boardId: 9, status: 'in-progress' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status IN ("In Progress", "In Development", "In Review")'),
        expect.any(String)
      );
    });

    it('should use default boardId when not provided', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      await handler({ status: 'all' });

      expect(mockJiraService.getActiveSprint).toHaveBeenCalledWith(9);
    });

    it('should throw error when no boardId and no default', async () => {
      mockJiraService.defaultBoardId = null;
      
      // Re-register tools with null defaultBoardId
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      mockMcpServer.registeredTools = {};
      registerJiraTools(mockMcpServer, mockJiraService);

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      
      await expect(handler({ status: 'all' })).rejects.toThrow('Either boardId or sprintId is required');
    });

    it('should use sprintId directly when provided', async () => {
      mockJiraService.getSprint.mockResolvedValue({
        id: 100,
        name: 'Sprint 20',
        state: 'closed'
      });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      const result = await handler({ sprintId: 100, status: 'all' });

      expect(mockJiraService.getActiveSprint).not.toHaveBeenCalled();
      expect(mockJiraService.getSprint).toHaveBeenCalledWith(100);
      expect(result.structuredContent.sprint.id).toBe(100);
    });
  });


  describe('get_sprint_daily_tasks', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get in-progress tasks for daily standup', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'In Progress Task',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: { displayName: 'John', accountId: 'john-123' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              customfield_10015: null,
              duedate: null,
              subtasks: [],
              parent: null
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Another In Progress',
              status: { name: 'In Review' },
              priority: { name: 'Medium' },
              assignee: { displayName: 'Jane', accountId: 'jane-456' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 3,
              customfield_10015: null,
              duedate: null,
              subtasks: [],
              parent: null
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      const result = await handler({ boardId: 9 });

      expect(result.structuredContent.sprint.id).toBe(50);
      expect(result.structuredContent.total).toBe(2);
      expect(result.structuredContent.teamWorkload).toHaveLength(2);
      expect(result.structuredContent.tasks).toHaveLength(2);
    });

    it('should handle parent tasks with in-progress subtasks', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Parent Task',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: { displayName: 'John', accountId: 'john-123' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              customfield_10015: null,
              duedate: null,
              subtasks: [{ key: 'TEST-2' }],
              parent: null
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Subtask In Progress',
              status: { name: 'In Progress' },
              priority: { name: 'Medium' },
              assignee: { displayName: 'Jane', accountId: 'jane-456' },
              issuetype: { name: 'Subtask', subtask: true },
              customfield_10016: 2,
              customfield_10015: null,
              duedate: null,
              subtasks: [],
              parent: { key: 'TEST-1' }
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      const result = await handler({ boardId: 9 });

      // Parent task should have nested subtask
      const parentTask = result.structuredContent.tasks.find(t => t.key === 'TEST-1');
      expect(parentTask).toBeDefined();
      expect(parentTask.inProgressSubtasks).toHaveLength(1);
      expect(parentTask.inProgressSubtasks[0].key).toBe('TEST-2');
    });

    it('should calculate team workload correctly', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      
      mockJiraService.searchIssues.mockResolvedValue({
        total: 3,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: { displayName: 'John', accountId: 'john-123' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              subtasks: [],
              parent: null
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Task 2',
              status: { name: 'In Progress' },
              priority: { name: 'Medium' },
              assignee: { displayName: 'John', accountId: 'john-123' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 3,
              subtasks: [],
              parent: null
            }
          },
          {
            key: 'TEST-3',
            fields: {
              summary: 'Task 3',
              status: { name: 'In Progress' },
              priority: { name: 'Low' },
              assignee: { displayName: 'Jane', accountId: 'jane-456' },
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 2,
              subtasks: [],
              parent: null
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      const result = await handler({ boardId: 9 });

      // John has 2 tasks, Jane has 1
      const johnWorkload = result.structuredContent.teamWorkload.find(w => w.assignee === 'John');
      const janeWorkload = result.structuredContent.teamWorkload.find(w => w.assignee === 'Jane');
      
      expect(johnWorkload.taskCount).toBe(2);
      expect(janeWorkload.taskCount).toBe(1);
    });
  });

  describe('get_board_sprints', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get all sprints for a board', async () => {
      mockJiraService.getBoardSprints.mockResolvedValue({
        values: [
          { id: 48, name: 'Sprint 8', state: 'closed', startDate: '2024-12-01', endDate: '2024-12-14' },
          { id: 49, name: 'Sprint 9', state: 'closed', startDate: '2024-12-15', endDate: '2024-12-28' },
          { id: 50, name: 'Sprint 10', state: 'active', startDate: '2025-01-06', endDate: '2025-01-17' },
          { id: 51, name: 'Sprint 11', state: 'future', startDate: '2025-01-20', endDate: '2025-01-31' }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_board_sprints'].handler;
      const result = await handler({ boardId: 9, state: 'all' });

      expect(result.structuredContent.boardId).toBe(9);
      expect(result.structuredContent.total).toBe(4);
      expect(result.structuredContent.activeSprint.id).toBe(50);
      expect(result.structuredContent.sprints).toHaveLength(4);
    });

    it('should filter by state', async () => {
      mockJiraService.getBoardSprints.mockResolvedValue({
        values: [
          { id: 50, name: 'Sprint 10', state: 'active', startDate: '2025-01-06', endDate: '2025-01-17' }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_board_sprints'].handler;
      await handler({ boardId: 9, state: 'active' });

      expect(mockJiraService.getBoardSprints).toHaveBeenCalledWith(9, 'active');
    });

    it('should handle no active sprint', async () => {
      mockJiraService.getBoardSprints.mockResolvedValue({
        values: [
          { id: 51, name: 'Sprint 11', state: 'future', startDate: '2025-01-20', endDate: '2025-01-31' }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_board_sprints'].handler;
      const result = await handler({ boardId: 9, state: 'future' });

      expect(result.structuredContent.activeSprint).toBeNull();
    });
  });

  describe('move_to_sprint', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should move multiple tasks to sprint', async () => {
      mockJiraService.moveIssuesToSprint.mockResolvedValue({});
      mockJiraService.getSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });

      const handler = mockMcpServer.registeredTools['move_to_sprint'].handler;
      const result = await handler({
        sprintId: 50,
        taskKeys: ['TEST-1', 'TEST-2', 'TEST-3']
      });

      expect(mockJiraService.moveIssuesToSprint).toHaveBeenCalledWith(50, ['TEST-1', 'TEST-2', 'TEST-3']);
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.movedTasks).toEqual(['TEST-1', 'TEST-2', 'TEST-3']);
      expect(result.structuredContent.sprint.name).toBe('Sprint 10');
    });

    it('should handle sprint info fetch failure gracefully', async () => {
      mockJiraService.moveIssuesToSprint.mockResolvedValue({});
      mockJiraService.getSprint.mockRejectedValue(new Error('Sprint not found'));

      const handler = mockMcpServer.registeredTools['move_to_sprint'].handler;
      const result = await handler({
        sprintId: 999,
        taskKeys: ['TEST-1']
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.sprint.id).toBe(999);
      expect(result.structuredContent.sprint.name).toBe('Unknown');
    });
  });
});
