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

      // Ensure result has required fields
      const issues = result.issues || [];
      const total = typeof result.total === 'number' ? result.total : issues.length;

      const tasks = issues.map(issue => ({
        key: issue.key,
        summary: issue.fields.summary,
        status: issue.fields.status.name,
        priority: issue.fields.priority ? issue.fields.priority.name : 'None',
        dueDate: issue.fields.duedate || null,
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
      }));

      const output = {
        total: total,
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
          storyPoints: z.number().optional(),
          startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
          dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)')
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
          if (subtask.startDate) subtaskFields.customfield_10015 = subtask.startDate;
          if (subtask.dueDate) subtaskFields.duedate = subtask.dueDate;
          
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

  // Tool 6b: Update Task (Comprehensive)
  mcpServer.registerTool(
    'update_task',
    {
      title: 'Update Task',
      description: 'Update task fields including title, description, dates, and story points. Only provided fields will be updated.',
      inputSchema: z.object({
        taskKey: z.string().describe('Task key (e.g., "URC-123")'),
        title: z.string().optional().describe('Task title/summary'),
        description: z.string().optional().describe('Task description'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)'),
        storyPoints: z.number().optional().describe('Story points value')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        taskKey: z.string(),
        updatedFields: z.array(z.string())
      })
    },
    async ({ taskKey, title, description, startDate, dueDate, storyPoints }) => {
      const updateFields = {};
      const updatedFieldsList = [];

      // Update title (summary)
      if (title) {
        updateFields.summary = title;
        updatedFieldsList.push('title');
      }

      // Update description (Atlassian Document Format)
      if (description) {
        updateFields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: description }]
          }]
        };
        updatedFieldsList.push('description');
      }

      // Update start date
      if (startDate) {
        updateFields.customfield_10015 = startDate;
        updatedFieldsList.push('startDate');
      }

      // Update due date
      if (dueDate) {
        updateFields.duedate = dueDate;
        updatedFieldsList.push('dueDate');
      }

      // Update story points
      if (storyPoints !== undefined) {
        updateFields.customfield_10016 = storyPoints;
        updatedFieldsList.push('storyPoints');
      }

      // Perform the update
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
        storyPoints: z.number().nullable(),
        hasSubtasks: z.boolean(),
        subtasksCount: z.number(),
        subtasks: z.array(z.object({
          key: z.string(),
          summary: z.string(),
          description: z.string().nullable(),
          status: z.string(),
          priority: z.string(),
          assignee: z.string(),
          storyPoints: z.number(),
          startDate: z.string().nullable(),
          dueDate: z.string().nullable(),
          created: z.string(),
          url: z.string()
        }))
      })
    },
    async ({ taskKey }) => {
      const issue = await jiraService.getIssue(
        taskKey,
        'summary,description,status,priority,assignee,customfield_10016,duedate,customfield_10015,created,issuetype,subtasks'
      );

      // Fetch detailed information for each subtask if they exist
      const subtasksDetails = [];
      if (issue.fields.subtasks && issue.fields.subtasks.length > 0) {
        for (const subtask of issue.fields.subtasks) {
          try {
            const subtaskDetail = await jiraService.getIssue(
              subtask.key,
              'summary,description,status,priority,assignee,customfield_10016,duedate,customfield_10015,created,issuetype'
            );
            subtasksDetails.push({
              key: subtaskDetail.key,
              summary: subtaskDetail.fields.summary,
              description: subtaskDetail.fields.description?.content?.[0]?.content?.[0]?.text || null,
              status: subtaskDetail.fields.status.name,
              priority: subtaskDetail.fields.priority ? subtaskDetail.fields.priority.name : 'None',
              assignee: subtaskDetail.fields.assignee ? subtaskDetail.fields.assignee.displayName : 'Unassigned',
              storyPoints: subtaskDetail.fields.customfield_10016 || 0,
              startDate: subtaskDetail.fields.customfield_10015 || null,
              dueDate: subtaskDetail.fields.duedate || null,
              created: subtaskDetail.fields.created,
              url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${subtaskDetail.key}`
            });
          } catch (error) {
            logger.error(`Failed to fetch subtask ${subtask.key}`, error);
          }
        }
      }

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
        subtasksCount: subtasksDetails.length,
        subtasks: subtasksDetails,
        url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 8: Create Subtask
  mcpServer.registerTool(
    'create_subtask',
    {
      title: 'Create Subtask',
      description: 'Create a new subtask for an existing parent task with full field support',
      inputSchema: z.object({
        parentTaskKey: z.string().describe('Parent task key (e.g., "URC-3524")'),
        summary: z.string().describe('Subtask title/summary'),
        description: z.string().optional().describe('Subtask description'),
        storyPoints: z.number().optional().describe('Story points'),
        startDate: z.string().optional().describe('Start date (YYYY-MM-DD)'),
        dueDate: z.string().optional().describe('Due date (YYYY-MM-DD)')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        subtask: z.object({
          key: z.string(),
          summary: z.string(),
          parentKey: z.string(),
          url: z.string()
        })
      })
    },
    async ({ parentTaskKey, summary, description, storyPoints, startDate, dueDate }) => {
      // Get current user to assign subtask
      const user = await jiraService.getCurrentUser();

      // Get parent task to get project information
      const parentTask = await jiraService.getIssue(parentTaskKey, 'project');
      const projectKey = parentTask.fields.project.key;

      // Build subtask fields
      const subtaskFields = {
        project: { key: projectKey },
        summary: summary,
        issuetype: { name: 'Subtask' },
        parent: { key: parentTaskKey },
        assignee: { accountId: user.accountId }
      };

      // Add optional description
      if (description) {
        subtaskFields.description = {
          type: 'doc',
          version: 1,
          content: [{
            type: 'paragraph',
            content: [{ type: 'text', text: description }]
          }]
        };
      }

      // Add optional fields
      if (storyPoints) subtaskFields.customfield_10016 = storyPoints;
      if (startDate) subtaskFields.customfield_10015 = startDate;
      if (dueDate) subtaskFields.duedate = dueDate;

      // Create subtask
      const createdSubtask = await jiraService.createIssue({ fields: subtaskFields });

      const output = {
        success: true,
        subtask: {
          key: createdSubtask.key,
          summary: summary,
          parentKey: parentTaskKey,
          assignedTo: user.displayName,
          storyPoints: storyPoints || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
          url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${createdSubtask.key}`
        }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );

  // Tool 9: Get Monthly Hours
  mcpServer.registerTool(
    'get_monthly_hours',
    {
      title: 'Get Monthly Hours',
      description: 'Calculate total monthly hours based on Story Points and working days for current month',
      inputSchema: z.object({
        includeCompleted: z.boolean().default(true).describe('Include completed tasks (default: true)')
      }),
      outputSchema: z.object({
        period: z.string(),
        totalMonthlyHours: z.number(),
        totalMonthlyDays: z.number(),
        entries: z.number(),
        breakdown: z.array(z.object({
          key: z.string(),
          summary: z.string(),
          monthlyHours: z.number()
        }))
      })
    },
    async ({ includeCompleted }) => {
      const user = await jiraService.getCurrentUser();

      // Vietnamese holidays for 2025
      const vietnameseHolidays = [
        '2025-01-01', '2025-01-28', '2025-01-29', '2025-01-30', '2025-01-31', '2025-02-03',
        '2025-04-18', '2025-04-30', '2025-05-01', '2025-09-01', '2025-09-02'
      ];

      const isVietnameseHoliday = (date) => {
        return vietnameseHolidays.includes(moment(date).format('YYYY-MM-DD'));
      };

      // Calculate working days between two dates
      const getWorkingDaysBetween = (startDate, endDate) => {
        if (!startDate || !endDate) return 0;
        let workingDays = 0;
        let current = moment(startDate);
        const endMoment = moment(endDate);

        while (current.isSameOrBefore(endMoment)) {
          if (current.day() >= 1 && current.day() <= 5 && !isVietnameseHoliday(current)) {
            workingDays++;
          }
          current.add(1, 'day');
        }
        return workingDays;
      };

      // Calculate working days in current month for a task
      const getWorkingDaysInCurrentMonth = (taskStartDate, taskEndDate) => {
        const monthStart = moment().startOf('month');
        const monthEnd = moment().endOf('month');

        const effectiveStart = taskStartDate ? moment.max(moment(taskStartDate), monthStart) : monthStart;
        const effectiveEnd = taskEndDate ? moment.min(moment(taskEndDate), monthEnd) : monthEnd;

        return getWorkingDaysBetween(effectiveStart, effectiveEnd);
      };

      // Calculate monthly hours for a task
      const calculateMonthlyHours = (storyPoints, taskStartDate, taskEndDate) => {
        if (!storyPoints || storyPoints <= 0) {
          return {
            monthlyHours: 0,
            totalHours: 0,
            totalWorkingDays: 0,
            currentMonthWorkingDays: 0,
            calculation: 'No story points assigned'
          };
        }

        const endDate = taskEndDate || moment().format('YYYY-MM-DD');
        const totalHours = storyPoints * 2;
        const totalWorkingDays = getWorkingDaysBetween(taskStartDate, endDate);
        const currentMonthWorkingDays = getWorkingDaysInCurrentMonth(taskStartDate, endDate);
        const monthlyHours = totalWorkingDays > 0
          ? (totalHours / totalWorkingDays) * currentMonthWorkingDays
          : 0;

        return {
          monthlyHours: Math.round(monthlyHours * 100) / 100,
          totalHours,
          totalWorkingDays,
          currentMonthWorkingDays,
          calculation: `(${storyPoints} SP × 2) / ${totalWorkingDays} working days × ${currentMonthWorkingDays} days in current month = ${Math.round(monthlyHours * 100) / 100} hours`
        };
      };

      // Check if task spans multiple months
      const spansMultipleMonths = (startDate, endDate) => {
        if (!endDate) endDate = moment().format('YYYY-MM-DD');
        const start = moment(startDate).startOf('month');
        const end = moment(endDate).startOf('month');
        return !start.isSame(end, 'month');
      };

      // Get current month period
      const currentMonth = {
        startDate: moment().startOf('month').format('YYYY-MM-DD'),
        endDate: moment().endOf('month').format('YYYY-MM-DD'),
        monthName: moment().format('MMMM YYYY')
      };

      // Build JQL query
      let jql = `assignee = "${user.accountId}" AND created <= "${currentMonth.endDate}"`;

      if (!includeCompleted) {
        jql += ` AND status NOT IN ("Done", "Closed", "Resolved")`;
      } else {
        jql += ` AND (status NOT IN ("Done", "Closed", "Resolved") OR resolved >= "${currentMonth.startDate}")`;
      }

      // Search for tasks
      const result = await jiraService.searchIssues(
        jql,
        'summary,key,status,issuetype,subtasks,duedate,created,customfield_10015,customfield_10016,resolved'
      );

      let totalMonthlyHours = 0;
      const breakdown = [];
      const crossMonthTasks = [];

      // Process each task
      result.issues.forEach(issue => {
        const hasSubtasks = issue.fields.subtasks && issue.fields.subtasks.length > 0;
        const isSubtask = issue.fields.issuetype.subtask;

        // Exclude parent tasks with subtasks to avoid double counting
        if (hasSubtasks && !isSubtask) {
          return;
        }

        // Only process tasks with story points
        if (!issue.fields.customfield_10016) {
          return;
        }

        const storyPoints = issue.fields.customfield_10016;
        const startDate = issue.fields.customfield_10015 || issue.fields.created;
        const endDate = issue.fields.duedate || moment().format('YYYY-MM-DD');

        // Calculate monthly hours
        const calculation = calculateMonthlyHours(storyPoints, startDate, endDate);

        // Only include if it contributes hours to current month
        if (calculation.monthlyHours <= 0) {
          return;
        }

        totalMonthlyHours += calculation.monthlyHours;

        const taskData = {
          key: issue.key,
          summary: issue.fields.summary,
          storyPoints: storyPoints,
          status: issue.fields.status.name,
          type: issue.fields.issuetype.name,
          isSubtask: isSubtask,
          hasSubtasks: hasSubtasks,
          startDate: moment(startDate).format('YYYY-MM-DD'),
          endDate: moment(endDate).format('YYYY-MM-DD'),
          dueDate: issue.fields.duedate ? moment(issue.fields.duedate).format('YYYY-MM-DD') : null,
          resolvedDate: issue.fields.resolved ? moment(issue.fields.resolved).format('YYYY-MM-DD') : null,
          monthlyHours: calculation.monthlyHours,
          totalHours: calculation.totalHours,
          totalWorkingDays: calculation.totalWorkingDays,
          currentMonthWorkingDays: calculation.currentMonthWorkingDays,
          calculation: calculation.calculation,
          spansMultipleMonths: spansMultipleMonths(startDate, endDate),
          url: `https://api.atlassian.com/ex/jira/${jiraService.cloudId}/browse/${issue.key}`
        };

        breakdown.push(taskData);

        if (taskData.spansMultipleMonths) {
          crossMonthTasks.push(taskData);
        }
      });

      // Sort by monthly hours descending
      breakdown.sort((a, b) => b.monthlyHours - a.monthlyHours);

      const output = {
        period: currentMonth.monthName,
        type: 'monthly-hours',
        totalMonthlyHours: Math.round(totalMonthlyHours * 100) / 100,
        totalMonthlyDays: Math.round((totalMonthlyHours / 8) * 100) / 100,
        entries: breakdown.length,
        crossMonthTasksCount: crossMonthTasks.length,
        breakdown,
        crossMonthTasks,
        summary: {
          currentMonth: currentMonth.monthName,
          totalTasksAnalyzed: result.total,
          tasksWithStoryPoints: breakdown.length,
          tasksSpanningMultipleMonths: crossMonthTasks.length,
          averageMonthlyHoursPerTask: breakdown.length > 0
            ? Math.round((totalMonthlyHours / breakdown.length) * 100) / 100
            : 0
        }
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output
      };
    }
  );
}
