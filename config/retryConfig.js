/**
 * Retry configuration for Jira API calls
 * Adjust these values based on your network conditions and Jira instance performance
 */

export const retryConfig = {
  // Maximum number of retry attempts for API calls
  maxRetries: 3,
  
  // Initial delay before first retry (in milliseconds)
  initialRetryDelay: 1000, // 1 second
  
  // Maximum delay between retries (in milliseconds)
  maxRetryDelay: 10000, // 10 seconds
  
  // Request timeout (in milliseconds)
  requestTimeout: 30000, // 30 seconds
  
  // Token refresh timeout (in milliseconds)
  tokenRefreshTimeout: 15000, // 15 seconds
  
  // HTTP status codes that should trigger a retry
  retryableStatusCodes: [
    408, // Request Timeout
    429, // Too Many Requests (Rate Limit)
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504  // Gateway Timeout
  ],
  
  // Exponential backoff multiplier
  backoffMultiplier: 2,
  
  // Add jitter to prevent thundering herd
  useJitter: true,
  
  // Maximum jitter (in milliseconds)
  maxJitter: 1000 // 1 second
};

/**
 * Calculate retry delay with exponential backoff and optional jitter
 */
export function calculateRetryDelay(attempt, config = retryConfig) {
  const baseDelay = config.initialRetryDelay * Math.pow(config.backoffMultiplier, attempt);
  const cappedDelay = Math.min(baseDelay, config.maxRetryDelay);
  
  if (config.useJitter) {
    const jitter = Math.random() * config.maxJitter;
    // Ensure total delay doesn't exceed maxRetryDelay + maxJitter
    const totalDelay = cappedDelay + jitter;
    return Math.min(totalDelay, config.maxRetryDelay + config.maxJitter);
  }
  
  return cappedDelay;
}

export default retryConfig;
