import { describe, it, expect, beforeEach, vi } from 'vitest';
import CircuitBreaker from '../utils/circuitBreaker.js';

describe('CircuitBreaker', () => {
  let circuitBreaker;

  beforeEach(() => {
    // Suppress console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  describe('initialization', () => {
    it('should initialize with default options', () => {
      circuitBreaker = new CircuitBreaker();
      const state = circuitBreaker.getState();
      
      expect(state.state).toBe('CLOSED');
      expect(state.failureCount).toBe(0);
      expect(state.successCount).toBe(0);
      expect(state.nextAttempt).toBeNull();
    });

    it('should initialize with custom options', () => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        successThreshold: 3,
        timeout: 30000,
        enabled: true
      });
      
      expect(circuitBreaker.failureThreshold).toBe(5);
      expect(circuitBreaker.successThreshold).toBe(3);
      expect(circuitBreaker.timeout).toBe(30000);
      expect(circuitBreaker.enabled).toBe(true);
    });

    it('should be disabled when enabled is false', () => {
      circuitBreaker = new CircuitBreaker({ enabled: false });
      expect(circuitBreaker.enabled).toBe(false);
    });
  });

  describe('canAttempt', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      });
    });

    it('should allow attempts when CLOSED', () => {
      expect(circuitBreaker.canAttempt()).toBe(true);
    });

    it('should block attempts when OPEN', () => {
      // Force circuit to OPEN
      circuitBreaker.state = 'OPEN';
      circuitBreaker.nextAttempt = Date.now() + 10000;
      
      expect(circuitBreaker.canAttempt()).toBe(false);
    });

    it('should allow attempts when HALF_OPEN', () => {
      circuitBreaker.state = 'HALF_OPEN';
      expect(circuitBreaker.canAttempt()).toBe(true);
    });

    it('should transition from OPEN to HALF_OPEN after timeout', async () => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        timeout: 50 // 50ms timeout for testing
      });
      
      // Force circuit to OPEN
      circuitBreaker.state = 'OPEN';
      circuitBreaker.nextAttempt = Date.now() + 50;
      
      expect(circuitBreaker.canAttempt()).toBe(false);
      
      // Wait for timeout
      await new Promise(resolve => setTimeout(resolve, 60));
      
      expect(circuitBreaker.canAttempt()).toBe(true);
      expect(circuitBreaker.state).toBe('HALF_OPEN');
    });

    it('should always allow attempts when disabled', () => {
      circuitBreaker = new CircuitBreaker({ enabled: false });
      circuitBreaker.state = 'OPEN';
      circuitBreaker.nextAttempt = Date.now() + 10000;
      
      expect(circuitBreaker.canAttempt()).toBe(true);
    });
  });

  describe('recordSuccess', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      });
    });

    it('should reset failure count on success', () => {
      circuitBreaker.failureCount = 2;
      circuitBreaker.recordSuccess();
      
      expect(circuitBreaker.failureCount).toBe(0);
    });

    it('should increment success count in HALF_OPEN state', () => {
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.recordSuccess();
      
      expect(circuitBreaker.successCount).toBe(1);
    });

    it('should transition from HALF_OPEN to CLOSED after enough successes', () => {
      circuitBreaker.state = 'HALF_OPEN';
      
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.state).toBe('HALF_OPEN');
      
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.successCount).toBe(0);
    });

    it('should do nothing when disabled', () => {
      circuitBreaker = new CircuitBreaker({ enabled: false });
      circuitBreaker.failureCount = 5;
      circuitBreaker.recordSuccess();
      
      // Should not reset failure count when disabled
      expect(circuitBreaker.failureCount).toBe(5);
    });
  });

  describe('recordFailure', () => {
    beforeEach(() => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        timeout: 1000
      });
    });

    it('should increment failure count', () => {
      circuitBreaker.recordFailure();
      expect(circuitBreaker.failureCount).toBe(1);
      
      circuitBreaker.recordFailure();
      expect(circuitBreaker.failureCount).toBe(2);
    });

    it('should transition to OPEN when threshold reached', () => {
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.state).toBe('CLOSED');
      
      circuitBreaker.recordFailure();
      expect(circuitBreaker.state).toBe('OPEN');
    });

    it('should set nextAttempt when transitioning to OPEN', () => {
      const beforeTime = Date.now();
      
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      
      const afterTime = Date.now();
      
      expect(circuitBreaker.nextAttempt).toBeGreaterThanOrEqual(beforeTime + 1000);
      expect(circuitBreaker.nextAttempt).toBeLessThanOrEqual(afterTime + 1000);
    });

    it('should transition from HALF_OPEN to OPEN on failure', () => {
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.state).toBe('OPEN');
    });

    it('should do nothing when disabled', () => {
      circuitBreaker = new CircuitBreaker({ enabled: false });
      circuitBreaker.recordFailure();
      
      expect(circuitBreaker.failureCount).toBe(0);
      expect(circuitBreaker.state).toBe('CLOSED');
    });
  });

  describe('getState', () => {
    it('should return current state information', () => {
      circuitBreaker = new CircuitBreaker();
      
      const state = circuitBreaker.getState();
      
      expect(state).toHaveProperty('state');
      expect(state).toHaveProperty('failureCount');
      expect(state).toHaveProperty('successCount');
      expect(state).toHaveProperty('nextAttempt');
    });

    it('should return nextAttempt as ISO string when OPEN', () => {
      circuitBreaker = new CircuitBreaker({ failureThreshold: 1 });
      circuitBreaker.recordFailure();
      
      const state = circuitBreaker.getState();
      
      expect(state.state).toBe('OPEN');
      expect(state.nextAttempt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('should return nextAttempt as null when not OPEN', () => {
      circuitBreaker = new CircuitBreaker();
      
      const state = circuitBreaker.getState();
      
      expect(state.nextAttempt).toBeNull();
    });
  });

  describe('reset', () => {
    it('should reset all state to initial values', () => {
      circuitBreaker = new CircuitBreaker({ failureThreshold: 3 });
      
      // Put circuit in OPEN state
      for (let i = 0; i < 3; i++) {
        circuitBreaker.recordFailure();
      }
      
      expect(circuitBreaker.state).toBe('OPEN');
      
      circuitBreaker.reset();
      
      expect(circuitBreaker.state).toBe('CLOSED');
      expect(circuitBreaker.failureCount).toBe(0);
      expect(circuitBreaker.successCount).toBe(0);
    });
  });

  describe('state transitions', () => {
    it('should follow correct state machine: CLOSED -> OPEN -> HALF_OPEN -> CLOSED', async () => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        successThreshold: 2,
        timeout: 50
      });

      // Start CLOSED
      expect(circuitBreaker.state).toBe('CLOSED');

      // Failures -> OPEN
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      expect(circuitBreaker.state).toBe('OPEN');

      // Wait for timeout -> HALF_OPEN
      await new Promise(resolve => setTimeout(resolve, 60));
      circuitBreaker.canAttempt();
      expect(circuitBreaker.state).toBe('HALF_OPEN');

      // Successes -> CLOSED
      circuitBreaker.recordSuccess();
      circuitBreaker.recordSuccess();
      expect(circuitBreaker.state).toBe('CLOSED');
    });

    it('should follow correct state machine: HALF_OPEN -> OPEN on failure', async () => {
      circuitBreaker = new CircuitBreaker({
        failureThreshold: 2,
        timeout: 50
      });

      // Get to HALF_OPEN
      circuitBreaker.recordFailure();
      circuitBreaker.recordFailure();
      await new Promise(resolve => setTimeout(resolve, 60));
      circuitBreaker.canAttempt();
      expect(circuitBreaker.state).toBe('HALF_OPEN');

      // Failure in HALF_OPEN -> OPEN
      circuitBreaker.recordFailure();
      expect(circuitBreaker.state).toBe('OPEN');
    });
  });
});
