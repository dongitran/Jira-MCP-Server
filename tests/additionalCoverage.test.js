import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Additional tests to improve coverage for uncovered lines
 */

// Mock jiraService
const mockJiraService = {
  cloudId: 'mock-cloud-id',
  siteUrl: 'https://test.atlassian.net',
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
  getSprint: vi.fn(),
  getTransitions: vi.fn(),
  doTransition: vi.fn(),
  addComment: vi.fn(),
  getComments: vi.fn(),
  searchUsers: vi.fn(),
  getBrowseUrl: vi.fn((issueKey) => `https://test.atlassian.net/browse/${issueKey}`)
};

// Mock MCP server
const mockMcpServer = {
  registeredTools: {},
  registerTool: vi.fn((name, schema, handler) => {
    mockMcpServer.registeredTools[name] = { schema, handler };
  })
};

describe('Additional Coverage Tests', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMcpServer.registeredTools = {};
    mockJiraService.defaultBoardId = 9;
  });

  describe('get_sprint_daily_tasks edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should handle getSprint failure gracefully', async () => {
      mockJiraService.getSprint.mockRejectedValue(new Error('Sprint not found'));
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      const result = await handler({ sprintId: 999 });

      expect(result.structuredContent.sprint.id).toBe(999);
      expect(result.structuredContent.sprint.name).toBe('Unknown');
    });

    it('should throw error when no active sprint found', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue(null);

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      
      await expect(handler({ boardId: 9 })).rejects.toThrow('No active sprint found');
    });

    it('should handle unassigned tasks', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      
      mockJiraService.searchIssues.mockResolvedValue({
        total: 1,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Unassigned Task',
              status: { name: 'In Progress' },
              priority: { name: 'High' },
              assignee: null, // Unassigned
              issuetype: { name: 'Task', subtask: false },
              customfield_10016: 5,
              subtasks: [],
              parent: null
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      const result = await handler({ boardId: 9 });

      expect(result.structuredContent.tasks[0].assignee).toBe('Unassigned');
    });
  });

  describe('get_sprint_tasks edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should filter todo tasks', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      await handler({ boardId: 9, status: 'todo' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status IN ("To Do", "Open", "New", "Backlog")'),
        expect.any(String)
      );
    });

    it('should filter done tasks', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      await handler({ boardId: 9, status: 'done' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status IN ("Done", "Closed", "Resolved")'),
        expect.any(String)
      );
    });

    it('should handle getSprint failure gracefully', async () => {
      mockJiraService.getSprint.mockRejectedValue(new Error('Sprint not found'));
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      const result = await handler({ sprintId: 999, status: 'all' });

      expect(result.structuredContent.sprint.id).toBe(999);
      expect(result.structuredContent.sprint.name).toBe('Unknown');
    });
  });

  describe('get_my_tasks edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should filter overdue tasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      await handler({ filter: 'overdue' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('duedate <')
      );
    });

    it('should filter completed tasks with period', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      await handler({ filter: 'completed', period: 'month' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status IN ("Done", "Closed", "Resolved")')
      );
    });

    it('should handle tasks without priority', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 1,
        issues: [{
          key: 'TEST-1',
          fields: {
            summary: 'Task without priority',
            status: { name: 'Open' },
            priority: null,
            duedate: null
          }
        }]
      });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      const result = await handler({ filter: 'all' });

      expect(result.structuredContent.tasks[0].priority).toBe('None');
    });
  });

  describe('create_task edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should handle getActiveSprint failure gracefully', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-100' });
      mockJiraService.getActiveSprint.mockRejectedValue(new Error('Board not found'));

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'Task with failed sprint',
        boardId: 999
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.task.sprint).toBeNull();
    });

    it('should handle subtask creation failure gracefully', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue
        .mockResolvedValueOnce({ key: 'TEST-100' }) // Parent
        .mockRejectedValueOnce(new Error('Subtask creation failed')); // Subtask fails

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'Parent task',
        subtasks: [{ summary: 'Failed subtask' }]
      });

      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.task.subtasks).toHaveLength(0);
    });

    it('should handle direct sprintId assignment', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-100' });
      mockJiraService.moveIssuesToSprint.mockResolvedValue({});
      mockJiraService.getSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'Task with direct sprint',
        sprintId: 50
      });

      expect(mockJiraService.moveIssuesToSprint).toHaveBeenCalledWith(50, ['TEST-100']);
      expect(result.structuredContent.task.sprint.id).toBe(50);
    });

    it('should handle getSprint failure for direct sprintId', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-100' });
      mockJiraService.moveIssuesToSprint.mockResolvedValue({});
      mockJiraService.getSprint.mockRejectedValue(new Error('Sprint not found'));

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'Task with unknown sprint',
        sprintId: 999
      });

      expect(result.structuredContent.task.sprint.id).toBe(999);
      expect(result.structuredContent.task.sprint.name).toBe('Unknown');
    });
  });

  describe('get_task_details edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should handle subtask fetch failure gracefully', async () => {
      // Parent task
      mockJiraService.getIssue.mockResolvedValue({
        key: 'TEST-1',
        fields: {
          summary: 'Parent Task',
          description: null,
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          assignee: { displayName: 'John' },
          issuetype: { name: 'Task', subtask: false },
          customfield_10016: 10,
          customfield_10015: null,
          duedate: null,
          created: '2025-01-01T10:00:00.000Z',
          subtasks: [{ key: 'TEST-2' }]
        }
      });
      
      // Batch subtask fetch fails
      mockJiraService.searchIssues.mockRejectedValue(new Error('Subtask not found'));

      const handler = mockMcpServer.registeredTools['get_task_details'].handler;
      const result = await handler({ taskKey: 'TEST-1' });

      expect(result.structuredContent.hasSubtasks).toBe(true);
      expect(result.structuredContent.subtasksCount).toBe(0); // Failed to fetch
    });
  });

  describe('create_subtask edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should create subtask with description', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ 
        accountId: 'user-123',
        displayName: 'John Doe'
      });
      mockJiraService.getIssue.mockResolvedValue({
        fields: { project: { key: 'TEST' } }
      });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-50' });

      const handler = mockMcpServer.registeredTools['create_subtask'].handler;
      const result = await handler({
        parentTaskKey: 'TEST-1',
        summary: 'Subtask with description',
        description: 'This is a detailed description',
        storyPoints: 3,
        startDate: '2025-01-15',
        dueDate: '2025-01-20'
      });

      expect(mockJiraService.createIssue).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          summary: 'Subtask with description',
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'This is a detailed description' }]
            }]
          },
          customfield_10016: 3,
          customfield_10015: '2025-01-15',
          duedate: '2025-01-20'
        })
      });
      expect(result.structuredContent.success).toBe(true);
    });
  });

  describe('get_sprint_tasks without boardId', () => {
    beforeEach(async () => {
      mockJiraService.defaultBoardId = null;
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      mockMcpServer.registeredTools = {};
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should throw error when no boardId or sprintId provided', async () => {
      const handler = mockMcpServer.registeredTools['get_sprint_tasks'].handler;
      
      await expect(handler({ status: 'all' })).rejects.toThrow('Either boardId or sprintId is required');
    });
  });

  describe('get_sprint_daily_tasks without boardId', () => {
    beforeEach(async () => {
      mockJiraService.defaultBoardId = null;
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      mockMcpServer.registeredTools = {};
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should throw error when no boardId or sprintId provided', async () => {
      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      
      await expect(handler({})).rejects.toThrow('Either boardId or sprintId is required');
    });
  });

  describe('get_comments extractText edge cases', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should handle plain string body', async () => {
      mockJiraService.getComments.mockResolvedValue({
        total: 1,
        comments: [{
          id: 'comment-1',
          body: 'Plain text comment', // String instead of ADF
          author: { displayName: 'John', accountId: 'user-123' },
          created: '2025-11-29T10:00:00.000Z',
          updated: '2025-11-29T10:00:00.000Z'
        }]
      });

      const handler = mockMcpServer.registeredTools['get_comments'].handler;
      const result = await handler({ taskKey: 'TEST-1', maxResults: 20 });

      expect(result.structuredContent.comments[0].body).toBe('Plain text comment');
    });

    it('should handle text node type in ADF', async () => {
      mockJiraService.getComments.mockResolvedValue({
        total: 1,
        comments: [{
          id: 'comment-1',
          body: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'text', text: 'Direct text node' }
            ]
          },
          author: { displayName: 'John', accountId: 'user-123' },
          created: '2025-11-29T10:00:00.000Z',
          updated: '2025-11-29T10:00:00.000Z'
        }]
      });

      const handler = mockMcpServer.registeredTools['get_comments'].handler;
      const result = await handler({ taskKey: 'TEST-1', maxResults: 20 });

      expect(result.structuredContent.comments[0].body).toBe('Direct text node');
    });

    it('should handle unknown node types in ADF', async () => {
      mockJiraService.getComments.mockResolvedValue({
        total: 1,
        comments: [{
          id: 'comment-1',
          body: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'unknownType', data: 'some data' }
            ]
          },
          author: { displayName: 'John', accountId: 'user-123' },
          created: '2025-11-29T10:00:00.000Z',
          updated: '2025-11-29T10:00:00.000Z'
        }]
      });

      const handler = mockMcpServer.registeredTools['get_comments'].handler;
      const result = await handler({ taskKey: 'TEST-1', maxResults: 20 });

      expect(result.structuredContent.comments[0].body).toBe('');
    });

    it('should handle null body', async () => {
      mockJiraService.getComments.mockResolvedValue({
        total: 1,
        comments: [{
          id: 'comment-1',
          body: null,
          author: { displayName: 'John', accountId: 'user-123' },
          created: '2025-11-29T10:00:00.000Z',
          updated: '2025-11-29T10:00:00.000Z'
        }]
      });

      const handler = mockMcpServer.registeredTools['get_comments'].handler;
      const result = await handler({ taskKey: 'TEST-1', maxResults: 20 });

      expect(result.structuredContent.comments[0].body).toBe('');
    });

    it('should handle paragraph without content', async () => {
      mockJiraService.getComments.mockResolvedValue({
        total: 1,
        comments: [{
          id: 'comment-1',
          body: {
            type: 'doc',
            version: 1,
            content: [
              { type: 'paragraph' } // No content array
            ]
          },
          author: { displayName: 'John', accountId: 'user-123' },
          created: '2025-11-29T10:00:00.000Z',
          updated: '2025-11-29T10:00:00.000Z'
        }]
      });

      const handler = mockMcpServer.registeredTools['get_comments'].handler;
      const result = await handler({ taskKey: 'TEST-1', maxResults: 20 });

      expect(result.structuredContent.comments[0].body).toBe('');
    });
  });

  describe('get_sprint_daily_tasks with active sprint from board', () => {
    beforeEach(async () => {
      mockJiraService.defaultBoardId = 9;
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      mockMcpServer.registeredTools = {};
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get active sprint info with dates', async () => {
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active',
        startDate: '2025-11-25T00:00:00.000Z',
        endDate: '2025-12-08T00:00:00.000Z'
      });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_sprint_daily_tasks'].handler;
      const result = await handler({ boardId: 9 });

      expect(result.structuredContent.sprint.startDate).toBe('2025-11-25');
      expect(result.structuredContent.sprint.endDate).toBe('2025-12-08');
    });
  });
});
