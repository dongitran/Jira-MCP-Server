# Jira MCP Server

A [Model Context Protocol (MCP)](https://modelcontextprotocol.io) server for Jira integration with OAuth authentication.

[![npm version](https://img.shields.io/npm/v/@urcard/jira-mcp-server.svg)](https://www.npmjs.com/package/@urcard/jira-mcp-server)
[![npm downloads](https://img.shields.io/npm/dm/@urcard/jira-mcp-server.svg)](https://www.npmjs.com/package/@urcard/jira-mcp-server)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-289%20passed-brightgreen)](https://github.com/dongitran/Jira-MCP-Server)

## ✨ Features

| Feature | Description |
|---------|-------------|
| 🛠️ **16 Tools** | Tasks, sprints, comments, workload tracking |
| 🔄 **Sprint Integration** | Auto-assign to active sprint |
| 💬 **Comments** | Add & retrieve task comments |
| 👤 **Assignee** | Update by email or account ID |
| 🔐 **OAuth** | Auto-refresh tokens |
| 🧪 **Tested** | 289 tests, 100% pass rate |

## 🚀 Quick Start

**1. Install:**
```bash
npm install -g @urcard/jira-mcp-server
```

**2. Get credentials:** Use [OAuth Token Generator](https://github.com/dongitran/Jira-Oauth-Token-Generator) (easiest) or [manual setup](https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/)

**3. Configure your IDE** (see [Configuration](#configuration))

## 📋 Tools Overview

| Tool | Description |
|------|-------------|
| `get_my_tasks` | Get your tasks with filters (todo, in-progress, overdue, etc.) |
| `get_tasks_by_date` | Tasks active on a date with daily hours |
| `search_tasks` | Search by JQL or keyword |
| `create_task` | Create task with subtasks & sprint assignment |
| `update_task` | Update status, assignee, dates, story points |
| `update_task_dates` | Update start/due dates |
| `update_story_points` | Update story points |
| `get_task_details` | Get task info with subtasks |
| `create_subtask` | Create subtask for parent |
| `get_monthly_hours` | Calculate monthly hours from story points |
| `get_board_sprints` | List sprints for a board |
| `move_to_sprint` | Move tasks to sprint |
| `get_sprint_tasks` | All sprint tasks (team view) |
| `get_sprint_daily_tasks` | In Progress tasks (daily standup) |
| `add_comment` | Add comment to task |
| `get_comments` | Get task comments |

## ⚙️ Configuration

### Required Credentials

| Credential | Description |
|------------|-------------|
| `access_token` | OAuth access token |
| `refresh_token` | OAuth refresh token |
| `client_id` | OAuth client ID |
| `client_secret` | OAuth client secret |
| `cloud_id` | Atlassian Cloud ID |

**Optional:**
- `default_project` - Default project key (e.g., "URC")
- `default_board_id` - Board ID for auto-sprint (find in URL: `/boards/9`)

### IDE Configuration

<details>
<summary><b>Claude Desktop</b></summary>

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

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
        "--cloud_id", "YOUR_CLOUD_ID",
        "--default_project", "YOUR_PROJECT",
        "--default_board_id", "YOUR_BOARD_ID"
      ]
    }
  }
}
```
</details>

<details>
<summary><b>Cursor</b></summary>

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
      ]
    }
  }
}
```
</details>

<details>
<summary><b>VS Code / Kiro</b></summary>

Add to settings or `.vscode/mcp.json`:

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
      ]
    }
  }
}
```
</details>

> 💡 **Tip:** Tokens are cached to `~/.jira-mcp/tokens.cache` and auto-refresh. Configure once!

## 📖 Tool Examples

### Task Management

```javascript
// Get today's tasks
get_my_tasks({ filter: "today" })

// Create task with sprint assignment
create_task({
  project: "URC",
  summary: "New feature",
  storyPoints: 5,
  boardId: 9
})

// Update task status & assignee
update_task({
  taskKey: "URC-123",
  status: "In Progress",
  assignee: "john@example.com"
})

// Search tasks
search_tasks({ query: "project = URC AND status = Open" })
```

### Sprint & Team

```javascript
// Get sprint tasks for team
get_sprint_tasks({ boardId: 9 })

// Daily standup - In Progress tasks
get_sprint_daily_tasks({ boardId: 9 })

// Move tasks to sprint
move_to_sprint({ sprintId: 50, taskKeys: ["URC-1", "URC-2"] })
```

### Comments

```javascript
// Add comment
add_comment({ taskKey: "URC-123", body: "Working on this" })

// Get comments
get_comments({ taskKey: "URC-123", maxResults: 10 })
```

### Workload

```javascript
// Daily hours for a date
get_tasks_by_date({ date: "2025-01-15" })

// Monthly hours calculation
get_monthly_hours({ includeCompleted: true })
```

### Field Selection

Reduce response size by selecting specific fields:

```javascript
get_my_tasks({ 
  filter: "today", 
  fields: ["key", "summary", "status"] 
})
```

## 📊 Hours Calculation

**Daily Hours:** `(Story Points × 2) ÷ Working Days`

**Monthly Hours:** `(Total Hours ÷ Total Working Days) × Days in Month`

- Excludes weekends & Vietnamese holidays
- Handles cross-month tasks
- Avoids double-counting (excludes parents with subtasks)

## 🧪 Development

```bash
npm run dev          # Auto-reload
npm test             # Run 289 tests
npm run test:coverage # Coverage report
npm run lint         # Lint code
```

## 🔗 Links

- [GitHub](https://github.com/dongitran/Jira-MCP-Server)
- [OAuth Token Generator](https://github.com/dongitran/Jira-Oauth-Token-Generator)
- [MCP Protocol](https://modelcontextprotocol.io)
- [Issues](https://github.com/dongitran/Jira-MCP-Server/issues)

## 📄 License

MIT - Made with ❤️ by dongtran
