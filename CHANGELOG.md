# Changelog

All notable changes to this project will be documented in this file.

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
