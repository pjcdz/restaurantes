/**
 * Resilience Module Exports
 *
 * Provides circuit breakers, graceful degradation, and other resilience patterns
 * for the restaurant-hours-api service.
 *
 * @module resilience
 */

export {
  CircuitBreaker,
  CircuitOpenError,
  GeminiCircuitBreaker,
  ConvexCircuitBreaker,
  type CircuitBreakerConfig,
  type CircuitState,
  type CircuitStateChangeEvent,
  type CircuitFailureEvent,
  type CircuitResetEvent,
  type CircuitBreakerEventHandlers
} from "./circuit-breaker.js";

export {
  DegradationHandler,
  degradationHandler,
  type DegradationState,
  type FallbackResponses
} from "./graceful-degradation.js";
