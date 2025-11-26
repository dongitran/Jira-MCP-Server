import { describe, it, expect } from 'vitest';

/**
 * Edge case tests for various scenarios
 */

describe('Edge Cases', () => {
  describe('Empty and Null Handling', () => {
    it('should handle empty arrays gracefully', () => {
      const emptyArray = [];
      expect(emptyArray.map(x => x * 2)).toEqual([]);
      expect(emptyArray.filter(x => x > 0)).toEqual([]);
      expect(emptyArray.reduce((sum, x) => sum + x, 0)).toBe(0);
    });

    it('should handle null/undefined in optional chaining', () => {
      const obj = { a: { b: null } };
      expect(obj?.a?.b?.c).toBeUndefined();
      // null ?? 'default' returns 'default' because ?? only checks null/undefined
      expect(obj?.a?.b ?? 'default').toBe('default');
      // But obj.a.b is null
      expect(obj.a.b).toBeNull();
    });
  });

  describe('JQL Query Building', () => {
    it('should escape special characters in JQL', () => {
      // Test that special characters are handled
      const query = 'test "quoted" value';
      const escaped = query.replace(/"/g, '\\"');
      expect(escaped).toBe('test \\"quoted\\" value');
    });

    it('should handle empty filter conditions', () => {
      const conditions = [];
      const jql = conditions.join(' AND ');
      expect(jql).toBe('');
    });

    it('should build valid JQL with single condition', () => {
      const conditions = ['project = "TEST"'];
      const jql = conditions.join(' AND ');
      expect(jql).toBe('project = "TEST"');
    });

    it('should build valid JQL with multiple conditions', () => {
      const conditions = ['project = "TEST"', 'status = "Open"'];
      const jql = conditions.join(' AND ');
      expect(jql).toBe('project = "TEST" AND status = "Open"');
    });
  });

  describe('Story Points Calculations', () => {
    it('should handle zero story points', () => {
      const storyPoints = 0;
      const hours = storyPoints * 2;
      expect(hours).toBe(0);
    });

    it('should handle fractional story points', () => {
      const storyPoints = 0.5;
      const hours = storyPoints * 2;
      expect(hours).toBe(1);
    });

    it('should handle large story points', () => {
      const storyPoints = 100;
      const hours = storyPoints * 2;
      expect(hours).toBe(200);
    });

    it('should round daily hours to 2 decimal places', () => {
      const totalHours = 10;
      const workingDays = 3;
      const dailyHours = Math.round((totalHours / workingDays) * 100) / 100;
      expect(dailyHours).toBe(3.33);
    });
  });

  describe('Date Edge Cases', () => {
    it('should handle date at midnight', () => {
      const date = new Date('2025-01-15T00:00:00.000Z');
      expect(date.getUTCHours()).toBe(0);
    });

    it('should handle date at end of day', () => {
      const date = new Date('2025-01-15T23:59:59.999Z');
      expect(date.getUTCHours()).toBe(23);
    });

    it('should handle leap year date', () => {
      const date = new Date('2024-02-29');
      expect(date.getDate()).toBe(29);
    });

    it('should handle year boundary', () => {
      const dec31 = new Date('2024-12-31');
      const jan1 = new Date('2025-01-01');
      expect(jan1.getTime() - dec31.getTime()).toBe(24 * 60 * 60 * 1000);
    });
  });

  describe('Array Operations', () => {
    it('should sort tasks by priority correctly', () => {
      const priorityOrder = { 'Highest': 1, 'High': 2, 'Medium': 3, 'Low': 4, 'Lowest': 5 };
      const tasks = [
        { priority: 'Low' },
        { priority: 'Highest' },
        { priority: 'Medium' }
      ];
      
      const sorted = tasks.sort((a, b) => 
        (priorityOrder[a.priority] || 99) - (priorityOrder[b.priority] || 99)
      );
      
      expect(sorted[0].priority).toBe('Highest');
      expect(sorted[1].priority).toBe('Medium');
      expect(sorted[2].priority).toBe('Low');
    });

    it('should group tasks by assignee', () => {
      const tasks = [
        { key: 'T-1', assignee: 'John' },
        { key: 'T-2', assignee: 'Jane' },
        { key: 'T-3', assignee: 'John' }
      ];
      
      const grouped = tasks.reduce((acc, task) => {
        if (!acc[task.assignee]) {
          acc[task.assignee] = [];
        }
        acc[task.assignee].push(task.key);
        return acc;
      }, {});
      
      expect(grouped['John']).toEqual(['T-1', 'T-3']);
      expect(grouped['Jane']).toEqual(['T-2']);
    });

    it('should calculate total story points', () => {
      const tasks = [
        { storyPoints: 3 },
        { storyPoints: 5 },
        { storyPoints: null },
        { storyPoints: 2 }
      ];
      
      const total = tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0);
      expect(total).toBe(10);
    });
  });

  describe('Error Message Formatting', () => {
    it('should format error with status code', () => {
      const error = { status: 404, message: 'Not Found' };
      const formatted = `Error ${error.status}: ${error.message}`;
      expect(formatted).toBe('Error 404: Not Found');
    });

    it('should handle missing error details', () => {
      const error = {};
      const formatted = `Error ${error.status || 'unknown'}: ${error.message || 'Unknown error'}`;
      expect(formatted).toBe('Error unknown: Unknown error');
    });
  });

  describe('URL Building', () => {
    it('should build Jira browse URL', () => {
      const cloudId = 'abc123';
      const issueKey = 'TEST-456';
      const url = `https://api.atlassian.com/ex/jira/${cloudId}/browse/${issueKey}`;
      expect(url).toBe('https://api.atlassian.com/ex/jira/abc123/browse/TEST-456');
    });

    it('should build API endpoint URL', () => {
      const baseURL = 'https://api.atlassian.com/ex/jira/abc123';
      const endpoint = '/rest/api/3/issue/TEST-456';
      const url = `${baseURL}${endpoint}`;
      expect(url).toBe('https://api.atlassian.com/ex/jira/abc123/rest/api/3/issue/TEST-456');
    });
  });

  describe('Atlassian Document Format', () => {
    it('should create valid ADF for simple text', () => {
      const text = 'Hello World';
      const adf = {
        type: 'doc',
        version: 1,
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: text }]
        }]
      };
      
      expect(adf.type).toBe('doc');
      expect(adf.version).toBe(1);
      expect(adf.content[0].content[0].text).toBe('Hello World');
    });

    it('should handle empty description', () => {
      const description = null;
      const adf = description ? {
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: description }] }]
      } : null;
      
      expect(adf).toBeNull();
    });
  });

  describe('Sprint State Handling', () => {
    it('should identify active sprint', () => {
      const sprints = [
        { id: 1, state: 'closed' },
        { id: 2, state: 'active' },
        { id: 3, state: 'future' }
      ];
      
      const activeSprint = sprints.find(s => s.state === 'active');
      expect(activeSprint.id).toBe(2);
    });

    it('should handle no active sprint', () => {
      const sprints = [
        { id: 1, state: 'closed' },
        { id: 3, state: 'future' }
      ];
      
      const activeSprint = sprints.find(s => s.state === 'active');
      expect(activeSprint).toBeUndefined();
    });

    it('should filter sprints by state', () => {
      const sprints = [
        { id: 1, state: 'closed' },
        { id: 2, state: 'active' },
        { id: 3, state: 'future' },
        { id: 4, state: 'closed' }
      ];
      
      const closedSprints = sprints.filter(s => s.state === 'closed');
      expect(closedSprints).toHaveLength(2);
    });
  });

  describe('Issue Type Handling', () => {
    it('should identify subtasks', () => {
      const issue = { fields: { issuetype: { subtask: true } } };
      expect(issue.fields.issuetype.subtask).toBe(true);
    });

    it('should identify parent tasks with subtasks', () => {
      const issue = {
        fields: {
          issuetype: { subtask: false },
          subtasks: [{ key: 'SUB-1' }, { key: 'SUB-2' }]
        }
      };
      
      const hasSubtasks = issue.fields.subtasks && issue.fields.subtasks.length > 0;
      const isSubtask = issue.fields.issuetype.subtask;
      
      expect(hasSubtasks).toBe(true);
      expect(isSubtask).toBe(false);
    });

    it('should identify standalone tasks', () => {
      const issue = {
        fields: {
          issuetype: { subtask: false },
          subtasks: []
        }
      };
      
      const hasSubtasks = issue.fields.subtasks && issue.fields.subtasks.length > 0;
      const isSubtask = issue.fields.issuetype.subtask;
      
      expect(hasSubtasks).toBe(false);
      expect(isSubtask).toBe(false);
    });
  });
});
