import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import tokenManager from './config/tokenManager.js';
import jiraService from './services/jiraService.js';
import { registerJiraTools } from './tools/jiraTools.js';

// Parse command line arguments for credentials
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].substring(2);
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        config[key] = value;
        i++;
      }
    }
  }
  
  return config;
}

const config = parseArgs();

// Set credentials - this is instant
tokenManager.setCredentials(config);

// Quick sync init - just validate credentials exist
if (!config.access_token || !config.refresh_token || !config.client_id || !config.client_secret) {
  console.error('❌ Missing required OAuth credentials');
  console.error('Usage: jira-mcp-server --access_token <token> --refresh_token <token> --client_id <id> --client_secret <secret>');
  process.exit(1);
}

// Initialize jiraService with cloud ID (priority: CLI arg > cached)
jiraService.accessToken = tokenManager.accessToken;
jiraService.cloudId = tokenManager.cloudId;

if (!jiraService.cloudId) {
  console.error('❌ Missing Cloud ID');
  console.error('Please provide --cloud_id argument or ensure it is cached');
  process.exit(1);
}

jiraService.baseURL = `https://api.atlassian.com/ex/jira/${jiraService.cloudId}`;
console.error(`☁️  Using Cloud ID: ${jiraService.cloudId}`);

// Set default project and board from config (optional)
jiraService.defaultProject = config.default_project || null;
jiraService.defaultBoardId = config.default_board_id ? parseInt(config.default_board_id) : null;

if (jiraService.defaultProject) {
  console.error(`📁 Default Project: ${jiraService.defaultProject}`);
}
if (jiraService.defaultBoardId) {
  console.error(`📋 Default Board ID: ${jiraService.defaultBoardId} (auto-assign to active sprint)`);
}

const SERVER_VERSION = '1.1.0-alpha.5';

// Main async function
async function main() {
  try {
    console.error(`🚀 Jira MCP Server v${SERVER_VERSION} starting...`);
    console.error('🔧 [1/5] Creating MCP server...');
    // Create and setup MCP server
    const mcpServer = new McpServer({
      name: 'jira-mcp-server',
      version: SERVER_VERSION
    });
    console.error('✅ [1/5] MCP server created');

    console.error('🔧 [2/5] Registering tools...');
    // Register tools BEFORE connecting (required by MCP SDK)
    registerJiraTools(mcpServer, jiraService);
    console.error('✅ [2/5] Tools registered');

    console.error('🔧 [3/5] Creating transport...');
    // Connect transport
    const transport = new StdioServerTransport();
    console.error('✅ [3/5] Transport created');

    console.error('🔧 [4/5] Connecting server to transport...');
    await mcpServer.connect(transport);
    console.error('✅ [4/5] Server connected to transport');
    console.error('✅ [5/5] Jira MCP Server Ready - waiting for requests');

    // Explicitly keep process alive by preventing exit
    process.stdin.resume();

    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.error('🛑 Server shutting down...');
      process.exit(0);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    throw error;
  }
}

main().catch(err => {
  console.error('❌ Server error:', err);
  process.exit(1);
});
