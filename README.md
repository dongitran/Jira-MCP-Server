# Jira MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for Jira integration with OAuth token-based authentication. No database required - all configuration via command-line arguments.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)](https://nodejs.org/)

## Features

- ✅ **7 Powerful Tools** - Complete Jira task management
- ✅ **OAuth Authentication** - Secure token-based auth with auto-refresh
- ✅ **No Database** - Stateless, config via CLI arguments
- ✅ **Daily Hours Calculation** - Smart workload estimation based on story points
- ✅ **MCP Protocol** - Works with Claude, Cursor, VS Code, and other MCP clients
- ✅ **Production Ready** - Clean code, ESLint, Node 18+

## Installation

```bash
npm install jira-mcp-server
```

Or clone and install:

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

[How to get Jira OAuth credentials →](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)

## Configuration

### For Cursor

Create `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": [
        "/path/to/Jira-MCP-Server/server.js",
        "--access_token", "YOUR_ACCESS_TOKEN",
        "--refresh_token", "YOUR_REFRESH_TOKEN",
        "--client_id", "YOUR_CLIENT_ID",
        "--client_secret", "YOUR_CLIENT_SECRET"
      ]
    }
  }
}
```

### For VS Code

Create `.kiro/settings/mcp.json`:

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": [
        "/path/to/Jira-MCP-Server/server.js",
        "--access_token", "YOUR_ACCESS_TOKEN",
        "--refresh_token", "YOUR_REFRESH_TOKEN",
        "--client_id", "YOUR_CLIENT_ID",
        "--client_secret", "YOUR_CLIENT_SECRET"
      ]
    }
  }
}
```

### For Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "jira": {
      "command": "node",
      "args": [
        "/path/to/Jira-MCP-Server/server.js",
        "--access_token", "YOUR_ACCESS_TOKEN",
        "--refresh_token", "YOUR_REFRESH_TOKEN",
        "--client_id", "YOUR_CLIENT_ID",
        "--client_secret", "YOUR_CLIENT_SECRET"
      ]
    }
  }
}
```

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

### 7. `get_task_details`
Get detailed information about a specific task.

**Parameters:**
- `taskKey`: Task key (required)

## Daily Hours Calculation

The `get_tasks_by_date` tool calculates daily hours intelligently:

- **Formula**: `Daily Hours = (Story Points × 2) ÷ Working Days`
- **Working Days**: Monday-Friday, excluding Vietnamese holidays
- **Story Points Logic**: Excludes parent tasks with subtasks to avoid double counting

**Example:**
- Task: 5 story points
- Duration: 5 working days
- Daily Hours: (5 × 2) ÷ 5 = 2 hours/day

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
