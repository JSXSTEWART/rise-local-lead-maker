/**
 * Retry utility with exponential backoff and circuit breaker pattern
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

const defaultRetryOptions: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryCondition: () => true,
  onRetry: () => {},
};

/**
 * Execute an async function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...defaultRetryOptions, ...options };
  let lastError: unknown;
  let delay = opts.initialDelayMs;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === opts.maxRetries || !opts.retryCondition(error)) {
        throw error;
      }

      opts.onRetry(attempt + 1, error);

      // Wait before retry with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable (network errors, 5xx, rate limits)
 */
export function isRetryableError(error: unknown): boolean {
  if (!error) return false;

  // Network errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('econnrefused') ||
      message.includes('socket hang up')
    ) {
      return true;
    }
  }

  // HTTP errors
  const status = (error as { status?: number; statusCode?: number }).status ||
                 (error as { status?: number; statusCode?: number }).statusCode;
  if (status) {
    // Retry on 429 (rate limit), 502, 503, 504
    return status === 429 || status >= 500;
  }

  return false;
}

/**
 * Circuit Breaker implementation
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  successThreshold?: number;
  timeout?: number;
  resetTimeout?: number;
}

type CircuitState = 'closed' | 'open' | 'half-open';

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(private readonly name: string, options: CircuitBreakerOptions = {}) {
    this.options = {
      failureThreshold: options.failureThreshold ?? 5,
      successThreshold: options.successThreshold ?? 2,
      timeout: options.timeout ?? 30000,
      resetTimeout: options.resetTimeout ?? 60000,
    };
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.options.resetTimeout) {
        this.state = 'half-open';
        this.successes = 0;
        console.log(`[CircuitBreaker:${this.name}] Transitioning to half-open`);
      } else {
        throw new CircuitBreakerError(`Circuit breaker ${this.name} is open`);
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Circuit breaker timeout')), this.options.timeout)
        ),
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;

    if (this.state === 'half-open') {
      this.successes++;
      if (this.successes >= this.options.successThreshold) {
        this.state = 'closed';
        console.log(`[CircuitBreaker:${this.name}] Circuit closed`);
      }
    }
  }

  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      console.log(`[CircuitBreaker:${this.name}] Circuit opened (half-open failure)`);
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
      console.log(`[CircuitBreaker:${this.name}] Circuit opened (threshold reached)`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
  }
}

export class CircuitBreakerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerError';
  }
}

// Pre-configured circuit breakers for external services
export const circuitBreakers = {
  googlePlaces: new CircuitBreaker('GooglePlaces', { failureThreshold: 3, resetTimeout: 120000 }),
  anthropic: new CircuitBreaker('Anthropic', { failureThreshold: 5, resetTimeout: 60000 }),
  gemini: new CircuitBreaker('Gemini', { failureThreshold: 5, resetTimeout: 60000 }),
  clay: new CircuitBreaker('Clay', { failureThreshold: 3, resetTimeout: 60000 }),
};

/**
 * Wrap a function with both retry and circuit breaker
 */
export async function withResiliency<T>(
  circuitBreaker: CircuitBreaker,
  fn: () => Promise<T>,
  retryOptions?: RetryOptions
): Promise<T> {
  return circuitBreaker.execute(() =>
    withRetry(fn, {
      ...retryOptions,
      retryCondition: isRetryableError,
    })
  );
}
