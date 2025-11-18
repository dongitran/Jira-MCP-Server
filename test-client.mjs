import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testServer(serverPath, args = []) {
  console.log(`\n🧪 Testing: ${serverPath}`);
  console.log(`   Args: ${JSON.stringify(args)}\n`);

  try {
    const serverProcess = spawn(serverPath, args, {
      stdio: ['pipe', 'pipe', 'inherit']
    });

    const transport = new StdioClientTransport({
      reader: serverProcess.stdout,
      writer: serverProcess.stdin
    });

    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });

    // Set timeout for initialization
    const timeout = setTimeout(() => {
      console.error('❌ TIMEOUT after 10 seconds!');
      serverProcess.kill();
      process.exit(1);
    }, 10000);

    await client.connect(transport);
    clearTimeout(timeout);

    console.log('✅ SUCCESS! Server responded to initialize');

    // List tools
    const tools = await client.listTools();
    console.log(`📦 Tools available: ${tools.tools.length}`);
    tools.tools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });

    serverProcess.kill();
    return true;
  } catch (error) {
    console.error('❌ FAILED:', error.message);
    return false;
  }
}

// Test scenarios
(async () => {
  // Test 1: Minimal server
  console.log('=== TEST 1: Minimal Server (no tools) ===');
  await testServer('node', ['/tmp/test-mcp-server.js']);

  // Test 2: Jira server (if credentials available)
  console.log('\n=== TEST 2: Jira Server ===');
  const result = await testServer('jira-mcp-server', [
    '--access_token', 'dummy',
    '--refresh_token', 'dummy',
    '--client_id', 'dummy',
    '--client_secret', 'dummy',
    '--cloud_id', 'dummy'
  ]);

  process.exit(result ? 0 : 1);
})();
