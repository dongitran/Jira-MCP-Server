import { z } from 'zod';
import moment from 'moment';

export function registerJiraTools(mcpServer, jiraService) {
  
  // Tool 1: Get My Tasks
  mcpServer.registerTool(
    'get_my_tasks',
    {
      title: 'Get My Tasks',
      description: 'Get tasks assigned to current user with various filters',
      inputSchema: z.object({
        filter: z.enum(['todo', 'today', 'in-progress', 'high-priority', 'overdue', 'completed', 'all'])
          .default('all')
          .describe('Filter type for tasks'),
        period: z.enum(['today', 'week', 'month']).optional()
          .describe('Period for completed tasks filter')
      }),
      outputSchema: z.object({
        total: z.number(),
        tasks: z.array(z.object({
          key: z.string(),
          summary: z.string(),
          status: z.string(),
          priority: z.string(),
          dueDate: z.string().nullable()
        }))
      })
    },
    async ({ filter, period }) => {
      const user = await jiraService.getCurrentUser();
      let jql = '';

      switch (filter) {
      case 'todo':
        jql = `assignee = "${user.accountId}" AND status IN ("To Do", "Open", "New", "Backlog")`;
        break;
      case 'today': {
        const today = moment().format('YYYY-MM-DD');
        jql = `assignee = "${user.accountId}" AND status IN ("In Progress", "In Review") AND (duedate = "${today}" OR updated >= "${today}")`;
        break;
      }
      case 'in-progress':
        jql = `assignee = "${user.accountId}" AND status IN ("In Progress", "In Development", "In Review")`;
        break;
      case 'high-priority':
        jql = `assignee = "${user.accountId}" AND priority IN ("Highest", "High") AND status NOT IN ("Done", "Closed", "Resolved")`;
        break;
      case 'overdue': {
        const now = moment().format('YYYY-MM-DD');
        jql = `assignee = "${user.accountId}" AND duedate < "${now}" AND status NOT IN ("Done", "Closed", "Resolved")`;
        break;
      }
      case 'completed': {
        let startDate;
        if (period === 'today') {
          startDate = moment().format('YYYY-MM-DD');
        } else if (period === 'week') {
          startDate = moment().startOf('week').format('YYYY-MM-DD');
        } else if (period === 'month') {
          startDate = moment().startOf('month').format('YYYY-MM-DD');
        } else {
          startDate = moment().subtract(7, 'days').format('YYYY-MM-DD');
        }
        jql = `assignee = "${user.accountId}" AND status IN ("Done", "Closed", "Resolved") AND resolved >= "${startDate}"`;
        break;
      }
      default:
        jql = `assignee = "${user.accountId}"`;
      }

      const result = await jiraService.searchIssues(jql);
      
      const tasks = result.issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        priority: issue.fields.priority ? issue.fields.priority.name : 'None',
        dueDate: issue.fields.duedate || null,
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
      }));

      const output = {
        total: result.total,
        filter: filter,
        tasks: tasks
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 2: Get Tasks by Date
  mcpServer.registerTool(
    'get_tasks_by_date',
    {
      title: 'Get Tasks by Date',
      description: 'Get tasks active on a specific date (between start date and due date)',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
          .describe('Date in YYYY-MM-DD format')
      }),
      outputSchema: z.object({
        date: z.string(),
        total: z.number(),
        totalDailyHours: z.number(),
        tasks: z.array(z.object({
          key: z.string(),
          summary: z.string(),
          status: z.string(),
          storyPoints: z.number(),
          dailyHours: z.number()
        }))
      })
    },
    async ({ date }) => {
      const user = await jiraService.getCurrentUser();
      const targetDate = moment(date).format('YYYY-MM-DD');
      
      const jql = `assignee = "${user.accountId}" AND duedate >= "${targetDate}" AND duedate IS NOT EMPTY`;
      const result = await jiraService.searchIssues(
        jql, 
        'summary,key,status,priority,assignee,duedate,created,customfield_10015,customfield_10016,issuetype,subtasks'
      );

      // Vietnamese holidays
      const vietnameseHolidays = [
        '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03',
        '2025-04-18', '2025-04-30', '2025-05-01', '2025-09-01', '2025-09-02'
      ];

      const isVietnameseHoliday = (date) => vietnameseHolidays.includes(moment(date).format('YYYY-MM-DD'));

      const calculateWorkingDays = (start, end) => {
        if (!start || !end) return 1;
        let workingDays = 0;
        let current = moment(start);
        const endMoment = moment(end);
        
        while (current.isSameOrBefore(endMoment)) {
          if (current.day() >= 1 && current.day() <= 5 && !isVietnameseHoliday(current)) {
            workingDays++;
          }
          current.add(1, 'day');
        }
        return workingDays > 0 ? workingDays : 1;
      };

      const tasksOnDate = result.issues
        .filter(issue => {
          const hasSubtasks = issue.fields.subtasks && issue.fields.subtasks.length > 0;
          const isSubtask = issue.fields.issuetype.subtask;
          
          if (hasSubtasks && !isSubtask) return false;
          
          const createdDate = issue.fields.created;
          const startDate = issue.fields.customfield_10015;
          const dueDate = issue.fields.duedate;
          
          if (!dueDate) return false;
          
          const due = moment(dueDate).format('YYYY-MM-DD');
          const effectiveStartDate = startDate || createdDate;
          
          if (effectiveStartDate) {
            const start = moment(effectiveStartDate).format('YYYY-MM-DD');
            return moment(targetDate).isSameOrAfter(start) && moment(targetDate).isSameOrBefore(due);
          }
          
          return moment(targetDate).isSameOrBefore(due);
        })
        .map(issue => {
          const createdDate = issue.fields.created;
          const startDate = issue.fields.customfield_10015;
          const dueDate = issue.fields.duedate;
          const storyPoints = issue.fields.customfield_10016 || 0;
          
          const effectiveStartDate = startDate || createdDate;
          const totalTaskHours = storyPoints * 2;
          const workingDays = calculateWorkingDays(effectiveStartDate, dueDate);
          const dailyHours = workingDays > 0 ? totalTaskHours / workingDays : totalTaskHours;
          
          return {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority ? issue.fields.priority.name : 'None',
            storyPoints: storyPoints,
            dailyHours: Math.round(dailyHours * 100) / 100,
            startDate: effectiveStartDate ? moment(effectiveStartDate).format('YYYY-MM-DD') : null,
            dueDate: moment(dueDate).format('YYYY-MM-DD'),
            url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
          };
        });

      const totalDailyHours = tasksOnDate.reduce((sum, task) => sum + task.dailyHours, 0);

      const output = {
        date: targetDate,
        total: tasksOnDate.length,
        totalDailyHours: Math.round(totalDailyHours * 100) / 100,
        totalDailyWorkingHours: Math.round((totalDailyHours / 8) * 100) / 100,
        tasks: tasksOnDate
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 3: Search Tasks
  mcpServer.registerTool(
    'search_tasks',
    {
      title: 'Search Tasks',
      description: 'Search tasks using JQL query or keyword',
      inputSchema: z.object({
        query: z.string().describe('JQL query or keyword to search'),
        maxResults: z.number().default(50).describe('Maximum number of results')
      }),
      outputSchema: z.object({
        total: z.number(),
        tasks: z.array(z.object({
          key: z.string(),
          summary: z.string(),
          status: z.string()
        }))
      })
    },
    async ({ query, maxResults }) => {
      const user = await jiraService.getCurrentUser();
      
      // Check if it's a JQL query or simple keyword
      let jql;
      if (query.toLowerCase().includes('assignee') || query.toLowerCase().includes('status') || query.toLowerCase().includes('project')) {
        jql = query;
      } else {
        jql = `assignee = "${user.accountId}" AND text ~ "${query}"`;
      }

      const result = await jiraService.searchIssues(jql, null, maxResults);
      
      const tasks = result.issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        priority: issue.fields.priority ? issue.fields.priority.name : 'None',
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
      }));

      const output = {
        query: query,
        total: result.total,
        returned: tasks.length,
        tasks: tasks
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 4: Create Task
  mcpServer.registerTool(
    'create_task',
    {
      title: 'Create Task',
      description: 'Create a new Jira task with optional subtasks',
      inputSchema: z.object({
        project: z.string().describe('Project key (e.g., "URC", "PROJ")'),
        summary: z.string().describe('Task title/summary'),
        description: z.string().optional().describe('Task description'),
        issueType: z.string().default('Task').describe('Issue type'),
        priority: z.string().default('Medium').describe('Priority level'),
        storyPoints: z.number().optional().describe('Story points'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
        subtasks: z.array(z.object({
          summary: z.string(),
          description: z.string().optional(),
          storyPoints: z.number().optional()
        })).optional().describe('Array of subtasks')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        task: z.object({
          key: z.string(),
          summary: z.string(),
          url: z.string()
        })
      })
    },
    async ({ project, summary, description, issueType, priority, storyPoints, startDate, dueDate, subtasks }) => {
      const user = await jiraService.getCurrentUser();
      
      const parentFields = {
        project: { key: project },
        summary: summary,
        issuetype: { name: issueType },
        priority: { name: priority },
        assignee: { accountId: user.accountId }
      };

      if (description) {
        parentFields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: description }]
          }]
        };
      }

      if (storyPoints) parentFields.customfield_10016 = storyPoints;
      if (startDate) parentFields.customfield_10015 = startDate;
      if (dueDate) parentFields.duedate = dueDate;

      const parentTask = await jiraService.createIssue({ fields: parentFields });
      
      const createdSubtasks = [];
      if (subtasks && subtasks.length > 0) {
        for (const subtask of subtasks) {
          const subtaskFields = {
            project: { key: project },
            summary: subtask.summary,
            issuetype: { name: 'Subtask' },
            parent: { key: parentTask.key },
            assignee: { accountId: user.accountId }
          };
          
          if (subtask.description) {
            subtaskFields.description = {
              type: 'doc',
              version: 1,
              content: [{
                type: 'paragraph',
                content: [{ type: 'text', text: subtask.description }]
              }]
            };
          }
          
          if (subtask.storyPoints) subtaskFields.customfield_10016 = subtask.storyPoints;
          
          try {
            const createdSubtask = await jiraService.createIssue({ fields: subtaskFields });
            createdSubtasks.push({
              key: createdSubtask.key,
              summary: subtask.summary
            });
          } catch (error) {
            console.error('Failed to create subtask:', error.message);
          }
        }
      }

      const output = {
        success: true,
        task: {
          key: parentTask.key,
          summary: summary,
          url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${parentTask.key}`,
          subtasks: createdSubtasks
        }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 5: Update Task Dates
  mcpServer.registerTool(
    'update_task_dates',
    {
      title: 'Update Task Dates',
      description: 'Update start date and/or due date of a task',
      inputSchema: z.object({
        taskKey: z.string().describe('Task key (e.g., "URC-123")'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        taskKey: z.string(),
        updatedFields: z.array(z.string())
      })
    },
    async ({ taskKey, startDate, dueDate }) => {
      const updateFields = {};
      const updatedFieldsList = [];
      
      if (dueDate) {
        updateFields.duedate = dueDate;
        updatedFieldsList.push('dueDate');
      }
      
      if (startDate) {
        updateFields.customfield_10015 = startDate;
        updatedFieldsList.push('startDate');
      }

      await jiraService.updateIssue(taskKey, { fields: updateFields });

      const output = {
        success: true,
        taskKey: taskKey,
        updatedFields: updatedFieldsList,
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${taskKey}`
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 6: Update Story Points
  mcpServer.registerTool(
    'update_story_points',
    {
      title: 'Update Story Points',
      description: 'Update story points of a task',
      inputSchema: z.object({
        taskKey: z.string().describe('Task key (e.g., "URC-123")'),
        storyPoints: z.number().describe('Story points value')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        taskKey: z.string(),
        storyPoints: z.number()
      })
    },
    async ({ taskKey, storyPoints }) => {
      await jiraService.updateIssue(taskKey, {
        fields: { customfield_10016: storyPoints }
      });

      const output = {
        success: true,
        taskKey: taskKey,
        storyPoints: storyPoints,
        estimatedHours: storyPoints * 2,
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${taskKey}`
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 7: Get Task Details
  mcpServer.registerTool(
    'get_task_details',
    {
      title: 'Get Task Details',
      description: 'Get detailed information about a specific task',
      inputSchema: z.object({
        taskKey: z.string().describe('Task key (e.g., "URC-123")')
      }),
      outputSchema: z.object({
        key: z.string(),
        summary: z.string(),
        description: z.string().nullable(),
        status: z.string(),
        priority: z.string(),
        assignee: z.string(),
        storyPoints: z.number().nullable()
      })
    },
    async ({ taskKey }) => {
      const issue = await jiraService.getIssue(
        taskKey,
        'summary,description,status,priority,assignee,customfield_10016,duedate,customfield_10015,created,issuetype,subtasks'
      );

      const output = {
        key: issue.key,
        summary: issue.fields.summary,
        description: issue.fields.description?.content?.[0]?.content?.[0]?.text || null,
        status: issue.fields.status.name,
        priority: issue.fields.priority ? issue.fields.priority.name : 'None',
        assignee: issue.fields.assignee ? issue.fields.assignee.displayName : 'Unassigned',
        issueType: issue.fields.issuetype.name,
        storyPoints: issue.fields.customfield_10016 || 0,
        startDate: issue.fields.customfield_10015 || null,
        dueDate: issue.fields.duedate || null,
        created: issue.fields.created,
        hasSubtasks: issue.fields.subtasks && issue.fields.subtasks.length > 0,
        subtasksCount: issue.fields.subtasks ? issue.fields.subtasks.length : 0,
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}
