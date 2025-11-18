import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
  constructor() {
    // Log to a file in the project root
    this.logFile = path.join(__dirname, '..', 'jira-mcp-debug.log');
    this.enabled = process.env.DEBUG_LOG === 'true';
  }

  log(level, message, data = null) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;

    try {
      fs.appendFileSync(this.logFile, logEntry);
    } catch (error) {
      // Silently fail - don't use console.error in MCP server
    }
  }

  info(message, data) {
    this.log('INFO', message, data);
  }

  error(message, data) {
    this.log('ERROR', message, data);
  }

  warn(message, data) {
    this.log('WARN', message, data);
  }

  debug(message, data) {
    this.log('DEBUG', message, data);
  }
}

export default new Logger();
