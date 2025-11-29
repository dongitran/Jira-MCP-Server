# Changelog

All notable changes to this project will be documented in this file.

## [1.2.0-alpha.5] - 2025-11-29

### Added
- **New Tool `add_comment`**: Add comments to Jira tasks
  - Simple API: `add_comment({ taskKey: "URC-123", body: "Comment text" })`
  - Returns comment ID, author, and creation timestamp

- **New Tool `get_comments`**: Get comments for a Jira task
  - Supports pagination with `maxResults` parameter
  - Field selection support for response optimization
  - Extracts text from Atlassian Document Format automatically

- **Assignee Support in `update_task`**: Update task assignee
  - Assign by account ID: `update_task({ taskKey: "URC-123", assignee: "accountId" })`
  - Assign by email: `update_task({ taskKey: "URC-123", assignee: "user@example.com" })`
  - Unassign: `update_task({ taskKey: "URC-123", assignee: "unassigned" })`

### Changed
- Total tools increased from 14 to 16

### Example Usage
```javascript
// Add a comment
add_comment({ taskKey: "URC-123", body: "Working on this now" })

// Get comments
get_comments({ taskKey: "URC-123", maxResults: 10 })

// Update assignee by email
update_task({ taskKey: "URC-123", assignee: "john@example.com" })

// Unassign task
update_task({ taskKey: "URC-123", assignee: "unassigned" })
```

---

## [1.2.0-alpha.4] - 2025-11-29

### Performance
- **Fix N+1 Query in `get_task_details`**: Batch fetch subtasks using JQL instead of individual API calls
  - Before: 1 + N API calls (1 for parent, N for each subtask)
  - After: 2 API calls (1 for parent, 1 for all subtasks)
  - ~5x faster for tasks with multiple subtasks
  - Reduces Jira API rate limit usage

---

## [1.2.0-alpha.3] - 2025-11-29

### Added
- **Field Selection**: Optional `fields` parameter for query tools to return only specific fields
  - Reduces response size and saves tokens for AI/LLM usage
  - Supported tools: `get_my_tasks`, `get_tasks_by_date`, `search_tasks`, `get_task_details`, `get_monthly_hours`, `get_sprint_tasks`, `get_sprint_daily_tasks`
  - Backward compatible: returns all fields when `fields` parameter is not provided

### Example
```javascript
// Return only key and summary
get_my_tasks({ filter: "today", fields: ["key", "summary"] })

// Return specific fields for sprint tasks
get_sprint_tasks({ boardId: 9, fields: ["key", "summary", "status", "assignee"] })
```

---

## [1.2.0-alpha.2] - 2025-11-29

### Fixed
- **Browse URL Format**: Fixed issue URLs to use correct Atlassian site URL format
  - Before: `https://api.atlassian.com/ex/jira/{cloudId}/browse/{issueKey}`
  - After: `https://{site}.atlassian.net/browse/{issueKey}`
- Added `siteUrl` property fetched from accessible-resources API
- Added `getBrowseUrl()` helper method in jiraService
- URLs now cached along with cloudId for faster startup

---

## [1.2.0-alpha.1] - 2025-11-28

### Added
- **Status Transitions in `update_task`**: Now supports changing task status using Jira workflow transitions
  - Use `status` parameter to transition to target status (e.g., "In Progress", "Done")
  - Optional `comment` parameter to add comment during transition
  - Case-insensitive status matching
  - Clear error messages showing available transitions when target status is not reachable
- **New jiraService methods**: `getTransitions()` and `doTransition()` for workflow operations

### Example
```javascript
// Change status only
update_task({ taskKey: "URC-123", status: "In Progress" })

// Change status with comment
update_task({ taskKey: "URC-123", status: "Done", comment: "Task completed" })

// Update status and other fields together
update_task({ taskKey: "URC-123", status: "In Progress", storyPoints: 5 })
```

---

## [1.1.0] - 2025-11-27

### 🎉 First Stable Release of v1.1.x

This release includes all features from alpha versions, thoroughly tested and production-ready.

### Highlights
- **14 Powerful Tools** for complete Jira task management
- **Sprint Integration** with auto-assign to active sprint
- **Team Workload Tracking** for sprint planning and daily standups
- **Monthly Hours Calculation** with Vietnamese holidays support
- **Robust Error Handling** with retry mechanism and circuit breaker
- **Token Persistence** with auto-refresh

### Tools Available
1. `get_my_tasks` - Get tasks assigned to current user
2. `get_tasks_by_date` - Get tasks active on a specific date
3. `search_tasks` - Search tasks using JQL or keyword
4. `create_task` - Create task with subtasks and sprint assignment
5. `update_task_dates` - Update start/due dates
6. `update_story_points` - Update story points
7. `update_task` - Update multiple fields at once
8. `get_task_details` - Get detailed task info with subtasks
9. `create_subtask` - Create subtask for existing task
10. `get_monthly_hours` - Calculate monthly hours from story points
11. `get_board_sprints` - Get all sprints for a board
12. `move_to_sprint` - Move tasks to a sprint
13. `get_sprint_tasks` - Get all tasks in sprint (all team members)
14. `get_sprint_daily_tasks` - Get In Progress tasks for daily standup

---

## [1.1.0-alpha.6] - 2025-11-26

