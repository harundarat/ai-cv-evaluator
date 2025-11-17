/**
 * Retry Decorator with Exponential Backoff
 *
 * This decorator automatically retries failed method calls with exponential backoff.
 * It's designed for use with LLM API calls that may fail due to:
 * - Network timeouts
 * - Rate limiting
 * - Temporary service unavailability
 *
 * Usage:
 * ```typescript
 * @Retry(PDF_RETRY_CONFIG)
 * async callGeminiFlashLiteWithPDF() {
 *   // API call that may fail
 * }
 * ```
 */

import { Logger } from '@nestjs/common';
import {
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
} from './retry.config';
import {
  isRetryableError,
  calculateBackoffDelay,
  sleep,
  formatDuration,
  createErrorContext,
  getErrorMessage,
} from './retry.utils';

/**
 * Retry decorator that adds automatic retry logic with exponential backoff
 *
 * @param config - Retry configuration (maxRetries, delays, etc.)
 * @returns Method decorator that wraps the original method with retry logic
 *
 * @example
 * ```typescript
 * @Retry(PDF_RETRY_CONFIG)
 * async processLargeDocument(doc: Document) {
 *   return await this.llmService.analyze(doc);
 * }
 * ```
 */
export function Retry(config: RetryConfig = DEFAULT_RETRY_CONFIG) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const logger = new Logger(`${target.constructor.name}.${propertyKey}`);

    descriptor.value = async function (...args: any[]) {
      let lastError: any;

      // Attempt loop: initial attempt + retries
      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
          // Log attempt (skip logging for first attempt to reduce noise)
          if (attempt > 0) {
            logger.log(
              `Retry attempt ${attempt}/${config.maxRetries} for ${propertyKey}`,
            );
          }

          // Execute the original method
          const result = await originalMethod.apply(this, args);

          // Success! Log if this was a retry (means we recovered from error)
          if (attempt > 0) {
            logger.log(
              `${propertyKey} succeeded after ${attempt} retry attempt(s)`,
            );
          }

          return result;
        } catch (error) {
          lastError = error;

          // Create error context for logging
          const errorContext = createErrorContext(
            error,
            attempt,
            config.maxRetries,
          );

          // Check if this is the last attempt
          const isLastAttempt = attempt === config.maxRetries;

          // Check if error is retryable
          const shouldRetry = isRetryableError(error);

          // Decide whether to retry or throw
          if (isLastAttempt || !shouldRetry) {
            // Log final failure
            if (isLastAttempt && shouldRetry) {
              logger.error(
                `${propertyKey} failed after ${config.maxRetries + 1} attempts (max retries exhausted)`,
                {
                  error: getErrorMessage(error),
                  statusCode: errorContext.statusCode,
                  errorCode: errorContext.errorCode,
                },
              );
            } else if (!shouldRetry) {
              logger.error(
                `${propertyKey} failed with non-retryable error (attempt ${attempt + 1}/${config.maxRetries + 1})`,
                {
                  error: getErrorMessage(error),
                  statusCode: errorContext.statusCode,
                  errorCode: errorContext.errorCode,
                  reason: 'Error is permanent and will not be fixed by retrying',
                },
              );
            }

            // Throw the error (will be caught by caller)
            throw error;
          }

          // Calculate delay before next retry
          const delayMs = calculateBackoffDelay(attempt, config);

          // Log retry information
          logger.warn(
            `${propertyKey} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying after ${formatDuration(delayMs)}...`,
            {
              error: getErrorMessage(error),
              statusCode: errorContext.statusCode,
              errorCode: errorContext.errorCode,
              nextRetryIn: formatDuration(delayMs),
              retriesRemaining: config.maxRetries - attempt,
            },
          );

          // Wait before retrying
          await sleep(delayMs);
        }
      }

      // This should never be reached due to the throw above,
      // but TypeScript requires a return statement
      throw lastError;
    };

    return descriptor;
  };
}

/**
 * Retry decorator with timeout support
 *
 * Wraps the method with both retry logic AND timeout logic.
 * If the method takes longer than the specified timeout, it will be cancelled
 * and potentially retried (if the timeout error is retryable).
 *
 * @param config - Retry configuration including timeout
 * @returns Method decorator with retry + timeout logic
 *
 * @example
 * ```typescript
 * @RetryWithTimeout(PDF_RETRY_CONFIG) // timeoutMs from config
 * async processDocument(doc: Document) {
 *   // This will timeout after 90 seconds (from PDF_RETRY_CONFIG)
 *   return await this.llmService.analyze(doc);
 * }
 * ```
 */
export function RetryWithTimeout(config: RetryConfig = DEFAULT_RETRY_CONFIG) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;
    const logger = new Logger(`${target.constructor.name}.${propertyKey}`);

    descriptor.value = async function (...args: any[]) {
      let lastError: any;

      // Attempt loop: initial attempt + retries
      for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
        try {
          // Log attempt (skip logging for first attempt)
          if (attempt > 0) {
            logger.log(
              `Retry attempt ${attempt}/${config.maxRetries} for ${propertyKey}`,
            );
          }

          // Create timeout promise
          const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
              reject(
                new Error(
                  `Operation timed out after ${formatDuration(config.timeoutMs)}`,
                ),
              );
            }, config.timeoutMs);
          });

          // Race between method execution and timeout
          const result = await Promise.race([
            originalMethod.apply(this, args),
            timeoutPromise,
          ]);

          // Success!
          if (attempt > 0) {
            logger.log(
              `${propertyKey} succeeded after ${attempt} retry attempt(s)`,
            );
          }

          return result;
        } catch (error) {
          lastError = error;

          // Create error context
          const errorContext = createErrorContext(
            error,
            attempt,
            config.maxRetries,
          );

          const isLastAttempt = attempt === config.maxRetries;
          const shouldRetry = isRetryableError(error);

          // Decide whether to retry or throw
          if (isLastAttempt || !shouldRetry) {
            if (isLastAttempt && shouldRetry) {
              logger.error(
                `${propertyKey} failed after ${config.maxRetries + 1} attempts (max retries exhausted)`,
                {
                  error: getErrorMessage(error),
                  timeout: formatDuration(config.timeoutMs),
                },
              );
            } else if (!shouldRetry) {
              logger.error(
                `${propertyKey} failed with non-retryable error`,
                {
                  error: getErrorMessage(error),
                  statusCode: errorContext.statusCode,
                },
              );
            }

            throw error;
          }

          // Calculate delay and retry
          const delayMs = calculateBackoffDelay(attempt, config);

          logger.warn(
            `${propertyKey} failed (attempt ${attempt + 1}/${config.maxRetries + 1}), retrying after ${formatDuration(delayMs)}...`,
            {
              error: getErrorMessage(error),
              timeout: formatDuration(config.timeoutMs),
              nextRetryIn: formatDuration(delayMs),
              retriesRemaining: config.maxRetries - attempt,
            },
          );

          await sleep(delayMs);
        }
      }

      throw lastError;
    };

    return descriptor;
  };
}
