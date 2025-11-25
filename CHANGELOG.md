# Changelog

All notable changes to this project will be documented in this file.

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