### Changed
- **Reverted Code Refactoring**: Restored original `jiraTools.js` structure for better readability
- Removed `utils/dateHelpers.js` - keeping date helpers inline for simpler codebase
- Added `.npmignore` to exclude dev files from published package

## [1.1.0-alpha.5] - 2025-11-26

### Changed
- **Code Refactoring**: Extracted common date/working day helpers to `utils/dateHelpers.js`
- **Package Size Optimization**: Reduced package size by ~17% (24.7 kB → 20.6 kB)
- **Code Reduction**: `jiraTools.js` reduced from 1468 to ~810 lines (45% smaller)
- Added `.npmignore` to exclude dev files from published package

### Removed
- Duplicate Vietnamese holidays definitions
- Duplicate working days calculation functions
- Redundant outputSchema definitions

## [1.1.0-alpha.4] - 2025-11-26

### Fixed
- Downgraded zod from v4 to v3.23.8 for better compatibility
- Updated GitHub Actions checkout to v4

## [1.1.0-alpha.3] - 2025-11-26

### Added
- **New Tool `get_sprint_tasks`**: Get all tasks in a sprint for ALL team members
  - Filter by status: `all`, `todo`, `in-progress`, `done`
  - Team summary with task count and story points per member
  - Supports `boardId` (auto active sprint) or `sprintId` (specific sprint)
- **New Tool `get_sprint_daily_tasks`**: Get In Progress tasks for daily standup
  - Shows all In Progress tasks/subtasks for ALL team members
  - Parent tasks In Progress with their In Progress subtasks nested
  - Standalone tasks In Progress (no subtasks)
  - Subtasks of non-In Progress parents are excluded
  - Team workload breakdown per member
  - Perfect for daily standup meetings

### Changed
- Total tools increased from 12 to 14

## [1.1.0-alpha.2] - 2025-11-25

### Added
- **Sprint Support for `create_task`**: New parameters `sprintId` and `boardId` to assign tasks to sprints
  - `sprintId`: Direct sprint assignment by ID
  - `boardId`: Auto-assign to active sprint of the board
- **Default Project & Board Config**: New CLI args `--default_project` and `--default_board_id`
  - Set once in MCP config, no need to specify every time
  - Tasks auto-assign to active sprint when `default_board_id` is set
- **New Tool `get_board_sprints`**: Get all sprints for a board (active, future, closed)
- **New Tool `move_to_sprint`**: Move existing tasks to a specific sprint
- **Agile API Support**: Added `makeAgileRequest()` for Sprint operations via `/rest/agile/1.0/`

### Example Usage
```javascript
// Minimal - uses defaults from config (default_project + default_board_id)
create_task({ summary: "New feature" })

// Override defaults if needed
create_task({ project: "OTHER", summary: "New feature", boardId: 10 })
```

## [1.1.0-alpha.1] - 2025-11-21

### Added
- **Automatic Retry Mechanism**: API calls retry up to 3 times with exponential backoff
- **Circuit Breaker Pattern**: Prevents cascading failures when service is down
- **Enhanced Token Management**: Concurrent refresh prevention, smart 401 handling
- **Configurable Retry Settings**: New `retryConfig.js` for easy tuning
- **File Logging**: Enabled by default with auto-rotation at 10MB

### Changed
- **Reduced stderr Logging**: 90% reduction, optimized for MCP stdio transport
- Token validation only on first attempt (not every retry)

### Fixed
- API call failures now auto-retry instead of immediate failure
- Token expiration during retry properly handled
- Logging noise reduced for better MCP communication

### Note
This is an **alpha release** for testing. Install with: `npm install @urcard/jira-mcp-server@alpha`

## [1.0.9] - 2025-11-17

### Changed
- **Removed Cloud ID fetch**: No longer fetch Cloud ID from API (eliminates timeout issues)
- **Hardcoded Cloud ID**: Use Cloud ID from CLI arg `--cloud_id` or cached value
- **Faster startup**: Instant initialization without API calls

### Fixed
- Initialize timeout issues (60s timeout eliminated)
- Server now responds immediately to MCP client

## [1.0.8] - 2025-11-17

### Added
- **Token Persistence**: Auto-save tokens to `~/.jira-mcp/tokens.cache`
- **Auto Token Refresh**: Validate and refresh tokens before each API call
- **Token Reload**: Load cached tokens on startup (no need to pass tokens every time)
- Token cache includes: access_token, refresh_token, cloud_id, client_id, timestamp

### Changed
- Tokens are now persistent across restarts
- Only need to provide tokens once, then they're cached
- Auto-refresh updates cache immediately

### Security
- Added `tokens.cache` to `.gitignore`
- Token cache stored in user home directory `~/.jira-mcp/`

## [1.0.7] - 2025-11-17

### Added
- Cloud ID caching to `~/.jira-mcp/cloud-id.cache` (7 days TTL)
- Retry mechanism (3 attempts) for `fetchCloudId` with exponential backoff
- Retry mechanism (3 attempts) for `refreshAccessToken`
- 10s timeout for API calls

### Fixed
- Timeout issues on slow network
- Non-blocking Cloud ID refresh in background

## [1.0.6] - 2025-11-17

### Added
- Initial Cloud ID caching implementation

## [1.0.5] - 2025-11-17

### Added
- Initial release with 7 Jira tools
- OAuth authentication
- MCP protocol support
