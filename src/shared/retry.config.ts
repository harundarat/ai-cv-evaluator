/**
 * Retry Configuration for LLM API Calls
 *
 * This file defines retry parameters for different types of LLM operations.
 * Exponential backoff is used to gradually increase delay between retries.
 */

export interface RetryConfig {
  /**
   * Maximum number of retry attempts (excluding the initial attempt)
   * Example: maxRetries = 3 means 1 initial + 3 retries = 4 total attempts
   */
  maxRetries: number;

  /**
   * Initial delay in milliseconds before the first retry
   * Subsequent delays will be calculated using exponential backoff
   */
  initialDelayMs: number;

  /**
   * Maximum delay in milliseconds between retries
   * Prevents exponential backoff from creating unreasonably long delays
   */
  maxDelayMs: number;

  /**
   * Multiplier for exponential backoff calculation
   * delay = initialDelay * (backoffMultiplier ^ attemptNumber)
   * Example: 2 means delays will be 1s, 2s, 4s, 8s...
   */
  backoffMultiplier: number;

  /**
   * Timeout in milliseconds for the operation
   * If operation takes longer than this, it will be cancelled
   */
  timeoutMs: number;

  /**
   * Whether to add jitter (random variation) to retry delays
   * Helps prevent thundering herd problem when many requests retry simultaneously
   */
  enableJitter: boolean;
}

/**
 * Configuration for PDF-based LLM calls (CV and Project evaluation)
 *
 * PDF processing is slower and more prone to timeouts, so we use:
 * - More retries (4 instead of 3)
 * - Longer initial delay (1000ms instead of 500ms)
 * - Higher timeout (90s instead of 60s)
 *
 * Use cases:
 * - callGeminiFlashLiteWithPDF() for CV evaluation
 * - callGeminiFlashLiteWithPDF() for Project evaluation
 */
export const PDF_RETRY_CONFIG: RetryConfig = {
  maxRetries: 4,
  initialDelayMs: 1000, // 1 second
  maxDelayMs: 30000, // 30 seconds
  backoffMultiplier: 2, // Double the delay each time
  timeoutMs: 90000, // 90 seconds (PDF processing is slower)
  enableJitter: true,
};

/**
 * Configuration for text-based LLM calls (Final synthesis)
 *
 * Text processing is faster and more reliable, so we use:
 * - Fewer retries (3)
 * - Shorter initial delay (500ms)
 * - Lower timeout (60s)
 *
 * Use cases:
 * - callGeminiFlash() for final synthesis
 * - Other text-only LLM operations
 */
export const TEXT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  initialDelayMs: 500, // 500 milliseconds
  maxDelayMs: 20000, // 20 seconds
  backoffMultiplier: 2, // Double the delay each time
  timeoutMs: 60000, // 60 seconds
  enableJitter: true,
};

/**
 * Default retry configuration
 * Used when no specific configuration is provided
 * Based on text config as a reasonable middle ground
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = TEXT_RETRY_CONFIG;

/**
 * HTTP status codes that should trigger a retry
 * These are typically transient errors that may succeed on retry
 */
export const RETRYABLE_HTTP_STATUS_CODES = [
  429, // Too Many Requests (Rate Limit)
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
];

/**
 * HTTP status codes that should NOT trigger a retry
 * These are permanent errors that will not be fixed by retrying
 */
export const NON_RETRYABLE_HTTP_STATUS_CODES = [
  400, // Bad Request
  401, // Unauthorized
  403, // Forbidden
  404, // Not Found
  405, // Method Not Allowed
  422, // Unprocessable Entity
];

/**
 * Error message patterns that indicate a retry-able error
 * These are typically network or temporary service issues
 */
export const RETRYABLE_ERROR_PATTERNS = [
  'timeout',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'Rate limit',
  'rate limit',
  'Service Unavailable',
  'service unavailable',
  'Gateway Timeout',
  'gateway timeout',
  'Too Many Requests',
  'too many requests',
  'Network Error',
  'network error',
];

/**
 * Error message patterns that indicate a permanent error
 * These will not be fixed by retrying and should fail immediately
 */
export const NON_RETRYABLE_ERROR_PATTERNS = [
  'Invalid API key',
  'invalid api key',
  'Authentication failed',
  'authentication failed',
  'Unauthorized',
  'unauthorized',
  'Forbidden',
  'forbidden',
  'Not Found',
  'not found',
  'Bad Request',
  'bad request',
  'Invalid request',
  'invalid request',
  'Malformed',
  'malformed',
];
