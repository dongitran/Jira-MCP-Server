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

// Create MCP server FIRST
const mcpServer = new McpServer({
  name: 'jira-mcp-server',
  version: '1.0.0'
});

// Register tools with empty jiraService initially
registerJiraTools(mcpServer, jiraService);

// Connect via stdio transport IMMEDIATELY
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error('🚀 Jira MCP Server connected, initializing...');

// Initialize in background AFTER connection
(async () => {
  try {
    await tokenManager.initialize();
    await jiraService.initialize();
    
    console.error('');
    console.error('✅ Jira MCP Server Ready');
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error(`☁️  Jira Cloud ID: ${jiraService.cloudId}`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('');
  } catch (error) {
    console.error('❌ Initialization failed:', error.message);
    console.error('Server will not function properly');
  }
})();
