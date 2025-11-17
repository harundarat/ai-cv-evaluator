/**
 * Retry Utility Functions
 *
 * Helper functions for implementing retry logic with exponential backoff.
 * These utilities are used by the @Retry decorator to determine:
 * - Whether an error should trigger a retry
 * - How long to wait before the next retry attempt
 */

import {
  RETRYABLE_HTTP_STATUS_CODES,
  NON_RETRYABLE_HTTP_STATUS_CODES,
  RETRYABLE_ERROR_PATTERNS,
  NON_RETRYABLE_ERROR_PATTERNS,
  RetryConfig,
} from './retry.config';

/**
 * Determines if an error should trigger a retry attempt
 *
 * Retry-able errors include:
 * - Network timeouts (ETIMEDOUT, EHOSTUNREACH, etc.)
 * - Rate limiting (HTTP 429)
 * - Temporary service unavailability (HTTP 503, 504)
 * - Connection errors (ECONNREFUSED, ECONNRESET)
 *
 * Non-retry-able errors include:
 * - Authentication failures (HTTP 401, 403)
 * - Bad requests (HTTP 400, 404)
 * - Invalid API keys
 * - Malformed requests
 *
 * @param error - The error object to evaluate
 * @returns true if the error is transient and retry should be attempted
 */
export function isRetryableError(error: any): boolean {
  // Check if error is null/undefined (should not retry)
  if (!error) {
    return false;
  }

  // 1. Check HTTP status codes if available
  if (error.status || error.statusCode || error.response?.status) {
    const statusCode =
      error.status || error.statusCode || error.response?.status;

    // Explicitly non-retryable status codes
    if (NON_RETRYABLE_HTTP_STATUS_CODES.includes(statusCode)) {
      return false;
    }

    // Explicitly retryable status codes
    if (RETRYABLE_HTTP_STATUS_CODES.includes(statusCode)) {
      return true;
    }
  }

  // 2. Check error message for non-retryable patterns (priority)
  const errorMessage = error.message || error.toString() || '';
  const errorMessageLower = errorMessage.toLowerCase();

  for (const pattern of NON_RETRYABLE_ERROR_PATTERNS) {
    if (errorMessageLower.includes(pattern.toLowerCase())) {
      return false; // Permanent error, don't retry
    }
  }

  // 3. Check error message for retryable patterns
  for (const pattern of RETRYABLE_ERROR_PATTERNS) {
    if (errorMessageLower.includes(pattern.toLowerCase())) {
      return true; // Transient error, can retry
    }
  }

  // 4. Check error code (Node.js network errors)
  if (error.code) {
    const retryableErrorCodes = [
      'ETIMEDOUT',
      'EHOSTUNREACH',
      'ECONNREFUSED',
      'ECONNRESET',
      'EPIPE',
      'ENOTFOUND',
      'EAI_AGAIN',
    ];

    if (retryableErrorCodes.includes(error.code)) {
      return true;
    }
  }

  // 5. Default behavior
  // If we can't determine the error type, err on the side of caution
  // and don't retry (to avoid infinite retry loops on unexpected errors)
  return false;
}

/**
 * Calculates the delay before the next retry attempt using exponential backoff
 *
 * Formula: delay = min(initialDelay * (multiplier ^ attemptNumber), maxDelay)
 * With optional jitter: delay = delay * (0.5 + random(0, 0.5))
 *
 * Example with initialDelay=1000ms, multiplier=2:
 * - Attempt 1: 1000ms * 2^0 = 1000ms (1 second)
 * - Attempt 2: 1000ms * 2^1 = 2000ms (2 seconds)
 * - Attempt 3: 1000ms * 2^2 = 4000ms (4 seconds)
 * - Attempt 4: 1000ms * 2^3 = 8000ms (8 seconds)
 *
 * Jitter prevents thundering herd problem by adding randomness:
 * - Without jitter: All requests retry at exactly 1s, 2s, 4s, etc.
 * - With jitter: Requests retry at ~0.5-1.5s, ~1-3s, ~2-6s, etc.
 *
 * @param attemptNumber - The current retry attempt (0-indexed, 0 = first retry)
 * @param config - Retry configuration with delay and multiplier settings
 * @returns Delay in milliseconds before the next retry
 */
export function calculateBackoffDelay(
  attemptNumber: number,
  config: RetryConfig,
): number {
  // Calculate base delay using exponential backoff
  const exponentialDelay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber);

  // Cap the delay at maxDelayMs to prevent unreasonably long waits
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter if enabled
  if (config.enableJitter) {
    // Jitter factor between 0.5 and 1.5 (±50% randomness)
    // This spreads out retry attempts to avoid synchronized retries
    const jitterFactor = 0.5 + Math.random();
    return Math.floor(cappedDelay * jitterFactor);
  }

  return cappedDelay;
}

/**
 * Sleeps for the specified duration (async delay)
 *
 * Usage:
 * ```typescript
 * await sleep(1000); // Wait for 1 second
 * console.log('Continuing after 1 second delay');
 * ```
 *
 * @param ms - Duration to sleep in milliseconds
 * @returns Promise that resolves after the specified delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats a duration in milliseconds to a human-readable string
 *
 * Examples:
 * - formatDuration(500) => "500ms"
 * - formatDuration(1500) => "1.5s"
 * - formatDuration(65000) => "1m 5s"
 *
 * @param ms - Duration in milliseconds
 * @returns Human-readable duration string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);

  if (minutes > 0) {
    const remainingSeconds = seconds % 60;
    return remainingSeconds > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${minutes}m`;
  }

  const remainingMs = ms % 1000;
  return remainingMs > 0 ? `${seconds}.${Math.floor(remainingMs / 100)}s` : `${seconds}s`;
}

/**
 * Extracts a concise error message from an error object
 *
 * Tries to get the most useful error information in this priority:
 * 1. error.response?.data?.message (API error messages)
 * 2. error.message (standard Error objects)
 * 3. error.toString() (fallback)
 *
 * @param error - The error object
 * @returns Concise error message string
 */
export function getErrorMessage(error: any): string {
  if (error.response?.data?.message) {
    return error.response.data.message;
  }

  if (error.message) {
    return error.message;
  }

  return error.toString();
}

/**
 * Creates a detailed error context for logging
 *
 * @param error - The error object
 * @param attemptNumber - Current retry attempt number
 * @param maxRetries - Maximum number of retries
 * @returns Object with error details for logging
 */
export function createErrorContext(
  error: any,
  attemptNumber: number,
  maxRetries: number,
) {
  return {
    message: getErrorMessage(error),
    statusCode: error.status || error.statusCode || error.response?.status,
    errorCode: error.code,
    attemptNumber: attemptNumber + 1, // Convert to 1-indexed for display
    maxAttempts: maxRetries + 1, // Total attempts including initial
    isRetryable: isRetryableError(error),
  };
}
