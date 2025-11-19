# Jira MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for Jira integration with OAuth authentication.

[![npm version](https://img.shields.io/npm/v/@urcard/jira-mcp-server.svg)](https://www.npmjs.com/package/@urcard/jira-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@urcard/jira-mcp-server.svg)](https://www.npmjs.com/package/@urcard/jira-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## Features

- ✅ **10 Powerful Tools** - Complete task management with daily & monthly hours tracking
- ✅ **OAuth Authentication** - Secure auto-refresh tokens
- ✅ **Zero Configuration** - No database, CLI-based setup
- ✅ **MCP Compatible** - Works with Claude, Cursor, VS Code

## Installation

**Global install (recommended):**
```bash
npm install -g @urcard/jira-mcp-server
```

**Or clone from source:**
```bash
git clone https://github.com/dongitran/Jira-MCP-Server.git
cd Jira-MCP-Server
npm install
```

## Prerequisites

You need Jira OAuth credentials:
- `access_token` - OAuth access token
- `refresh_token` - OAuth refresh token
- `client_id` - OAuth client ID
- `client_secret` - OAuth client secret
- `cloud_id` - Atlassian Cloud ID

**🚀 Easy way to get credentials:** Use our [OAuth Token Generator](https://github.com/dongitran/Jira-Oauth-Token-Generator) - it provides ready-to-use MCP config with all required credentials including `cloud_id`!

Or manually: [How to get Jira OAuth credentials →](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)

## Configuration

### Quick Setup (Recommended)

Use our [OAuth Token Generator](https://github.com/dongitran/Jira-Oauth-Token-Generator) to get ready-to-use config with all credentials including `cloud_id`. Just copy and paste!

### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp-server",
      "args": [
        "--access_token", "YOUR_ACCESS_TOKEN",
        "--refresh_token", "YOUR_REFRESH_TOKEN",
        "--client_id", "YOUR_CLIENT_ID",
        "--client_secret", "YOUR_CLIENT_SECRET",
        "--cloud_id", "YOUR_CLOUD_ID"
      ],
      "env": {}
    }
  }
}
```

### For Cursor

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp-server",
      "args": [
        "--access_token", "YOUR_ACCESS_TOKEN",
        "--refresh_token", "YOUR_REFRESH_TOKEN",
        "--client_id", "YOUR_CLIENT_ID",
        "--client_secret", "YOUR_CLIENT_SECRET",
        "--cloud_id", "YOUR_CLOUD_ID"
      ],
      "env": {}
    }
  }
}
```

### For VS Code

Add to `~/Library/Application Support/Code/User/mcp.json` (macOS):

```json
{
  "mcpServers": {
    "jira": {
      "command": "jira-mcp-server",
      "args": [
        "--access_token", "YOUR_ACCESS_TOKEN",
        "--refresh_token", "YOUR_REFRESH_TOKEN",
        "--client_id", "YOUR_CLIENT_ID",
        "--client_secret", "YOUR_CLIENT_SECRET",
        "--cloud_id", "YOUR_CLOUD_ID"
      ],
      "env": {}
    }
  }
}
```

**Note:** After first run, tokens are cached to `~/.jira-mcp/tokens.cache` and will auto-refresh. You only need to provide credentials once!

## Available Tools

### 1. `get_my_tasks`
Get tasks assigned to current user with filters.

**Parameters:**
- `filter`: `todo` | `today` | `in-progress` | `high-priority` | `overdue` | `completed` | `all`
- `period`: `today` | `week` | `month` (for completed filter)

**Example:**
```json
{
  "filter": "today"
}
```

### 2. `get_tasks_by_date`
Get tasks active on a specific date with daily hours calculation.

**Parameters:**
- `date`: Date in YYYY-MM-DD format

**Example:**
```json
{
  "date": "2025-01-15"
}
```

**Features:**
- Calculates daily hours based on story points
- Excludes weekends and Vietnamese holidays
- Smart workload distribution

### 3. `search_tasks`
Search tasks using JQL query or keyword.

**Parameters:**
- `query`: JQL query or keyword
- `maxResults`: Maximum results (default: 50)

**Example:**
```json
{
  "query": "project = URC AND status = 'In Progress'",
  "maxResults": 20
}
```

### 4. `create_task`
Create a new Jira task with optional subtasks.

**Parameters:**
- `project`: Project key (required)
- `summary`: Task title (required)
- `description`: Task description (optional)
- `issueType`: Issue type (default: "Task")
- `priority`: Priority (default: "Medium")
- `storyPoints`: Story points (optional)
- `startDate`: Start date YYYY-MM-DD (optional)
- `dueDate`: Due date YYYY-MM-DD (optional)
- `subtasks`: Array of subtasks (optional)

**Example:**
```json
{
  "project": "URC",
  "summary": "Implement new feature",
  "priority": "High",
  "storyPoints": 5,
  "dueDate": "2025-01-20",
  "subtasks": [
    {
      "summary": "Design API",
      "storyPoints": 2
    }
  ]
}
```

### 5. `update_task_dates`
Update start date and/or due date of a task.

**Parameters:**
- `taskKey`: Task key (required)
- `startDate`: Start date YYYY-MM-DD (optional)
- `dueDate`: Due date YYYY-MM-DD (optional)

### 6. `update_story_points`
Update story points of a task.

**Parameters:**
- `taskKey`: Task key (required)
- `storyPoints`: Story points value (required)

### 7. `update_task`
Update task fields including title, description, dates, and story points.

**Parameters:**
- `taskKey`: Task key (required)
- `title`: Task title/summary (optional)
- `description`: Task description (optional)
- `startDate`: Start date YYYY-MM-DD (optional)
- `dueDate`: Due date YYYY-MM-DD (optional)
- `storyPoints`: Story points value (optional)

**Example:**
```json
{
  "taskKey": "URC-123",
  "title": "Updated task title",
  "description": "Updated description",
  "storyPoints": 8
}
```

### 8. `get_task_details`
Get detailed information about a specific task including all subtasks.

**Parameters:**
- `taskKey`: Task key (required)

**Example:**
```json
{
  "taskKey": "URC-123"
}
```

### 9. `create_subtask`
Create a new subtask for an existing parent task.

**Parameters:**
- `parentTaskKey`: Parent task key (required)
- `summary`: Subtask title (required)
- `description`: Subtask description (optional)
- `storyPoints`: Story points (optional)
- `startDate`: Start date YYYY-MM-DD (optional)
- `dueDate`: Due date YYYY-MM-DD (optional)

**Example:**
```json
{
  "parentTaskKey": "URC-123",
  "summary": "Implement API endpoint",
  "storyPoints": 3,
  "dueDate": "2025-01-20"
}
```

### 10. `get_monthly_hours`
Calculate total monthly hours based on Story Points and working days.

**Parameters:**
- `includeCompleted`: Include completed tasks (default: true)

**Example:**
```json
{
  "includeCompleted": true
}
```

**Features:**
- Calculates hours distribution across months
- Excludes weekends and Vietnamese holidays
- Handles tasks spanning multiple months
- Provides detailed breakdown per task

## Daily & Monthly Hours Calculation

### Daily Hours (`get_tasks_by_date`)

Calculates daily hours intelligently:

- **Formula**: `Daily Hours = (Story Points × 2) ÷ Working Days`
- **Working Days**: Monday-Friday, excluding Vietnamese holidays
- **Story Points Logic**: Excludes parent tasks with subtasks to avoid double counting

**Example:**
- Task: 5 story points
- Duration: 5 working days
- Daily Hours: (5 × 2) ÷ 5 = 2 hours/day

### Monthly Hours (`get_monthly_hours`)

Calculates monthly hours distribution:

- **Formula**: `Monthly Hours = (Total Hours ÷ Total Working Days) × Working Days in Month`
- **Cross-Month Tasks**: Automatically calculates portion for current month
- **Working Days**: Monday-Friday, excluding Vietnamese holidays
- **Completed Tasks**: Optionally include/exclude

**Example:**
- Task: 10 story points, spans 20 working days
- Total Hours: 10 × 2 = 20 hours
- Current month has 10 working days for this task
- Monthly Hours: (20 ÷ 20) × 10 = 10 hours

## Development

```bash
# Run with auto-reload
npm run dev

# Lint code
npm run lint

# Fix lint issues
npm run lint:fix
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Links

- [GitHub Repository](https://github.com/dongitran/Jira-MCP-Server)
- [OAuth Token Generator](https://github.com/dongitran/Jira-Oauth-Token-Generator)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Jira Cloud Platform](https://developer.atlassian.com/cloud/jira/platform/)

## Support

If you encounter any issues or have questions:
- [Open an issue](https://github.com/dongitran/Jira-MCP-Server/issues)
- Check the [MCP documentation](https://modelcontextprotocol.io/docs)

## 👨‍💻 Author

dongtran ✨

## 📄 License

MIT

---

Made with ❤️ to make your work life easier!
