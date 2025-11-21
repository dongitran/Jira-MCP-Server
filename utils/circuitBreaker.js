/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by temporarily blocking requests when service is down
 */

class CircuitBreaker {
  constructor(options = {}) {
    // Since we now record failure on each retry attempt, we need higher threshold
    // With 3 retries per request, 5 failed requests = 15 failures
    // So we set threshold to 10 to open after ~3-4 failed requests
    this.failureThreshold = options.failureThreshold || 10; // Number of failures before opening
    this.successThreshold = options.successThreshold || 2; // Number of successes to close
    this.timeout = options.timeout || 60000; // Time to wait before trying again (60s)
    
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    this.enabled = options.enabled !== false; // Can be disabled via config
  }

  /**
   * Check if circuit breaker allows the request
   */
  canAttempt() {
    if (!this.enabled) {
      return true;
    }

    if (this.state === 'CLOSED') {
      return true;
    }

    if (this.state === 'OPEN') {
      if (Date.now() >= this.nextAttempt) {
        this.state = 'HALF_OPEN';
        this.successCount = 0;
        // Only log state changes, not every check
        console.error('🔄 Circuit breaker: HALF_OPEN - Testing recovery');
        return true;
      }
      return false;
    }

    // HALF_OPEN state
    return true;
  }

  /**
   * Record a successful request
   */
  recordSuccess() {
    if (!this.enabled) {
      return;
    }

    // Reset failure count on any success
    this.failureCount = 0;

    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= this.successThreshold) {
        this.state = 'CLOSED';
        this.successCount = 0; // Reset success count
        console.error('✅ Circuit breaker: CLOSED - Recovered');
      }
    } else if (this.state === 'CLOSED') {
      // Already closed, just ensure counts are reset
      this.successCount = 0;
    }
  }

  /**
   * Record a failed request
   */
  recordFailure() {
    if (!this.enabled) {
      return;
    }

    this.failureCount++;

    if (this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.error(`⚠️  Circuit breaker: OPEN - Still down, waiting ${Math.round(this.timeout/1000)}s`);
      return;
    }

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.timeout;
      console.error(`🚨 Circuit breaker: OPEN - ${this.failureCount} failures, blocking ${Math.round(this.timeout/1000)}s`);
    }
  }

  /**
   * Get current state
   */
  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: this.state === 'OPEN' ? new Date(this.nextAttempt).toISOString() : null
    };
  }

  /**
   * Reset circuit breaker
   */
  reset() {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    console.error('🔄 Circuit breaker: RESET');
  }
}

export default CircuitBreaker;
