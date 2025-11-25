import { z } from 'zod';
import moment from 'moment';
import {
  getWorkingDaysBetween,
  calculateMonthlyHours,
  spansMultipleMonths,
  getCurrentMonthInfo,
  round2
} from '../utils/dateHelpers.js';

// Helper: Build issue URL
const buildIssueUrl = (cloudId, issueKey) => 
  `https://api.atlassian.com/ex/jira/${cloudId}/browse/${issueKey}`;

// Helper: Build Atlassian Document Format for description
const buildADF = (text) => ({
  type: 'doc',
  version: 1,
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
});

// Helper: Extract text from ADF description
const extractADFText = (description) => 
  description?.content?.[0]?.content?.[0]?.text || null;

// Helper: Map issue to basic task object
const mapIssueToTask = (issue, cloudId) => ({
  key: issue.key,
  summary: issue.fields.summary,
  status: issue.fields.status.name,
  priority: issue.fields.priority?.name || 'None',
  dueDate: issue.fields.duedate || null,
  url: buildIssueUrl(cloudId, issue.key)
});

export function registerJiraTools(mcpServer, jiraService) {
  
  // Tool 1: Get My Tasks
  mcpServer.registerTool(
    'get_my_tasks',
    {
      title: 'Get My Tasks',
      description: 'Get tasks assigned to current user with various filters',
      inputSchema: z.object({
        filter: z.enum(['todo', 'today', 'in-progress', 'high-priority', 'overdue', 'completed', 'all'])
          .default('all').describe('Filter type for tasks'),
        period: z.enum(['today', 'week', 'month']).optional().describe('Period for completed filter')
      })
    },
    async ({ filter, period }) => {
      const user = await jiraService.getCurrentUser();
      const today = moment().format('YYYY-MM-DD');
      let jql = '';

      const jqlMap = {
        'todo': `assignee = "${user.accountId}" AND status IN ("To Do", "Open", "New", "Backlog")`,
        'today': `assignee = "${user.accountId}" AND status IN ("In Progress", "In Review") AND (duedate = "${today}" OR updated >= "${today}")`,
        'in-progress': `assignee = "${user.accountId}" AND status IN ("In Progress", "In Development", "In Review")`,
        'high-priority': `assignee = "${user.accountId}" AND priority IN ("Highest", "High") AND status NOT IN ("Done", "Closed", "Resolved")`,
        'overdue': `assignee = "${user.accountId}" AND duedate < "${today}" AND status NOT IN ("Done", "Closed", "Resolved")`,
        'all': `assignee = "${user.accountId}"`
      };

      if (filter === 'completed') {
        const periodMap = {
          'today': moment().format('YYYY-MM-DD'),
          'week': moment().startOf('week').format('YYYY-MM-DD'),
          'month': moment().startOf('month').format('YYYY-MM-DD')
        };
        const startDate = periodMap[period] || moment().subtract(7, 'days').format('YYYY-MM-DD');
        jql = `assignee = "${user.accountId}" AND status IN ("Done", "Closed", "Resolved") AND resolved >= "${startDate}"`;
      } else {
        jql = jqlMap[filter];
      }

      const result = await jiraService.searchIssues(jql);
      const issues = result.issues || [];
      const tasks = issues.map(issue => mapIssueToTask(issue, jiraService.cloudId));

      const output = { total: result.total || issues.length, filter, tasks };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 2: Get Tasks by Date
  mcpServer.registerTool(
    'get_tasks_by_date',
    {
      title: 'Get Tasks by Date',
      description: 'Get tasks active on a specific date with daily hours calculation',
      inputSchema: z.object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('Date in YYYY-MM-DD format')
      })
    },
    async ({ date }) => {
      const user = await jiraService.getCurrentUser();
      const targetDate = moment(date).format('YYYY-MM-DD');
      
      const jql = `assignee = "${user.accountId}" AND duedate >= "${targetDate}" AND duedate IS NOT EMPTY`;
      const result = await jiraService.searchIssues(jql, 
        'summary,key,status,priority,duedate,created,customfield_10015,customfield_10016,issuetype,subtasks');

      const tasksOnDate = result.issues
        .filter(issue => {
          const hasSubtasks = issue.fields.subtasks?.length > 0;
          const isSubtask = issue.fields.issuetype.subtask;
          if (hasSubtasks && !isSubtask) return false;
          
          const dueDate = issue.fields.duedate;
          if (!dueDate) return false;
          
          const effectiveStart = issue.fields.customfield_10015 || issue.fields.created;
          const start = moment(effectiveStart).format('YYYY-MM-DD');
          const due = moment(dueDate).format('YYYY-MM-DD');
          
          return moment(targetDate).isSameOrAfter(start) && moment(targetDate).isSameOrBefore(due);
        })
        .map(issue => {
          const effectiveStart = issue.fields.customfield_10015 || issue.fields.created;
          const dueDate = issue.fields.duedate;
          const storyPoints = issue.fields.customfield_10016 || 0;
          const workingDays = getWorkingDaysBetween(effectiveStart, dueDate) || 1;
          const dailyHours = round2((storyPoints * 2) / workingDays);
          
          return {
            key: issue.key,
            summary: issue.fields.summary,
            status: issue.fields.status.name,
            priority: issue.fields.priority?.name || 'None',
            storyPoints,
            dailyHours,
            startDate: moment(effectiveStart).format('YYYY-MM-DD'),
            dueDate: moment(dueDate).format('YYYY-MM-DD'),
            url: buildIssueUrl(jiraService.cloudId, issue.key)
          };
        });

      const totalDailyHours = round2(tasksOnDate.reduce((sum, t) => sum + t.dailyHours, 0));
      const output = {
        date: targetDate,
        total: tasksOnDate.length,
        totalDailyHours,
        totalDailyWorkingHours: round2(totalDailyHours / 8),
        tasks: tasksOnDate
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
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
        maxResults: z.number().default(50).describe('Maximum results')
      })
    },
    async ({ query, maxResults }) => {
      const user = await jiraService.getCurrentUser();
      const isJQL = /assignee|status|project/i.test(query);
      const jql = isJQL ? query : `assignee = "${user.accountId}" AND text ~ "${query}"`;

      const result = await jiraService.searchIssues(jql, null, maxResults);
      const tasks = result.issues.map(issue => ({
        ...mapIssueToTask(issue, jiraService.cloudId),
        assignee: issue.fields.assignee?.displayName || 'Unassigned'
      }));

      const output = { query, total: result.total, returned: tasks.length, tasks };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 4: Create Task
  mcpServer.registerTool(
    'create_task',
    {
      title: 'Create Task',
      description: `Create a new Jira task with optional subtasks and sprint assignment.${jiraService.defaultProject ? ` Default project: ${jiraService.defaultProject}.` : ''}${jiraService.defaultBoardId ? ` Default board: ${jiraService.defaultBoardId}.` : ''}`,
      inputSchema: z.object({
        project: z.string().optional().describe('Project key'),
        summary: z.string().describe('Task title'),
        description: z.string().optional(),
        issueType: z.string().default('Task'),
        priority: z.string().default('Medium'),
        storyPoints: z.number().optional(),
        startDate: z.string().optional(),
        dueDate: z.string().optional(),
        sprintId: z.number().optional().describe('Sprint ID for direct assignment'),
        boardId: z.number().optional().describe('Board ID for active sprint'),
        subtasks: z.array(z.object({
          summary: z.string(),
          description: z.string().optional(),
          storyPoints: z.number().optional(),
          startDate: z.string().optional(),
          dueDate: z.string().optional()
        })).optional()
      })
    },
    async ({ project, summary, description, issueType, priority, storyPoints, startDate, dueDate, sprintId, boardId, subtasks }) => {
      const user = await jiraService.getCurrentUser();
      const effectiveProject = project || jiraService.defaultProject;
      const effectiveBoardId = boardId || jiraService.defaultBoardId;

      if (!effectiveProject) {
        throw new Error('Project is required. Provide "project" or set --default_project.');
      }

      const parentFields = {
        project: { key: effectiveProject },
        summary,
        issuetype: { name: issueType },
        priority: { name: priority },
        assignee: { accountId: user.accountId }
      };
      if (description) parentFields.description = buildADF(description);
      if (storyPoints) parentFields.customfield_10016 = storyPoints;
      if (startDate) parentFields.customfield_10015 = startDate;
      if (dueDate) parentFields.duedate = dueDate;

      const parentTask = await jiraService.createIssue({ fields: parentFields });
      
      // Sprint assignment
      let sprintInfo = null;
      let targetSprintId = sprintId;

      if (!targetSprintId && effectiveBoardId) {
        const activeSprint = await jiraService.getActiveSprint(effectiveBoardId);
        if (activeSprint) {
          targetSprintId = activeSprint.id;
          sprintInfo = { id: activeSprint.id, name: activeSprint.name, state: activeSprint.state };
        }
      }

      if (targetSprintId) {
        try {
          await jiraService.moveIssuesToSprint(targetSprintId, [parentTask.key]);
          if (!sprintInfo) {
            const sprint = await jiraService.getSprint(targetSprintId).catch(() => null);
            sprintInfo = sprint 
              ? { id: sprint.id, name: sprint.name, state: sprint.state } 
              : { id: targetSprintId, name: 'Unknown', state: 'unknown' };
          }
        } catch (e) { console.error('Sprint assignment failed:', e.message); }
      }

      // Create subtasks
      const createdSubtasks = [];
      if (subtasks?.length) {
        for (const st of subtasks) {
          const stFields = {
            project: { key: effectiveProject },
            summary: st.summary,
            issuetype: { name: 'Subtask' },
            parent: { key: parentTask.key },
            assignee: { accountId: user.accountId }
          };
          if (st.description) stFields.description = buildADF(st.description);
          if (st.storyPoints) stFields.customfield_10016 = st.storyPoints;
          if (st.startDate) stFields.customfield_10015 = st.startDate;
          if (st.dueDate) stFields.duedate = st.dueDate;
          
          try {
            const created = await jiraService.createIssue({ fields: stFields });
            createdSubtasks.push({ key: created.key, summary: st.summary });
          } catch (e) { console.error('Subtask creation failed:', e.message); }
        }
      }

      const output = {
        success: true,
        task: {
          key: parentTask.key,
          summary,
          url: buildIssueUrl(jiraService.cloudId, parentTask.key),
          sprint: sprintInfo,
          subtasks: createdSubtasks
        }
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
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
        startDate: z.string().optional(),
        dueDate: z.string().optional()
      })
    },
    async ({ taskKey, startDate, dueDate }) => {
      const updateFields = {};
      const updatedFieldsList = [];
      
      if (dueDate) { updateFields.duedate = dueDate; updatedFieldsList.push('dueDate'); }
      if (startDate) { updateFields.customfield_10015 = startDate; updatedFieldsList.push('startDate'); }

      await jiraService.updateIssue(taskKey, { fields: updateFields });

      const output = { success: true, taskKey, updatedFields: updatedFieldsList, url: buildIssueUrl(jiraService.cloudId, taskKey) };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 6: Update Story Points
  mcpServer.registerTool(
    'update_story_points',
    {
      title: 'Update Story Points',
      description: 'Update story points of a task',
      inputSchema: z.object({
        taskKey: z.string().describe('Task key'),
        storyPoints: z.number().describe('Story points value')
      })
    },
    async ({ taskKey, storyPoints }) => {
      await jiraService.updateIssue(taskKey, { fields: { customfield_10016: storyPoints } });
      const output = { success: true, taskKey, storyPoints, estimatedHours: storyPoints * 2, url: buildIssueUrl(jiraService.cloudId, taskKey) };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 7: Update Task (Comprehensive)
  mcpServer.registerTool(
    'update_task',
    {
      title: 'Update Task',
      description: 'Update task fields: title, description, dates, story points',
      inputSchema: z.object({
        taskKey: z.string().describe('Task key'),
        title: z.string().optional(),
        description: z.string().optional(),
        startDate: z.string().optional(),
        dueDate: z.string().optional(),
        storyPoints: z.number().optional()
      })
    },
    async ({ taskKey, title, description, startDate, dueDate, storyPoints }) => {
      const updateFields = {};
      const updatedFieldsList = [];

      if (title) { updateFields.summary = title; updatedFieldsList.push('title'); }
      if (description) { updateFields.description = buildADF(description); updatedFieldsList.push('description'); }
      if (startDate) { updateFields.customfield_10015 = startDate; updatedFieldsList.push('startDate'); }
      if (dueDate) { updateFields.duedate = dueDate; updatedFieldsList.push('dueDate'); }
      if (storyPoints !== undefined) { updateFields.customfield_10016 = storyPoints; updatedFieldsList.push('storyPoints'); }

      await jiraService.updateIssue(taskKey, { fields: updateFields });
      const output = { success: true, taskKey, updatedFields: updatedFieldsList, url: buildIssueUrl(jiraService.cloudId, taskKey) };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 8: Get Task Details
  mcpServer.registerTool(
    'get_task_details',
    {
      title: 'Get Task Details',
      description: 'Get detailed information about a specific task',
      inputSchema: z.object({ taskKey: z.string().describe('Task key') })
    },
    async ({ taskKey }) => {
      const fields = 'summary,description,status,priority,assignee,customfield_10016,duedate,customfield_10015,created,issuetype,subtasks';
      const issue = await jiraService.getIssue(taskKey, fields);

      const subtasksDetails = [];
      if (issue.fields.subtasks?.length) {
        for (const st of issue.fields.subtasks) {
          try {
            const detail = await jiraService.getIssue(st.key, fields);
            subtasksDetails.push({
              key: detail.key,
              summary: detail.fields.summary,
              description: extractADFText(detail.fields.description),
              status: detail.fields.status.name,
              priority: detail.fields.priority?.name || 'None',
              assignee: detail.fields.assignee?.displayName || 'Unassigned',
              storyPoints: detail.fields.customfield_10016 || 0,
              startDate: detail.fields.customfield_10015 || null,
              dueDate: detail.fields.duedate || null,
              created: detail.fields.created,
              url: buildIssueUrl(jiraService.cloudId, detail.key)
            });
          } catch (e) { console.error(`Failed to fetch subtask ${st.key}:`, e.message); }
        }
      }

      const output = {
        key: issue.key,
        summary: issue.fields.summary,
        description: extractADFText(issue.fields.description),
        status: issue.fields.status.name,
        priority: issue.fields.priority?.name || 'None',
        assignee: issue.fields.assignee?.displayName || 'Unassigned',
        issueType: issue.fields.issuetype.name,
        storyPoints: issue.fields.customfield_10016 || 0,
        startDate: issue.fields.customfield_10015 || null,
        dueDate: issue.fields.duedate || null,
        created: issue.fields.created,
        hasSubtasks: subtasksDetails.length > 0,
        subtasksCount: subtasksDetails.length,
        subtasks: subtasksDetails,
        url: buildIssueUrl(jiraService.cloudId, issue.key)
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 9: Create Subtask
  mcpServer.registerTool(
    'create_subtask',
    {
      title: 'Create Subtask',
      description: 'Create a new subtask for an existing parent task',
      inputSchema: z.object({
        parentTaskKey: z.string().describe('Parent task key'),
        summary: z.string().describe('Subtask title'),
        description: z.string().optional(),
        storyPoints: z.number().optional(),
        startDate: z.string().optional(),
        dueDate: z.string().optional()
      })
    },
    async ({ parentTaskKey, summary, description, storyPoints, startDate, dueDate }) => {
      const user = await jiraService.getCurrentUser();
      const parentTask = await jiraService.getIssue(parentTaskKey, 'project');
      const projectKey = parentTask.fields.project.key;

      const subtaskFields = {
        project: { key: projectKey },
        summary,
        issuetype: { name: 'Subtask' },
        parent: { key: parentTaskKey },
        assignee: { accountId: user.accountId }
      };
      if (description) subtaskFields.description = buildADF(description);
      if (storyPoints) subtaskFields.customfield_10016 = storyPoints;
      if (startDate) subtaskFields.customfield_10015 = startDate;
      if (dueDate) subtaskFields.duedate = dueDate;

      const created = await jiraService.createIssue({ fields: subtaskFields });
      const output = {
        success: true,
        subtask: {
          key: created.key, summary, parentKey: parentTaskKey,
          assignedTo: user.displayName,
          storyPoints: storyPoints || null,
          startDate: startDate || null,
          dueDate: dueDate || null,
          url: buildIssueUrl(jiraService.cloudId, created.key)
        }
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );


  // Tool 10: Get Monthly Hours
  mcpServer.registerTool(
    'get_monthly_hours',
    {
      title: 'Get Monthly Hours',
      description: 'Calculate total monthly hours based on Story Points and working days',
      inputSchema: z.object({
        includeCompleted: z.boolean().default(true).describe('Include completed tasks')
      })
    },
    async ({ includeCompleted }) => {
      const user = await jiraService.getCurrentUser();
      const currentMonth = getCurrentMonthInfo();

      let jql = `assignee = "${user.accountId}" AND created <= "${currentMonth.endDate}"`;
      if (!includeCompleted) {
        jql += ' AND status NOT IN ("Done", "Closed", "Resolved")';
      } else {
        jql += ` AND (status NOT IN ("Done", "Closed", "Resolved") OR resolved >= "${currentMonth.startDate}")`;
      }

      const result = await jiraService.searchIssues(jql,
        'summary,key,status,issuetype,subtasks,duedate,created,customfield_10015,customfield_10016,resolved');

      let totalMonthlyHours = 0;
      const breakdown = [];
      const crossMonthTasks = [];

      result.issues.forEach(issue => {
        const hasSubtasks = issue.fields.subtasks?.length > 0;
        const isSubtask = issue.fields.issuetype.subtask;
        if (hasSubtasks && !isSubtask) return; // Skip parents with subtasks
        
        const storyPoints = issue.fields.customfield_10016;
        if (!storyPoints) return;

        const startDate = issue.fields.customfield_10015 || issue.fields.created;
        const endDate = issue.fields.duedate || moment().format('YYYY-MM-DD');
        const calc = calculateMonthlyHours(storyPoints, startDate, endDate);
        
        if (calc.monthlyHours <= 0) return;

        totalMonthlyHours += calc.monthlyHours;
        const taskData = {
          key: issue.key,
          summary: issue.fields.summary,
          storyPoints,
          status: issue.fields.status.name,
          type: issue.fields.issuetype.name,
          isSubtask,
          startDate: moment(startDate).format('YYYY-MM-DD'),
          endDate: moment(endDate).format('YYYY-MM-DD'),
          monthlyHours: calc.monthlyHours,
          totalHours: calc.totalHours,
          totalWorkingDays: calc.totalWorkingDays,
          currentMonthWorkingDays: calc.currentMonthWorkingDays,
          calculation: calc.calculation,
          spansMultipleMonths: spansMultipleMonths(startDate, endDate),
          url: buildIssueUrl(jiraService.cloudId, issue.key)
        };
        breakdown.push(taskData);
        if (taskData.spansMultipleMonths) crossMonthTasks.push(taskData);
      });

      breakdown.sort((a, b) => b.monthlyHours - a.monthlyHours);

      const output = {
        period: currentMonth.monthName,
        totalMonthlyHours: round2(totalMonthlyHours),
        totalMonthlyDays: round2(totalMonthlyHours / 8),
        entries: breakdown.length,
        crossMonthTasksCount: crossMonthTasks.length,
        breakdown,
        crossMonthTasks,
        summary: {
          currentMonth: currentMonth.monthName,
          totalTasksAnalyzed: result.total,
          tasksWithStoryPoints: breakdown.length,
          tasksSpanningMultipleMonths: crossMonthTasks.length,
          averageMonthlyHoursPerTask: breakdown.length > 0 ? round2(totalMonthlyHours / breakdown.length) : 0
        }
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 11: Get Board Sprints
  mcpServer.registerTool(
    'get_board_sprints',
    {
      title: 'Get Board Sprints',
      description: 'Get all sprints for a board',
      inputSchema: z.object({
        boardId: z.number().describe('Board ID'),
        state: z.enum(['active', 'future', 'closed', 'all']).default('active')
      })
    },
    async ({ boardId, state }) => {
      const stateParam = state === 'all' ? 'active,future,closed' : state;
      const result = await jiraService.getBoardSprints(boardId, stateParam);

      const sprints = (result.values || []).map(s => ({
        id: s.id, name: s.name, state: s.state, goal: s.goal || null,
        startDate: s.startDate ? moment(s.startDate).format('YYYY-MM-DD') : null,
        endDate: s.endDate ? moment(s.endDate).format('YYYY-MM-DD') : null
      }));

      const output = { boardId, total: sprints.length, activeSprint: sprints.find(s => s.state === 'active') || null, sprints };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Tool 12: Move Task to Sprint
  mcpServer.registerTool(
    'move_to_sprint',
    {
      title: 'Move Task to Sprint',
      description: 'Move one or more tasks to a specific sprint',
      inputSchema: z.object({
        sprintId: z.number().describe('Sprint ID'),
        taskKeys: z.array(z.string()).describe('Array of task keys')
      })
    },
    async ({ sprintId, taskKeys }) => {
      await jiraService.moveIssuesToSprint(sprintId, taskKeys);
      const sprint = await jiraService.getSprint(sprintId).catch(() => null);
      const sprintInfo = sprint 
        ? { id: sprint.id, name: sprint.name, state: sprint.state }
        : { id: sprintId, name: 'Unknown', state: 'unknown' };

      const output = { success: true, sprint: sprintInfo, movedTasks: taskKeys, message: `Moved ${taskKeys.length} task(s) to "${sprintInfo.name}"` };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );

  // Helper: Get sprint info (used by Tool 13 & 14)
  async function getSprintInfo(sprintId, boardId, defaultBoardId) {
    const effectiveBoardId = boardId || defaultBoardId;
    let targetSprintId = sprintId;
    let sprintInfo = null;

    if (!targetSprintId) {
      if (!effectiveBoardId) {
        throw new Error('Either boardId or sprintId is required.');
      }
      const activeSprint = await jiraService.getActiveSprint(effectiveBoardId);
      if (!activeSprint) throw new Error(`No active sprint for board ${effectiveBoardId}`);
      targetSprintId = activeSprint.id;
      sprintInfo = {
        id: activeSprint.id, name: activeSprint.name, state: activeSprint.state,
        startDate: activeSprint.startDate ? moment(activeSprint.startDate).format('YYYY-MM-DD') : null,
        endDate: activeSprint.endDate ? moment(activeSprint.endDate).format('YYYY-MM-DD') : null
      };
    } else {
      const sprint = await jiraService.getSprint(targetSprintId).catch(() => null);
      sprintInfo = sprint ? {
        id: sprint.id, name: sprint.name, state: sprint.state,
        startDate: sprint.startDate ? moment(sprint.startDate).format('YYYY-MM-DD') : null,
        endDate: sprint.endDate ? moment(sprint.endDate).format('YYYY-MM-DD') : null
      } : { id: targetSprintId, name: 'Unknown', state: 'unknown' };
    }
    return { targetSprintId, sprintInfo };
  }

  // Tool 13: Get Sprint Tasks
  mcpServer.registerTool(
    'get_sprint_tasks',
    {
      title: 'Get Sprint Tasks',
      description: 'Get all tasks in a sprint for all team members',
      inputSchema: z.object({
        boardId: z.number().optional().describe('Board ID for active sprint'),
        sprintId: z.number().optional().describe('Sprint ID (overrides boardId)'),
        status: z.enum(['all', 'todo', 'in-progress', 'done']).default('all')
      })
    },
    async ({ boardId, sprintId, status }) => {
      const { targetSprintId, sprintInfo } = await getSprintInfo(sprintId, boardId, jiraService.defaultBoardId);

      let jql = `sprint = ${targetSprintId}`;
      const statusMap = {
        'todo': ' AND status IN ("To Do", "Open", "New", "Backlog")',
        'in-progress': ' AND status IN ("In Progress", "In Development", "In Review")',
        'done': ' AND status IN ("Done", "Closed", "Resolved")'
      };
      if (statusMap[status]) jql += statusMap[status];

      const result = await jiraService.searchIssues(jql,
        'summary,status,assignee,priority,duedate,customfield_10015,customfield_10016,issuetype,subtasks');

      const tasksByAssignee = {};
      const tasks = result.issues.map(issue => {
        const assigneeName = issue.fields.assignee?.displayName || 'Unassigned';
        const assigneeId = issue.fields.assignee?.accountId || 'unassigned';
        const storyPoints = issue.fields.customfield_10016 || 0;
        
        if (!tasksByAssignee[assigneeId]) {
          tasksByAssignee[assigneeId] = { name: assigneeName, tasks: [], totalStoryPoints: 0 };
        }
        tasksByAssignee[assigneeId].tasks.push(issue.key);
        tasksByAssignee[assigneeId].totalStoryPoints += storyPoints;

        return {
          key: issue.key, summary: issue.fields.summary, status: issue.fields.status.name,
          priority: issue.fields.priority?.name || 'None', assignee: assigneeName, assigneeId,
          issueType: issue.fields.issuetype.name, isSubtask: issue.fields.issuetype.subtask,
          storyPoints, startDate: issue.fields.customfield_10015 || null,
          dueDate: issue.fields.duedate || null, url: buildIssueUrl(jiraService.cloudId, issue.key)
        };
      });

      const teamSummary = Object.values(tasksByAssignee)
        .map(m => ({ name: m.name, taskCount: m.tasks.length, totalStoryPoints: m.totalStoryPoints }))
        .sort((a, b) => b.totalStoryPoints - a.totalStoryPoints);

      const output = {
        sprint: sprintInfo, total: tasks.length,
        totalStoryPoints: tasks.reduce((sum, t) => sum + (t.storyPoints || 0), 0),
        statusFilter: status, teamSummary, tasks
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );


  // Tool 14: Get Sprint Daily Tasks (for daily standup)
  mcpServer.registerTool(
    'get_sprint_daily_tasks',
    {
      title: 'Get Sprint Daily Tasks',
      description: 'Get In Progress tasks for all team members. Perfect for daily standup.',
      inputSchema: z.object({
        boardId: z.number().optional().describe('Board ID for active sprint'),
        sprintId: z.number().optional().describe('Sprint ID (overrides boardId)')
      })
    },
    async ({ boardId, sprintId }) => {
      const { targetSprintId, sprintInfo } = await getSprintInfo(sprintId, boardId, jiraService.defaultBoardId);

      const jql = `sprint = ${targetSprintId} AND status IN ("In Progress", "In Development", "In Review")`;
      const result = await jiraService.searchIssues(jql,
        'summary,status,assignee,priority,duedate,customfield_10015,customfield_10016,issuetype,subtasks,parent');

      const tasksMap = new Map();
      const parentTasksWithInProgressSubtasks = new Set();

      // First pass: identify all In Progress items
      for (const issue of result.issues) {
        const isSubtask = issue.fields.issuetype.subtask;
        const parentKey = issue.fields.parent?.key || null;
        const assigneeName = issue.fields.assignee?.displayName || 'Unassigned';
        const assigneeId = issue.fields.assignee?.accountId || 'unassigned';
        const storyPoints = issue.fields.customfield_10016 || 0;
        
        const taskData = {
          key: issue.key, summary: issue.fields.summary, status: issue.fields.status.name,
          priority: issue.fields.priority?.name || 'None', assignee: assigneeName, assigneeId,
          issueType: issue.fields.issuetype.name, isSubtask, parentKey, storyPoints,
          startDate: issue.fields.customfield_10015 || null, dueDate: issue.fields.duedate || null,
          inProgressSubtasks: [], url: buildIssueUrl(jiraService.cloudId, issue.key)
        };
        tasksMap.set(issue.key, taskData);
        if (isSubtask && parentKey) parentTasksWithInProgressSubtasks.add(parentKey);
      }

      // Second pass: organize tasks
      const finalTasks = [];
      const processedSubtasks = new Set();

      for (const [key, task] of tasksMap) {
        if (task.isSubtask) continue;

        const hasSubtasks = result.issues.find(i => i.key === key)?.fields.subtasks?.length > 0;
        
        if (hasSubtasks) {
          const inProgressSubtasks = [];
          for (const [subKey, subTask] of tasksMap) {
            if (subTask.parentKey === key) {
              inProgressSubtasks.push({
                key: subTask.key, summary: subTask.summary, status: subTask.status,
                assignee: subTask.assignee, storyPoints: subTask.storyPoints
              });
              processedSubtasks.add(subKey);
            }
          }
          task.inProgressSubtasks = inProgressSubtasks;
          task.hasInProgressSubtasks = inProgressSubtasks.length > 0;
          finalTasks.push(task);
        } else {
          finalTasks.push(task);
        }
      }

      // Calculate team workload
      const workloadByAssignee = {};
      for (const task of finalTasks) {
        const assigneeId = task.assigneeId;
        if (!workloadByAssignee[assigneeId]) {
          workloadByAssignee[assigneeId] = { assignee: task.assignee, taskCount: 0, tasks: [] };
        }
        
        if (task.isSubtask || !task.hasInProgressSubtasks) {
          workloadByAssignee[assigneeId].taskCount++;
          workloadByAssignee[assigneeId].tasks.push(task.key);
        }
        
        if (task.inProgressSubtasks?.length) {
          for (const sub of task.inProgressSubtasks) {
            const subAssigneeId = tasksMap.get(sub.key)?.assigneeId || 'unassigned';
            const subAssigneeName = tasksMap.get(sub.key)?.assignee || 'Unassigned';
            if (!workloadByAssignee[subAssigneeId]) {
              workloadByAssignee[subAssigneeId] = { assignee: subAssigneeName, taskCount: 0, tasks: [] };
            }
            workloadByAssignee[subAssigneeId].taskCount++;
            workloadByAssignee[subAssigneeId].tasks.push(sub.key);
          }
        }
      }

      const teamWorkload = Object.values(workloadByAssignee)
        .map(w => ({ assignee: w.assignee, taskCount: w.taskCount, tasks: w.tasks }))
        .sort((a, b) => b.taskCount - a.taskCount);

      const parentTasksWithSubtasks = finalTasks.filter(t => !t.isSubtask && t.hasInProgressSubtasks);
      const standaloneTasksNoSubtasks = finalTasks.filter(t => !t.isSubtask && !t.hasInProgressSubtasks);
      const totalSubtasks = finalTasks.reduce((sum, t) => sum + (t.inProgressSubtasks?.length || 0), 0);
      const totalInProgressItems = standaloneTasksNoSubtasks.length + totalSubtasks;

      const output = {
        date: moment().format('YYYY-MM-DD'),
        sprint: sprintInfo,
        total: totalInProgressItems,
        parentTasksCount: parentTasksWithSubtasks.length,
        standaloneTasksCount: standaloneTasksNoSubtasks.length,
        subtasksCount: totalSubtasks,
        teamMemberCount: teamWorkload.length,
        teamWorkload,
        tasks: finalTasks
      };
      return { content: [{ type: 'text', text: JSON.stringify(output, null, 2) }], structuredContent: output };
    }
  );
}
