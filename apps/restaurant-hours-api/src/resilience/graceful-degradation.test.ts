import { describe, expect, it, vi, beforeEach } from "vitest";

import { CircuitBreaker, CircuitOpenError } from "./circuit-breaker.js";
import {
  DegradationHandler,
  degradationHandler,
  type FallbackResponses
} from "./graceful-degradation.js";

// Mock the logger
vi.mock("../utils/logger.js", () => ({
  Logger: vi.fn().mockImplementation(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn()
  })),
  loggers: {
    resilience: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    }
  }
}));

describe("DegradationHandler", () => {
  let handler: DegradationHandler;
  let mockCircuitBreaker: CircuitBreaker;

  const customFallbacks: FallbackResponses = {
    faqUnavailable: "Custom FAQ unavailable message",
    orderUnavailable: "Custom order unavailable message",
    databaseUnavailable: "Custom database unavailable message",
    allServicesUnavailable: "Custom all services unavailable message",
    orderProcessingError: "Custom order processing error",
    degradedGreeting: "Custom degraded greeting"
  };

  beforeEach(() => {
    vi.clearAllMocks();
    handler = new DegradationHandler();
    mockCircuitBreaker = {
      getState: vi.fn(() => "CLOSED"),
      execute: vi.fn(async (fn) => fn())
    } as unknown as CircuitBreaker;
  });

  describe("initial state", () => {
    it("starts with no degraded services", () => {
      const state = handler.getState();
      expect(state.geminiDegraded).toBe(false);
      expect(state.convexDegraded).toBe(false);
    });

    it("isDegraded returns false initially", () => {
      expect(handler.isDegraded()).toBe(false);
    });
  });

  describe("getFallbackResponse", () => {
    it("returns FAQ unavailable message for faq intent", () => {
      const response = handler.getFallbackResponse("faq");
      expect(response).toContain("dificultades técnicas");
    });

    it("returns order unavailable message for order intent", () => {
      const response = handler.getFallbackResponse("order");
      expect(response).toContain("no puedo procesar pedidos");
    });

    it("returns greeting message for greeting intent when not degraded", () => {
      const response = handler.getFallbackResponse("greeting");
      expect(response).toContain("¡Hola!");
      expect(response).toContain("RestauLang");
    });

    it("returns degraded greeting when gemini is degraded", () => {
      handler.markDegraded("gemini", "test reason");
      const response = handler.getFallbackResponse("greeting");
      expect(response).toContain("problemas técnicos");
    });

    it("returns handoff message for complaint intent", () => {
      const response = handler.getFallbackResponse("complaint");
      expect(response).toContain("operador humano");
    });

    it("returns all services unavailable when both are degraded", () => {
      handler.markDegraded("gemini", "test");
      handler.markDegraded("convex", "test");
      const response = handler.getFallbackResponse("faq");
      expect(response).toContain("problemas técnicos");
    });
  });

  describe("FAQ keyword matching", () => {
    it("matches 'horario' keyword and returns schedule response", () => {
      const response = handler.getFallbackResponse("faq", "¿Cuál es el horario?");
      expect(response).toContain("9:00 a 23:00");
    });

    it("matches 'horarios' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Qué horarios tienen?");
      expect(response).toContain("9:00 a 23:00");
    });

    it("matches 'abierto' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Están abierto ahora?");
      expect(response).toContain("9:00 a 23:00");
    });

    it("matches 'delivery' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Hacen delivery?");
      expect(response).toContain("entregas a domicilio");
    });

    it("matches 'envio' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Cuánto cuesta el envio?");
      expect(response).toContain("entregas a domicilio");
    });

    it("matches 'pago' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Qué métodos de pago aceptan?");
      expect(response).toContain("solo efectivo");
    });

    it("matches 'efectivo' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Aceptan efectivo?");
      expect(response).toContain("aceptamos pagos en efectivo");
    });

    it("matches 'ubicacion' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Cuál es su ubicacion?");
      expect(response).toContain("zona centro");
    });

    it("matches 'direccion' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Cuál es la direccion?");
      expect(response).toContain("zona centro");
    });

    it("matches 'contacto' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Cómo puedo contacto?");
      expect(response).toContain("contactarnos");
    });

    it("matches 'telefono' keyword", () => {
      const response = handler.getFallbackResponse("faq", "¿Cuál es el telefono?");
      expect(response).toContain("contactarnos");
    });

    it("handles accented characters in message", () => {
      const response = handler.getFallbackResponse("faq", "¿Cuál es su ubicación?");
      expect(response).toContain("zona centro");
    });

    it("returns default FAQ message when no keyword matches", () => {
      const response = handler.getFallbackResponse("faq", "Pregunta sin palabras clave");
      expect(response).toContain("dificultades técnicas");
    });
  });

  describe("degradation state tracking", () => {
    it("marks gemini as degraded", () => {
      handler.markDegraded("gemini", "API timeout");
      expect(handler.isServiceDegraded("gemini")).toBe(true);
      expect(handler.isServiceDegraded("convex")).toBe(false);
    });

    it("marks convex as degraded", () => {
      handler.markDegraded("convex", "Connection refused");
      expect(handler.isServiceDegraded("convex")).toBe(true);
      expect(handler.isServiceDegraded("gemini")).toBe(false);
    });

    it("isDegraded returns true when any service is degraded", () => {
      handler.markDegraded("gemini", "test");
      expect(handler.isDegraded()).toBe(true);
    });

    it("updates lastUpdated timestamp on state change", () => {
      const before = handler.getState().lastUpdated;
      // Small delay to ensure timestamp difference
      handler.markDegraded("gemini", "test");
      const after = handler.getState().lastUpdated;
      expect(after).toBeGreaterThanOrEqual(before);
    });

    it("stores reason for degradation", () => {
      handler.markDegraded("gemini", "API rate limit exceeded");
      const state = handler.getState();
      expect(state.reason).toBe("API rate limit exceeded");
    });

    it("marks service as recovered", () => {
      handler.markDegraded("gemini", "test");
      expect(handler.isServiceDegraded("gemini")).toBe(true);

      handler.markRecovered("gemini");
      expect(handler.isServiceDegraded("gemini")).toBe(false);
    });

    it("clears reason when recovered", () => {
      handler.markDegraded("gemini", "test reason");
      handler.markRecovered("gemini");
      const state = handler.getState();
      expect(state.reason).toBeUndefined();
    });
  });

  describe("shouldUseFallback", () => {
    it("returns true when circuit breaker is OPEN", () => {
      mockCircuitBreaker = {
        getState: vi.fn(() => "OPEN")
      } as unknown as CircuitBreaker;

      expect(handler.shouldUseFallback(mockCircuitBreaker)).toBe(true);
    });

    it("returns false when circuit breaker is CLOSED", () => {
      mockCircuitBreaker = {
        getState: vi.fn(() => "CLOSED")
      } as unknown as CircuitBreaker;

      expect(handler.shouldUseFallback(mockCircuitBreaker)).toBe(false);
    });

    it("returns false when circuit breaker is HALF_OPEN", () => {
      mockCircuitBreaker = {
        getState: vi.fn(() => "HALF_OPEN")
      } as unknown as CircuitBreaker;

      expect(handler.shouldUseFallback(mockCircuitBreaker)).toBe(false);
    });
  });

  describe("handleCircuitOpen", () => {
    it("marks service as degraded and returns fallback", () => {
      const response = handler.handleCircuitOpen("gemini", "faq", "¿Horario?");
      expect(handler.isServiceDegraded("gemini")).toBe(true);
      expect(response).toContain("9:00 a 23:00");
    });

    it("includes service name in degradation reason", () => {
      handler.handleCircuitOpen("convex", "order");
      const state = handler.getState();
      expect(state.reason).toContain("convex");
    });
  });

  describe("handleServiceError", () => {
    it("handles CircuitOpenError specially", () => {
      const error = new CircuitOpenError("Circuit is open");
      const response = handler.handleServiceError("gemini", error, "faq", "test");
      expect(handler.isServiceDegraded("gemini")).toBe(true);
      expect(response).toBeDefined();
    });

    it("handles generic errors", () => {
      const error = new Error("Generic error");
      const response = handler.handleServiceError("gemini", error, "faq", "test");
      expect(handler.isServiceDegraded("gemini")).toBe(true);
      expect(response).toBeDefined();
    });

    it("re-throws non-circuit errors", () => {
      const error = new Error("Generic error");
      expect(() => {
        handler.handleServiceError("gemini", error, "faq", "test");
      }).not.toThrow();
    });
  });

  describe("createDegradedOrderResponse", () => {
    it("returns database unavailable when convex is degraded", () => {
      handler.markDegraded("convex", "test");
      const response = handler.createDegradedOrderResponse("test order");
      expect(response).toContain("no puedo acceder a la información");
    });

    it("returns order processing error when only gemini is degraded", () => {
      handler.markDegraded("gemini", "test");
      const response = handler.createDegradedOrderResponse("test order");
      expect(response).toContain("error al procesar tu pedido");
    });
  });

  describe("withDegradation wrapper", () => {
    it("returns result on successful execution", async () => {
      const result = await handler.withDegradation(
        "gemini",
        mockCircuitBreaker,
        "faq",
        async () => "success"
      );
      expect(result).toBe("success");
    });

    it("marks service as recovered after success", async () => {
      handler.markDegraded("gemini", "previous error");

      await handler.withDegradation(
        "gemini",
        mockCircuitBreaker,
        "faq",
        async () => "success"
      );

      expect(handler.isServiceDegraded("gemini")).toBe(false);
    });

    it("returns fallback on CircuitOpenError", async () => {
      const openBreaker = {
        getState: vi.fn(() => "OPEN"),
        execute: vi.fn(async () => {
          throw new CircuitOpenError("Circuit is open");
        })
      } as unknown as CircuitBreaker;

      const result = await handler.withDegradation(
        "gemini",
        openBreaker,
        "faq",
        async () => "should not reach"
      );

      expect(typeof result).toBe("string");
      expect(result).not.toBe("should not reach");
    });

    it("re-throws non-circuit errors", async () => {
      const errorBreaker = {
        getState: vi.fn(() => "CLOSED"),
        execute: vi.fn(async () => {
          throw new Error("Generic error");
        })
      } as unknown as CircuitBreaker;

      await expect(
        handler.withDegradation("gemini", errorBreaker, "faq", async () => {
          throw new Error("Generic error");
        })
      ).rejects.toThrow("Generic error");
    });
  });

  describe("custom fallback responses", () => {
    it("uses custom fallback responses when provided", () => {
      const customHandler = new DegradationHandler(customFallbacks);
      const response = customHandler.getFallbackResponse("faq");
      expect(response).toBe("Custom FAQ unavailable message");
    });

    it("uses custom order unavailable message", () => {
      const customHandler = new DegradationHandler(customFallbacks);
      const response = customHandler.getFallbackResponse("order");
      expect(response).toBe("Custom order unavailable message");
    });

    it("uses custom all services unavailable message", () => {
      const customHandler = new DegradationHandler(customFallbacks);
      customHandler.markDegraded("gemini", "test");
      customHandler.markDegraded("convex", "test");
      const response = customHandler.getFallbackResponse("faq");
      expect(response).toBe("Custom all services unavailable message");
    });
  });
});

describe("degradationHandler singleton", () => {
  it("is defined", () => {
    expect(degradationHandler).toBeDefined();
  });

  it("is an instance of DegradationHandler", () => {
    expect(degradationHandler).toBeInstanceOf(DegradationHandler);
  });
});
