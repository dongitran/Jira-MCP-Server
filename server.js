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

// Initialize jiraService synchronously with what we have
jiraService.accessToken = config.access_token;
jiraService.cloudId = config.cloud_id || '03ad0865-37eb-4006-b06f-5284e2f09fa7'; // Default cloud ID
jiraService.baseURL = `https://api.atlassian.com/ex/jira/${jiraService.cloudId}`;

// Create and setup MCP server
const mcpServer = new McpServer({
  name: 'jira-mcp-server',
  version: '1.0.3'
});

registerJiraTools(mcpServer, jiraService);

// Connect transport
const transport = new StdioServerTransport();
await mcpServer.connect(transport);

console.error('✅ Jira MCP Server Ready');

// Fetch real cloud ID in background if not provided
if (!config.cloud_id) {
  tokenManager.fetchCloudId().then(() => {
    jiraService.cloudId = tokenManager.cloudId;
    jiraService.baseURL = `https://api.atlassian.com/ex/jira/${jiraService.cloudId}`;
    console.error(`☁️  Cloud ID updated: ${jiraService.cloudId}`);
  }).catch(err => console.error('Warning: Could not fetch cloud ID:', err.message));
}
