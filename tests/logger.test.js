import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

describe('Logger', () => {
  let logger;
  const testLogFile = path.join(os.tmpdir(), `jira-mcp-test-${Date.now()}.log`);

  beforeEach(async () => {
    vi.resetModules();
    
    // Import fresh logger instance
    const module = await import('../utils/logger.js');
    logger = module.default;
    
    // Override log file path for testing
    logger.logFile = testLogFile;
    logger.enabled = true;
  });

  afterEach(() => {
    // Clean up test log file
    try {
      if (fs.existsSync(testLogFile)) {
        fs.unlinkSync(testLogFile);
      }
      if (fs.existsSync(testLogFile + '.old')) {
        fs.unlinkSync(testLogFile + '.old');
      }
    } catch (e) {
      // Ignore cleanup errors
    }
  });

  describe('log', () => {
    it('should write log entry to file', () => {
      logger.log('INFO', 'Test message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('[INFO]');
      expect(content).toContain('Test message');
    });

    it('should include timestamp in log entry', () => {
      logger.log('INFO', 'Test message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      // Check for ISO timestamp format
      expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should include data when provided', () => {
      logger.log('INFO', 'Test message', { key: 'value', num: 123 });

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('"key": "value"');
      expect(content).toContain('"num": 123');
    });

    it('should not write when disabled', () => {
      logger.enabled = false;
      logger.log('INFO', 'Test message');

      expect(fs.existsSync(testLogFile)).toBe(false);
    });

    it('should append to existing log file', () => {
      logger.log('INFO', 'First message');
      logger.log('INFO', 'Second message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('First message');
      expect(content).toContain('Second message');
    });
  });

  describe('log levels', () => {
    it('should log INFO level', () => {
      logger.info('Info message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('[INFO]');
      expect(content).toContain('Info message');
    });

    it('should log ERROR level', () => {
      logger.error('Error message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('[ERROR]');
      expect(content).toContain('Error message');
    });

    it('should log WARN level', () => {
      logger.warn('Warning message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('[WARN]');
      expect(content).toContain('Warning message');
    });

    it('should log DEBUG level', () => {
      logger.debug('Debug message');

      const content = fs.readFileSync(testLogFile, 'utf8');
      expect(content).toContain('[DEBUG]');
      expect(content).toContain('Debug message');
    });

    it('should pass data to all log levels', () => {
      const testData = { test: true };

      logger.info('Info', testData);
      logger.error('Error', testData);
      logger.warn('Warn', testData);
      logger.debug('Debug', testData);

      const content = fs.readFileSync(testLogFile, 'utf8');
      // Should have 4 occurrences of the data
      const matches = content.match(/"test": true/g);
      expect(matches).toHaveLength(4);
    });
  });

  describe('log rotation', () => {
    it('should rotate log file when size exceeds maxLogSize', () => {
      // Set a very small max size for testing
      logger.maxLogSize = 100;

      // Write enough data to exceed the limit
      for (let i = 0; i < 10; i++) {
        logger.log('INFO', 'This is a test message that should trigger rotation');
      }

      // Check that old file was created
      expect(fs.existsSync(testLogFile + '.old')).toBe(true);
    });

    it('should delete previous backup when rotating', () => {
      logger.maxLogSize = 100;

      // Create initial backup
      fs.writeFileSync(testLogFile + '.old', 'old backup content');

      // Write enough to trigger rotation
      for (let i = 0; i < 10; i++) {
        logger.log('INFO', 'This is a test message that should trigger rotation');
      }

      // Old backup should be replaced
      const backupContent = fs.readFileSync(testLogFile + '.old', 'utf8');
      expect(backupContent).not.toBe('old backup content');
    });
  });

  describe('error handling', () => {
    it('should silently fail on write errors', () => {
      // Set log file to an invalid path
      logger.logFile = '/nonexistent/path/test.log';

      // Should not throw
      expect(() => logger.log('INFO', 'Test')).not.toThrow();
    });
  });
});
