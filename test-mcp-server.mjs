import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

async function main() {
  const server = new McpServer({
    name: 'test-server',
    version: '1.0.0'
  });

  // NO TOOLS - just connect
  const transport = new StdioServerTransport();
  await server.connect(transport);
  
  console.error('✅ Test Server Ready');
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
