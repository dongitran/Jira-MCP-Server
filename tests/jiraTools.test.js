import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock jiraService
const mockJiraService = {
  cloudId: 'mock-cloud-id',
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
  getSprint: vi.fn()
};

// Mock MCP server
const mockMcpServer = {
  registeredTools: {},
  registerTool: vi.fn((name, schema, handler) => {
    mockMcpServer.registeredTools[name] = { schema, handler };
  })
};

describe('jiraTools', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockMcpServer.registeredTools = {};
    
    // Reset mock service
    mockJiraService.defaultProject = null;
    mockJiraService.defaultBoardId = null;
  });


  describe('registerJiraTools', () => {
    it('should register all 14 tools', async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);

      const toolNames = Object.keys(mockMcpServer.registeredTools);
      expect(toolNames).toContain('get_my_tasks');
      expect(toolNames).toContain('get_tasks_by_date');
      expect(toolNames).toContain('search_tasks');
      expect(toolNames).toContain('create_task');
      expect(toolNames).toContain('update_task_dates');
      expect(toolNames).toContain('update_story_points');
      expect(toolNames).toContain('update_task');
      expect(toolNames).toContain('get_task_details');
      expect(toolNames).toContain('create_subtask');
      expect(toolNames).toContain('get_monthly_hours');
      expect(toolNames).toContain('get_board_sprints');
      expect(toolNames).toContain('move_to_sprint');
      expect(toolNames).toContain('get_sprint_tasks');
      expect(toolNames).toContain('get_sprint_daily_tasks');
      expect(toolNames.length).toBe(14);
    });
  });

  describe('get_my_tasks', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get all tasks for current user', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 2,
        issues: [
          {
            key: 'TEST-1',
            fields: {
              summary: 'Task 1',
              status: { name: 'To Do' },
              priority: { name: 'High' },
              duedate: '2025-01-20'
            }
          },
          {
            key: 'TEST-2',
            fields: {
              summary: 'Task 2',
              status: { name: 'In Progress' },
              priority: { name: 'Medium' },
              duedate: null
            }
          }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      const result = await handler({ filter: 'all' });

      expect(result.structuredContent.total).toBe(2);
      expect(result.structuredContent.tasks).toHaveLength(2);
      expect(result.structuredContent.tasks[0].key).toBe('TEST-1');
    });

    it('should filter todo tasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      await handler({ filter: 'todo' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status IN ("To Do", "Open", "New", "Backlog")')
      );
    });

    it('should filter in-progress tasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      await handler({ filter: 'in-progress' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('status IN ("In Progress", "In Development", "In Review")')
      );
    });

    it('should filter high-priority tasks', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['get_my_tasks'].handler;
      await handler({ filter: 'high-priority' });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('priority IN ("Highest", "High")')
      );
    });
  });

  describe('search_tasks', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should search with JQL query', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({
        total: 1,
        issues: [{
          key: 'TEST-1',
          fields: {
            summary: 'Found task',
            status: { name: 'Open' },
            priority: { name: 'Medium' },
            assignee: { displayName: 'John Doe' }
          }
        }]
      });

      const handler = mockMcpServer.registeredTools['search_tasks'].handler;
      const result = await handler({ query: 'project = TEST', maxResults: 50 });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith('project = TEST', null, 50);
      expect(result.structuredContent.total).toBe(1);
    });

    it('should convert keyword to text search', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.searchIssues.mockResolvedValue({ total: 0, issues: [] });

      const handler = mockMcpServer.registeredTools['search_tasks'].handler;
      await handler({ query: 'bug fix', maxResults: 50 });

      expect(mockJiraService.searchIssues).toHaveBeenCalledWith(
        expect.stringContaining('text ~ "bug fix"'),
        null,
        50
      );
    });
  });


  describe('create_task', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should create a basic task', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-100' });

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'New Task',
        priority: 'High'
      });

      expect(mockJiraService.createIssue).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          project: { key: 'TEST' },
          summary: 'New Task',
          priority: { name: 'High' },
          assignee: { accountId: 'user-123' }
        })
      });
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.task.key).toBe('TEST-100');
    });

    it('should create task with story points and dates', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-101' });

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      await handler({
        project: 'TEST',
        summary: 'Task with details',
        storyPoints: 5,
        startDate: '2025-01-15',
        dueDate: '2025-01-20'
      });

      expect(mockJiraService.createIssue).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          customfield_10016: 5,
          customfield_10015: '2025-01-15',
          duedate: '2025-01-20'
        })
      });
    });

    it('should auto-assign to active sprint when boardId provided', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'TEST-102' });
      mockJiraService.getActiveSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });
      mockJiraService.moveIssuesToSprint.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'Sprint task',
        boardId: 9
      });

      expect(mockJiraService.getActiveSprint).toHaveBeenCalledWith(9);
      expect(mockJiraService.moveIssuesToSprint).toHaveBeenCalledWith(50, ['TEST-102']);
      expect(result.structuredContent.task.sprint.id).toBe(50);
    });

    it('should create subtasks when provided', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue
        .mockResolvedValueOnce({ key: 'TEST-103' }) // Parent
        .mockResolvedValueOnce({ key: 'TEST-104' }); // Subtask

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      const result = await handler({
        project: 'TEST',
        summary: 'Parent task',
        subtasks: [{ summary: 'Subtask 1', storyPoints: 2 }]
      });

      expect(mockJiraService.createIssue).toHaveBeenCalledTimes(2);
      expect(result.structuredContent.task.subtasks).toHaveLength(1);
      expect(result.structuredContent.task.subtasks[0].key).toBe('TEST-104');
    });

    it('should throw error when project not provided and no default', async () => {
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.defaultProject = null;

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      
      await expect(handler({ summary: 'No project' })).rejects.toThrow('Project is required');
    });

    it('should use default project when not provided', async () => {
      mockJiraService.defaultProject = 'DEFAULT';
      mockJiraService.getCurrentUser.mockResolvedValue({ accountId: 'user-123' });
      mockJiraService.createIssue.mockResolvedValue({ key: 'DEFAULT-1' });

      // Re-register tools with updated defaultProject
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      mockMcpServer.registeredTools = {};
      registerJiraTools(mockMcpServer, mockJiraService);

      const handler = mockMcpServer.registeredTools['create_task'].handler;
      await handler({ summary: 'Task with default project' });

      expect(mockJiraService.createIssue).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          project: { key: 'DEFAULT' }
        })
      });
    });
  });

  describe('update_task_dates', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should update due date', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_task_dates'].handler;
      const result = await handler({
        taskKey: 'TEST-1',
        dueDate: '2025-02-01'
      });

      expect(mockJiraService.updateIssue).toHaveBeenCalledWith('TEST-1', {
        fields: { duedate: '2025-02-01' }
      });
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.updatedFields).toContain('dueDate');
    });

    it('should update start date', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_task_dates'].handler;
      const result = await handler({
        taskKey: 'TEST-1',
        startDate: '2025-01-15'
      });

      expect(mockJiraService.updateIssue).toHaveBeenCalledWith('TEST-1', {
        fields: { customfield_10015: '2025-01-15' }
      });
      expect(result.structuredContent.updatedFields).toContain('startDate');
    });

    it('should update both dates', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_task_dates'].handler;
      const result = await handler({
        taskKey: 'TEST-1',
        startDate: '2025-01-15',
        dueDate: '2025-02-01'
      });

      expect(result.structuredContent.updatedFields).toContain('startDate');
      expect(result.structuredContent.updatedFields).toContain('dueDate');
    });
  });

  describe('update_story_points', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should update story points', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_story_points'].handler;
      const result = await handler({
        taskKey: 'TEST-1',
        storyPoints: 8
      });

      expect(mockJiraService.updateIssue).toHaveBeenCalledWith('TEST-1', {
        fields: { customfield_10016: 8 }
      });
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.storyPoints).toBe(8);
      expect(result.structuredContent.estimatedHours).toBe(16);
    });
  });


  describe('update_task', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should update title', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_task'].handler;
      const result = await handler({
        taskKey: 'TEST-1',
        title: 'Updated Title'
      });

      expect(mockJiraService.updateIssue).toHaveBeenCalledWith('TEST-1', {
        fields: expect.objectContaining({
          summary: 'Updated Title'
        })
      });
      expect(result.structuredContent.updatedFields).toContain('title');
    });

    it('should update description in Atlassian Document Format', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_task'].handler;
      await handler({
        taskKey: 'TEST-1',
        description: 'New description'
      });

      expect(mockJiraService.updateIssue).toHaveBeenCalledWith('TEST-1', {
        fields: expect.objectContaining({
          description: {
            type: 'doc',
            version: 1,
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: 'New description' }]
            }]
          }
        })
      });
    });

    it('should update multiple fields at once', async () => {
      mockJiraService.updateIssue.mockResolvedValue({});

      const handler = mockMcpServer.registeredTools['update_task'].handler;
      const result = await handler({
        taskKey: 'TEST-1',
        title: 'New Title',
        storyPoints: 5,
        dueDate: '2025-02-01'
      });

      expect(result.structuredContent.updatedFields).toContain('title');
      expect(result.structuredContent.updatedFields).toContain('storyPoints');
      expect(result.structuredContent.updatedFields).toContain('dueDate');
    });
  });

  describe('get_task_details', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get task details without subtasks', async () => {
      mockJiraService.getIssue.mockResolvedValue({
        key: 'TEST-1',
        fields: {
          summary: 'Test Task',
          description: null,
          status: { name: 'In Progress' },
          priority: { name: 'High' },
          assignee: { displayName: 'John Doe' },
          issuetype: { name: 'Task', subtask: false },
          customfield_10016: 5,
          customfield_10015: '2025-01-10',
          duedate: '2025-01-20',
          created: '2025-01-01T10:00:00.000Z',
          subtasks: []
        }
      });

      const handler = mockMcpServer.registeredTools['get_task_details'].handler;
      const result = await handler({ taskKey: 'TEST-1' });

      expect(result.structuredContent.key).toBe('TEST-1');
      expect(result.structuredContent.summary).toBe('Test Task');
      expect(result.structuredContent.storyPoints).toBe(5);
      expect(result.structuredContent.hasSubtasks).toBe(false);
      expect(result.structuredContent.subtasks).toHaveLength(0);
    });

    it('should get task details with subtasks', async () => {
      mockJiraService.getIssue
        .mockResolvedValueOnce({
          key: 'TEST-1',
          fields: {
            summary: 'Parent Task',
            description: null,
            status: { name: 'In Progress' },
            priority: { name: 'High' },
            assignee: { displayName: 'John Doe' },
            issuetype: { name: 'Task', subtask: false },
            customfield_10016: 10,
            customfield_10015: null,
            duedate: null,
            created: '2025-01-01T10:00:00.000Z',
            subtasks: [{ key: 'TEST-2' }]
          }
        })
        .mockResolvedValueOnce({
          key: 'TEST-2',
          fields: {
            summary: 'Subtask 1',
            description: null,
            status: { name: 'To Do' },
            priority: { name: 'Medium' },
            assignee: null,
            issuetype: { name: 'Subtask', subtask: true },
            customfield_10016: 3,
            customfield_10015: null,
            duedate: null,
            created: '2025-01-02T10:00:00.000Z'
          }
        });

      const handler = mockMcpServer.registeredTools['get_task_details'].handler;
      const result = await handler({ taskKey: 'TEST-1' });

      expect(result.structuredContent.hasSubtasks).toBe(true);
      expect(result.structuredContent.subtasksCount).toBe(1);
      expect(result.structuredContent.subtasks[0].key).toBe('TEST-2');
    });
  });

  describe('create_subtask', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should create subtask for parent task', async () => {
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
        summary: 'New Subtask',
        storyPoints: 2,
        dueDate: '2025-01-25'
      });

      expect(mockJiraService.createIssue).toHaveBeenCalledWith({
        fields: expect.objectContaining({
          project: { key: 'TEST' },
          summary: 'New Subtask',
          issuetype: { name: 'Subtask' },
          parent: { key: 'TEST-1' },
          customfield_10016: 2,
          duedate: '2025-01-25'
        })
      });
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.subtask.key).toBe('TEST-50');
      expect(result.structuredContent.subtask.parentKey).toBe('TEST-1');
    });
  });

  describe('get_board_sprints', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should get active sprints', async () => {
      mockJiraService.getBoardSprints.mockResolvedValue({
        values: [
          { id: 1, name: 'Sprint 1', state: 'active', startDate: '2025-01-01', endDate: '2025-01-14' },
          { id: 2, name: 'Sprint 2', state: 'future', startDate: '2025-01-15', endDate: '2025-01-28' }
        ]
      });

      const handler = mockMcpServer.registeredTools['get_board_sprints'].handler;
      const result = await handler({ boardId: 9, state: 'all' });

      expect(mockJiraService.getBoardSprints).toHaveBeenCalledWith(9, 'active,future,closed');
      expect(result.structuredContent.total).toBe(2);
      expect(result.structuredContent.activeSprint.id).toBe(1);
    });
  });

  describe('move_to_sprint', () => {
    beforeEach(async () => {
      const { registerJiraTools } = await import('../tools/jiraTools.js');
      registerJiraTools(mockMcpServer, mockJiraService);
    });

    it('should move tasks to sprint', async () => {
      mockJiraService.moveIssuesToSprint.mockResolvedValue({});
      mockJiraService.getSprint.mockResolvedValue({
        id: 50,
        name: 'Sprint 10',
        state: 'active'
      });

      const handler = mockMcpServer.registeredTools['move_to_sprint'].handler;
      const result = await handler({
        sprintId: 50,
        taskKeys: ['TEST-1', 'TEST-2']
      });

      expect(mockJiraService.moveIssuesToSprint).toHaveBeenCalledWith(50, ['TEST-1', 'TEST-2']);
      expect(result.structuredContent.success).toBe(true);
      expect(result.structuredContent.movedTasks).toEqual(['TEST-1', 'TEST-2']);
    });
  });
});
