import { describe, it, expect } from 'vitest';
import { retryConfig, calculateRetryDelay } from '../config/retryConfig.js';

describe('retryConfig', () => {
  describe('default configuration', () => {
    it('should have correct default values', () => {
      expect(retryConfig.maxRetries).toBe(3);
      expect(retryConfig.initialRetryDelay).toBe(1000);
      expect(retryConfig.maxRetryDelay).toBe(10000);
      expect(retryConfig.requestTimeout).toBe(30000);
      expect(retryConfig.tokenRefreshTimeout).toBe(15000);
      expect(retryConfig.backoffMultiplier).toBe(2);
      expect(retryConfig.useJitter).toBe(true);
      expect(retryConfig.maxJitter).toBe(1000);
    });

    it('should have correct retryable status codes', () => {
      expect(retryConfig.retryableStatusCodes).toContain(408); // Request Timeout
      expect(retryConfig.retryableStatusCodes).toContain(429); // Too Many Requests
      expect(retryConfig.retryableStatusCodes).toContain(500); // Internal Server Error
      expect(retryConfig.retryableStatusCodes).toContain(502); // Bad Gateway
      expect(retryConfig.retryableStatusCodes).toContain(503); // Service Unavailable
      expect(retryConfig.retryableStatusCodes).toContain(504); // Gateway Timeout
      expect(retryConfig.retryableStatusCodes).not.toContain(400); // Bad Request
      expect(retryConfig.retryableStatusCodes).not.toContain(401); // Unauthorized
      expect(retryConfig.retryableStatusCodes).not.toContain(404); // Not Found
    });
  });

  describe('calculateRetryDelay', () => {
    it('should calculate exponential backoff for attempt 0', () => {
      const configNoJitter = { ...retryConfig, useJitter: false };
      const delay = calculateRetryDelay(0, configNoJitter);
      // 1000 * 2^0 = 1000
      expect(delay).toBe(1000);
    });

    it('should calculate exponential backoff for attempt 1', () => {
      const configNoJitter = { ...retryConfig, useJitter: false };
      const delay = calculateRetryDelay(1, configNoJitter);
      // 1000 * 2^1 = 2000
      expect(delay).toBe(2000);
    });

    it('should calculate exponential backoff for attempt 2', () => {
      const configNoJitter = { ...retryConfig, useJitter: false };
      const delay = calculateRetryDelay(2, configNoJitter);
      // 1000 * 2^2 = 4000
      expect(delay).toBe(4000);
    });

    it('should cap delay at maxRetryDelay', () => {
      const configNoJitter = { ...retryConfig, useJitter: false };
      const delay = calculateRetryDelay(10, configNoJitter);
      // 1000 * 2^10 = 1024000, but capped at 10000
      expect(delay).toBe(10000);
    });

    it('should add jitter when enabled', () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(calculateRetryDelay(0, retryConfig));
      }
      // With jitter, delays should vary
      const uniqueDelays = new Set(delays);
      // Should have some variation (not all the same)
      expect(uniqueDelays.size).toBeGreaterThan(1);
    });

    it('should keep jitter within bounds', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateRetryDelay(0, retryConfig);
        // Base delay is 1000, max jitter is 1000, so max is 2000
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(2000);
      }
    });

    it('should respect maxRetryDelay + maxJitter cap', () => {
      for (let i = 0; i < 100; i++) {
        const delay = calculateRetryDelay(10, retryConfig);
        // Max delay is 10000 + 1000 jitter = 11000
        expect(delay).toBeLessThanOrEqual(11000);
      }
    });

    it('should use default config when not provided', () => {
      const delay = calculateRetryDelay(0);
      // Should work with default config
      expect(delay).toBeGreaterThanOrEqual(1000);
      expect(delay).toBeLessThanOrEqual(2000);
    });

    it('should handle custom config', () => {
      const customConfig = {
        initialRetryDelay: 500,
        maxRetryDelay: 5000,
        backoffMultiplier: 3,
        useJitter: false,
        maxJitter: 0
      };
      
      expect(calculateRetryDelay(0, customConfig)).toBe(500);  // 500 * 3^0
      expect(calculateRetryDelay(1, customConfig)).toBe(1500); // 500 * 3^1
      expect(calculateRetryDelay(2, customConfig)).toBe(4500); // 500 * 3^2
      expect(calculateRetryDelay(3, customConfig)).toBe(5000); // 500 * 3^3 = 13500, capped at 5000
    });
  });
});
