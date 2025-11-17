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

// Set credentials from command line arguments
tokenManager.setCredentials(config);

console.error('🚀 Initializing Jira MCP Server...');

// Initialize token manager and jira service BEFORE creating server
try {
  await tokenManager.initialize();
  await jiraService.initialize();
} catch (error) {
  console.error('❌ Initialization failed:', error.message);
  console.error('');
  console.error('Usage: node server.js --access_token <token> --refresh_token <token> --client_id <id> --client_secret <secret>');
  console.error('');
  console.error('Required arguments:');
  console.error('  --access_token      Jira OAuth access token');
  console.error('  --refresh_token     Jira OAuth refresh token');
  console.error('  --client_id         Jira OAuth client ID');
  console.error('  --client_secret     Jira OAuth client secret');
  console.error('');
  console.error('Optional arguments:');
  console.error('  --cloud_id          Jira Cloud ID (auto-fetched if not provided)');
  process.exit(1);
}

// Create MCP server
const mcpServer = new McpServer({
  name: 'jira-mcp-server',
  version: '1.0.0'
});

// Register all Jira tools BEFORE connecting
registerJiraTools(mcpServer, jiraService);

// Connect via stdio transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error('');
console.error('✅ Jira MCP Server Ready');
console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.error(`☁️  Jira Cloud ID: ${jiraService.cloudId}`);
console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.error('');
console.error('📋 Available MCP Tools:');
console.error('   • get_my_tasks - Get current user tasks');
console.error('   • get_tasks_by_date - Get tasks active on specific date');
console.error('   • search_tasks - Search tasks by JQL or keyword');
console.error('   • create_task - Create new Jira task');
console.error('   • update_task_dates - Update task start/due dates');
console.error('   • update_story_points - Update task story points');
console.error('   • get_task_details - Get detailed task information');
console.error('');
