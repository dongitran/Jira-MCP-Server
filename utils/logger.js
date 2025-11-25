import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class Logger {
  constructor() {
    // Log to a file in the project root
    this.logFile = path.join(__dirname, '..', 'jira-mcp-debug.log');
    // Enable by default, can be disabled with DEBUG_LOG=false
    this.enabled = process.env.DEBUG_LOG !== 'false';
    this.maxLogSize = 10 * 1024 * 1024; // 10MB max log file size
  }

  log(level, message, data = null) {
    if (!this.enabled) return;

    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n`;

    try {
      // Check log file size and rotate if needed
      if (fs.existsSync(this.logFile)) {
        const stats = fs.statSync(this.logFile);
        if (stats.size > this.maxLogSize) {
          const backupFile = this.logFile + '.old';
          if (fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
          }
          fs.renameSync(this.logFile, backupFile);
        }
      }

      fs.appendFileSync(this.logFile, logEntry);
    } catch (_error) {
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
