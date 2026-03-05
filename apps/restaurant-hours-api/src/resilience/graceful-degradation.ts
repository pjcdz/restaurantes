/**
 * Graceful Degradation Handler for Resilience Patterns
 *
 * Provides fallback responses and degraded operation modes when
 * external services (Gemini API, Convex) are unavailable.
 *
 * @module resilience/graceful-degradation
 */

import { loggers } from "../utils/logger.js";
import { CircuitOpenError, type CircuitBreaker } from "./circuit-breaker.js";

/**
 * Type alias for conversation intents.
 */
type ConversationIntent = "complaint" | "faq" | "greeting" | "order";

/**
 * Represents the current degradation state of the system.
 */
export interface DegradationState {
  /**
   * Whether Gemini API is currently degraded.
   */
  geminiDegraded: boolean;

  /**
   * Whether Convex database is currently degraded.
   */
  convexDegraded: boolean;

  /**
   * Timestamp of the last state change.
   */
  lastUpdated: number;

  /**
   * Reason for current degradation state.
   */
  reason?: string;
}

/**
 * Fallback response templates for different scenarios.
 */
export interface FallbackResponses {
  /**
   * Response when Gemini API is unavailable for FAQ queries.
   */
  faqUnavailable: string;

  /**
   * Response when Gemini API is unavailable for order processing.
   */
  orderUnavailable: string;

  /**
   * Response when Convex database is unavailable.
   */
  databaseUnavailable: string;

  /**
   * Response when both services are unavailable.
   */
  allServicesUnavailable: string;

  /**
   * Response when order cannot be processed.
   */
  orderProcessingError: string;

  /**
   * Response for greeting when degraded.
   */
  degradedGreeting: string;
}

/**
 * Default fallback responses in Spanish for the restaurant context.
 */
const DEFAULT_FALLBACK_RESPONSES: FallbackResponses = {
  faqUnavailable:
    "Lo siento, estoy experimentando dificultades técnicas para procesar tu consulta en este momento. Por favor, intenta nuevamente en unos minutos o contacta al restaurante directamente.",

  orderUnavailable:
    "Disculpa, no puedo procesar pedidos en este momento debido a problemas técnicos. Por favor, llama al restaurante para realizar tu pedido.",

  databaseUnavailable:
    "Lo siento, no puedo acceder a la información del menú en este momento. Por favor, intenta más tarde o contacta al restaurante directamente.",

  allServicesUnavailable:
    "Estamos experimentando problemas técnicos. Por favor, contacta al restaurante directamente para asistencia. Disculpa las molestias.",

  orderProcessingError:
    "Hubo un error al procesar tu pedido. Por favor, verifica los detalles e intenta nuevamente.",

  degradedGreeting:
    "¡Hola! Bienvenido a RestauLang. Estamos experimentando algunos problemas técnicos, pero puedo ayudarte de forma limitada."
};

/**
 * FAQ-based fallback responses for common queries.
 * Used when Gemini API is unavailable but we can still match keywords.
 */
const FAQ_FALLBACKS: Record<string, string> = {
  horario:
    "Nuestro horario de atención es de 9:00 a 23:00 horas, de lunes a domingo.",
  horarios:
    "Nuestro horario de atención es de 9:00 a 23:00 horas, de lunes a domingo.",
  abierto:
    "Estamos abiertos de 9:00 a 23:00 horas todos los días de la semana.",
  delivery:
    "Realizamos entregas a domicilio. El costo varía según tu ubicación.",
  envio:
    "Realizamos entregas a domicilio. El costo varía según tu ubicación.",
  pago:
    "Aceptamos pagos en efectivo y por transferencia bancaria al momento de la entrega.",
  efectivo:
    "Sí, aceptamos pagos en efectivo al momento de la entrega o recogida.",
  ubicacion:
    "Estamos ubicados en la zona centro de la ciudad. Puedes recoger tu pedido en nuestro local.",
  direccion:
    "Estamos ubicados en la zona centro de la ciudad. Puedes recoger tu pedido en nuestro local.",
  contacto:
    "Puedes contactarnos por este medio o llamando a nuestro número de teléfono.",
  telefono:
    "Puedes contactarnos por este medio o llamando a nuestro número de teléfono."
};

/**
 * Handler for graceful degradation when services are unavailable.
 *
 * Provides fallback responses and tracks degradation state for monitoring.
 *
 * @example
 * ```typescript
 * const handler = new DegradationHandler();
 *
 * // Check if should use fallback
 * if (handler.shouldUseFallback('gemini')) {
 *   return handler.getFallbackResponse('faq', messageText);
 * }
 *
 * // Handle circuit open error
 * try {
 *   const response = await geminiApi.generate(prompt);
 * } catch (error) {
 *   if (error instanceof CircuitOpenError) {
 *     return handler.handleCircuitOpen('gemini', 'faq', messageText);
 *   }
 *   throw error;
 * }
 * ```
 */
export class DegradationHandler {
  private state: DegradationState = {
    geminiDegraded: false,
    convexDegraded: false,
    lastUpdated: Date.now()
  };

  private readonly logger = loggers.resilience;

  /**
   * Creates a new DegradationHandler instance.
   * @param fallbackResponses - Custom fallback responses (optional)
   */
  constructor(
    private readonly fallbackResponses: FallbackResponses = DEFAULT_FALLBACK_RESPONSES
  ) {}

  /**
   * Gets the current degradation state.
   */
  getState(): DegradationState {
    return { ...this.state };
  }

  /**
   * Checks if the system is currently in a degraded state.
   */
  isDegraded(): boolean {
    return this.state.geminiDegraded || this.state.convexDegraded;
  }

