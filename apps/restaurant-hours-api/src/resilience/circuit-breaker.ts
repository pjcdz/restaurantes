/**
 * Circuit Breaker Implementation for Resilience Patterns
 *
 * Implements the Circuit Breaker pattern to prevent cascading failures
 * when external services (Gemini API, Convex) are unavailable.
 *
 * @module resilience/circuit-breaker
 */

import { Logger } from "../utils/logger.js";

/**
 * Logger instance for circuit breaker events.
 */
const logger = new Logger({ service: "circuit-breaker" });

/**
 * Possible states of a circuit breaker.
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Requests are blocked, failing fast
 * - HALF_OPEN: Testing if service has recovered
 */
export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

/**
 * Configuration options for a CircuitBreaker instance.
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit.
   * @default 5
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before attempting to close the circuit.
   * @default 30000
   */
  resetTimeoutMs: number;

  /**
   * Maximum number of calls allowed in HALF_OPEN state before deciding.
   * @default 1
   */
  halfOpenMaxCalls: number;

  /**
   * Name of the circuit breaker for logging and identification.
   */
  name: string;
}

/**
 * Event data emitted when circuit state changes.
 */
export interface CircuitStateChangeEvent {
  /** Name of the circuit breaker */
  name: string;
  /** Previous state */
  previousState: CircuitState;
  /** New state */
  newState: CircuitState;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data emitted when a failure occurs.
 */
export interface CircuitFailureEvent {
  /** Name of the circuit breaker */
  name: string;
  /** The error that caused the failure */
  error: Error;
  /** Current failure count */
  failureCount: number;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event data emitted when the circuit is reset.
 */
export interface CircuitResetEvent {
  /** Name of the circuit breaker */
  name: string;
  /** Timestamp of the event */
  timestamp: number;
}

/**
 * Event handlers for circuit breaker events.
 */
export interface CircuitBreakerEventHandlers {
  /** Called when circuit state changes */
  onStateChange?: (event: CircuitStateChangeEvent) => void;
  /** Called when a failure occurs */
  onFailure?: (event: CircuitFailureEvent) => void;
  /** Called when the circuit is reset */
  onReset?: (event: CircuitResetEvent) => void;
}

/**
 * Default configuration values for circuit breakers.
 */
const DEFAULT_CONFIG: Omit<CircuitBreakerConfig, "name"> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000,
  halfOpenMaxCalls: 1
};

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function parsePositiveInteger(raw: string | undefined): number | undefined {
  if (!raw) {
    return undefined;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return parsed;
}

/**
 * Circuit Breaker pattern implementation.
 *
 * The circuit breaker protects external service calls by:
 * 1. Allowing requests when in CLOSED state (normal operation)
 * 2. Failing fast when in OPEN state (service unavailable)
 * 3. Testing recovery when in HALF_OPEN state (limited requests)
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({
 *   name: "gemini-api",
 *   failureThreshold: 5,
 *   resetTimeoutMs: 30000
 * });
 *
 * try {
 *   const result = await breaker.execute(() => geminiApi.generateText(prompt));
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     // Handle circuit open state
 *   }
 * }
 * ```
 */
export class CircuitBreaker {
  private state: CircuitState = "CLOSED";
  private failureCount = 0;
  private lastFailureTime = 0;
  private halfOpenCalls = 0;
  private readonly config: CircuitBreakerConfig;

  /**
   * Creates a new CircuitBreaker instance.
   * @param config - Configuration options
   * @param eventHandlers - Optional event handlers for monitoring
   */
  constructor(
    config: Partial<CircuitBreakerConfig> & { name: string },
    private readonly eventHandlers: CircuitBreakerEventHandlers = {}
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Gets the current state of the circuit breaker.
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Gets the current failure count.
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Gets the name of this circuit breaker.
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Executes a function through the circuit breaker.
   *
   * @param fn - The async function to execute
   * @returns The result of the function
   * @throws CircuitOpenError if the circuit is open
   * @throws The original error if the function fails
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === "OPEN") {
      if (this.shouldAttemptReset()) {
        this.transitionTo("HALF_OPEN");
      } else {
        throw new CircuitOpenError(
          `Circuit breaker '${this.config.name}' is open`
        );
      }
    }

    if (this.state === "HALF_OPEN") {
      if (this.halfOpenCalls >= this.config.halfOpenMaxCalls) {
        throw new CircuitOpenError(
          `Circuit breaker '${this.config.name}' is half-open and at max calls`
        );
      }
      this.halfOpenCalls++;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      const normalizedError = toError(error);
      this.onFailure(normalizedError);
      throw normalizedError;
    }
  }

  /**
   * Manually resets the circuit breaker to CLOSED state.
   */
  reset(): void {
    const previousState = this.state;
    this.state = "CLOSED";
    this.failureCount = 0;
    this.lastFailureTime = 0;
    this.halfOpenCalls = 0;

    if (previousState !== "CLOSED") {
      this.eventHandlers.onReset?.({
        name: this.config.name,
        timestamp: Date.now()
      });
    }
  }

  /**
   * Forces the circuit breaker to OPEN state.
   * Useful for manual intervention or health check failures.
   */
  forceOpen(): void {
    this.transitionTo("OPEN");
    this.lastFailureTime = Date.now();
  }

  /**
   * Checks if enough time has passed to attempt a reset.
   */
  private shouldAttemptReset(): boolean {
    return Date.now() - this.lastFailureTime >= this.config.resetTimeoutMs;
  }

  /**
   * Handles successful execution.
   */
  private onSuccess(): void {
    if (this.state === "HALF_OPEN") {
      this.transitionTo("CLOSED");
    }
    this.failureCount = 0;
    this.halfOpenCalls = 0;
  }

  /**
   * Handles failed execution.
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    this.eventHandlers.onFailure?.({
      name: this.config.name,
      error,
      failureCount: this.failureCount,
      timestamp: this.lastFailureTime
    });

    if (this.state === "HALF_OPEN") {
      this.transitionTo("OPEN");
    } else if (this.failureCount >= this.config.failureThreshold) {
      this.transitionTo("OPEN");
    }
  }

  /**
   * Transitions to a new state and emits events.
   */
  private transitionTo(newState: CircuitState): void {
    const previousState = this.state;
    this.state = newState;

    if (newState === "HALF_OPEN") {
      this.halfOpenCalls = 0;
    }

    this.eventHandlers.onStateChange?.({
      name: this.config.name,
      previousState,
      newState,
      timestamp: Date.now()
    });
  }
}

/**
 * Error thrown when the circuit breaker is open.
 */
export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

/**
 * Gets circuit breaker configuration from environment variables.
 */
function getCircuitBreakerConfigFromEnv(
  prefix: string
): Partial<CircuitBreakerConfig> {
  return {
    failureThreshold: parsePositiveInteger(
      process.env[`${prefix}_FAILURE_THRESHOLD`]
    ),
    resetTimeoutMs: parsePositiveInteger(
      process.env[`${prefix}_RESET_TIMEOUT_MS`]
    )
  };
}

/**
 * Gemini API Circuit Breaker singleton.
 *
 * Configured for Gemini API calls with appropriate timeouts.
 * Configuration can be overridden via environment variables:
 * - GEMINI_CIRCUIT_FAILURE_THRESHOLD
 * - GEMINI_CIRCUIT_RESET_TIMEOUT_MS
 */
export const GeminiCircuitBreaker = new CircuitBreaker(
  {
    name: "gemini-api",
    failureThreshold:
      parsePositiveInteger(process.env.GEMINI_CIRCUIT_FAILURE_THRESHOLD) ?? 5,
    resetTimeoutMs:
      parsePositiveInteger(process.env.GEMINI_CIRCUIT_RESET_TIMEOUT_MS) ??
      30000,
    ...getCircuitBreakerConfigFromEnv("GEMINI_CIRCUIT")
  },
  {
    onStateChange: (event) => {
      logger.info("Circuit breaker state changed", undefined, {
        name: event.name,
        previousState: event.previousState,
        newState: event.newState
      });
    },
    onFailure: (event) => {
      logger.error("Circuit breaker failure", undefined, undefined, {
        name: event.name,
        failureCount: event.failureCount,
        error: { name: event.error.name, message: event.error.message }
      });
    },
    onReset: (event) => {
      logger.info("Circuit breaker has been reset", undefined, {
        name: event.name
      });
    }
  }
);

/**
 * Convex API Circuit Breaker singleton.
 *
 * Configured for Convex database operations with appropriate timeouts.
 * Configuration can be overridden via environment variables:
 * - CONVEX_CIRCUIT_FAILURE_THRESHOLD
 * - CONVEX_CIRCUIT_RESET_TIMEOUT_MS
 */
export const ConvexCircuitBreaker = new CircuitBreaker(
  {
    name: "convex-api",
    failureThreshold:
      parsePositiveInteger(process.env.CONVEX_CIRCUIT_FAILURE_THRESHOLD) ?? 3,
    resetTimeoutMs:
      parsePositiveInteger(process.env.CONVEX_CIRCUIT_RESET_TIMEOUT_MS) ??
      15000,
    halfOpenMaxCalls: 1,
    ...getCircuitBreakerConfigFromEnv("CONVEX_CIRCUIT")
  },
  {
    onStateChange: (event) => {
      logger.info("Circuit breaker state changed", undefined, {
        name: event.name,
        previousState: event.previousState,
        newState: event.newState
      });
    },
    onFailure: (event) => {
      logger.error("Circuit breaker failure", undefined, undefined, {
        name: event.name,
        failureCount: event.failureCount,
        error: { name: event.error.name, message: event.error.message }
      });
    },
    onReset: (event) => {
      logger.info("Circuit breaker has been reset", undefined, {
        name: event.name
      });
    }
  }
);