  /**
   * Checks if a specific service is degraded.
   */
  isServiceDegraded(service: "gemini" | "convex"): boolean {
    return service === "gemini"
      ? this.state.geminiDegraded
      : this.state.convexDegraded;
  }

  /**
   * Marks a service as degraded.
   */
  markDegraded(service: "gemini" | "convex", reason?: string): void {
    if (service === "gemini" && !this.state.geminiDegraded) {
      this.state = {
        ...this.state,
        geminiDegraded: true,
        lastUpdated: Date.now(),
        reason
      };
      this.logger.warn("Gemini API marked as degraded", undefined, { reason });
    } else if (service === "convex" && !this.state.convexDegraded) {
      this.state = {
        ...this.state,
        convexDegraded: true,
        lastUpdated: Date.now(),
        reason
      };
      this.logger.warn("Convex marked as degraded", undefined, { reason });
    }
  }

  /**
   * Marks a service as recovered.
   */
  markRecovered(service: "gemini" | "convex"): void {
    if (service === "gemini" && this.state.geminiDegraded) {
      this.state = {
        ...this.state,
        geminiDegraded: false,
        lastUpdated: Date.now(),
        reason: undefined
      };
      this.logger.info("Gemini API recovered");
    } else if (service === "convex" && this.state.convexDegraded) {
      this.state = {
        ...this.state,
        convexDegraded: false,
        lastUpdated: Date.now(),
        reason: undefined
      };
      this.logger.info("Convex recovered");
    }
  }

  /**
   * Checks if fallback should be used based on circuit breaker state.
   */
  shouldUseFallback(circuitBreaker: CircuitBreaker): boolean {
    return circuitBreaker.getState() === "OPEN";
  }

  /**
   * Gets a fallback response based on the intent and context.
   *
   * @param intent - The conversation intent
   * @param messageText - The original message text (used for FAQ matching)
   * @returns An appropriate fallback response
   */
  getFallbackResponse(
    intent: ConversationIntent,
    messageText?: string
  ): string {
    // If both services are down, return the most severe message
    if (this.state.geminiDegraded && this.state.convexDegraded) {
      return this.fallbackResponses.allServicesUnavailable;
    }

    // Try to match FAQ keywords for basic responses
    if (intent === "faq" && messageText) {
      const faqResponse = this.tryMatchFaqFallback(messageText);
      if (faqResponse) {
        return faqResponse;
      }
    }

    // Return intent-specific fallback
    switch (intent) {
      case "greeting":
        return this.state.geminiDegraded
          ? this.fallbackResponses.degradedGreeting
          : "¡Hola! Bienvenido a RestauLang. Puedo ayudarte con el menú, horarios o tomar tu pedido.";

      case "faq":
        return this.fallbackResponses.faqUnavailable;

      case "order":
        return this.fallbackResponses.orderUnavailable;

      case "complaint":
        return "Entendido. Te voy a transferir con un operador humano que pueda ayudarte mejor. Un momento por favor.";

      default:
        return this.fallbackResponses.faqUnavailable;
    }
  }

  /**
   * Handles a circuit open error by returning an appropriate fallback.
   */
  handleCircuitOpen(
    service: "gemini" | "convex",
    intent: ConversationIntent,
    messageText?: string
  ): string {
    this.markDegraded(service, `Circuit breaker open for ${service}`);

    return this.getFallbackResponse(intent, messageText);
  }

  /**
   * Handles a general service error with optional fallback.
   */
  handleServiceError(
    service: "gemini" | "convex",
    error: Error,
    intent: ConversationIntent,
    messageText?: string
  ): string {
    this.logger.error(
      `Service error from ${service}`,
      undefined,
      error
    );

    // Check if it's a circuit open error
    if (error instanceof CircuitOpenError) {
      return this.handleCircuitOpen(service, intent, messageText);
    }

    // For other errors, mark as degraded and return fallback
    this.markDegraded(service, error.message);
    return this.getFallbackResponse(intent, messageText);
  }

  /**
   * Attempts to match a FAQ fallback based on keywords in the message.
   */
  private tryMatchFaqFallback(messageText: string): string | null {
    const normalizedText = messageText.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    for (const [keyword, response] of Object.entries(FAQ_FALLBACKS)) {
      if (normalizedText.includes(keyword)) {
        return response;
      }
    }

    return null;
  }

  /**
   * Creates a degraded response for order processing.
   */
  createDegradedOrderResponse(originalMessage: string): string {
    if (this.state.convexDegraded) {
      return this.fallbackResponses.databaseUnavailable;
    }

    return this.fallbackResponses.orderProcessingError;
  }

  /**
   * Wraps a service call with automatic degradation handling.
   *
   * @param service - The service being called
   * @param circuitBreaker - The circuit breaker for the service
   * @param intent - The current conversation intent
   * @param fn - The function to execute
   * @param fallbackText - Optional message text for fallback matching
   * @returns The result of the function or a fallback response
   */
  async withDegradation<T>(
    service: "gemini" | "convex",
    circuitBreaker: CircuitBreaker,
    intent: ConversationIntent,
    fn: () => Promise<T>,
    fallbackText?: string
  ): Promise<T | string> {
    try {
      const result = await circuitBreaker.execute(fn);
      // Mark as recovered if it was degraded
      if (this.isServiceDegraded(service)) {
        this.markRecovered(service);
      }
      return result;
    } catch (error) {
      if (error instanceof CircuitOpenError) {
        return this.handleCircuitOpen(service, intent, fallbackText);
      }

      // For other errors, check if we should degrade
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      this.markDegraded(service, errorMessage);

      throw error;
    }
  }
}

/**
 * Default degradation handler instance.
 */
export const degradationHandler = new DegradationHandler();
