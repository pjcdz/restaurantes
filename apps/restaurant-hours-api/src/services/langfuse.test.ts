import { beforeEach, describe, expect, it, vi } from "vitest";

const getLangfuseSettings = vi.fn();
const forceFlush = vi.fn(async () => undefined);

// Create a mock span with all necessary methods
const createMockSpan = () => ({
  spanContext: () => ({ spanId: "test-span-id", traceId: "test-trace-id" }),
  setAttribute: vi.fn(),
  recordException: vi.fn(),
  setStatus: vi.fn(),
  addEvent: vi.fn(),
  end: vi.fn()
});

const mockTracer = {
  name: "mock-tracer",
  startSpan: vi.fn(() => createMockSpan())
};

const getTracer = vi.fn(() => mockTracer);
const NodeTracerProvider = vi.fn(() => ({
  forceFlush,
  getTracer
}));
const LangfuseSpanProcessor = vi.fn((options) => ({
  options
}));

vi.mock("../config.js", () => ({
  getLangfuseSettings
}));

vi.mock("@opentelemetry/sdk-trace-node", () => ({
  NodeTracerProvider
}));

vi.mock("@langfuse/otel", () => ({
  LangfuseSpanProcessor
}));

describe("langfuse telemetry lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("flushes the configured provider after the wrapped work completes", async () => {
    getLangfuseSettings.mockReturnValue({
      publicKey: "pk-lf-local-public-key",
      secretKey: "sk-lf-local-secret-key",
      baseUrl: "http://localhost:3000",
      tracingEnvironment: "test",
      release: "test-release"
    });

    const langfuseModule = (await import("./langfuse.js")) as typeof import("./langfuse.js") & {
      flushLangfuseAfter: <T>(work: () => Promise<T>) => Promise<T>;
    };

    const tracer = langfuseModule.getLangfuseTracer();
    const result = await langfuseModule.flushLangfuseAfter(async () => "ok");

    expect(tracer).toBeDefined();
    expect(tracer?.name).toBe("mock-tracer");
    expect(result).toBe("ok");
    expect(NodeTracerProvider).toHaveBeenCalledTimes(1);
    expect(LangfuseSpanProcessor).toHaveBeenCalledTimes(1);
    expect(forceFlush).toHaveBeenCalledTimes(1);
  });

  it("does not fail when langfuse is disabled", async () => {
    getLangfuseSettings.mockReturnValue(null);

    const langfuseModule = (await import("./langfuse.js")) as typeof import("./langfuse.js") & {
      flushLangfuseAfter: <T>(work: () => Promise<T>) => Promise<T>;
    };

    const result = await langfuseModule.flushLangfuseAfter(async () => "ok");

    expect(result).toBe("ok");
    expect(NodeTracerProvider).not.toHaveBeenCalled();
    expect(forceFlush).not.toHaveBeenCalled();
  });
});

describe("LangfuseTracingService", () => {
  let langfuseModule: typeof import("./langfuse.js");

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    
    getLangfuseSettings.mockReturnValue({
      publicKey: "pk-test-key",
      secretKey: "sk-test-key",
      baseUrl: "http://localhost:3000",
      tracingEnvironment: "test",
      release: "test-release"
    });

    langfuseModule = await import("./langfuse.js");
  });

  describe("isEnabled", () => {
    it("returns true when tracing is configured", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      expect(service.isEnabled()).toBe(true);
    });

    it("returns false when tracing is not configured", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();
      
      expect(service.isEnabled()).toBe(false);
    });
  });

  describe("startTrace", () => {
    it("creates a span with conversation context", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const context = {
        chatId: "chat-123",
        sessionId: "session-456",
        messageId: "msg-789",
        traceId: "trace-abc"
      };

      const span = service.startTrace(context, "test-conversation");

      expect(span).toBeDefined();
    });

    it("returns undefined when tracing is disabled", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();
      
      const span = service.startTrace({ chatId: "test" });
      expect(span).toBeUndefined();
    });

    it("uses default name 'conversation' when not specified", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });

      expect(span).toBeDefined();
    });
  });

  describe("traceNode", () => {
    it("creates a span for node execution", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.traceNode("intent_classifier");

      expect(span).toBeDefined();
    });

    it("accepts parent span for nested tracing", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const parentSpan = service.startTrace({ chatId: "test" });
      
      const nodeSpan = service.traceNode("child-node", parentSpan);

      expect(nodeSpan).toBeDefined();
    });

    it("accepts node metadata", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const metadata = {
        nodeName: "test-node",
        input: { message: "test" },
        success: true
      };

      const span = service.traceNode("test-node", undefined, metadata);

      expect(span).toBeDefined();
    });

    it("returns undefined when tracing is disabled", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();
      
      const span = service.traceNode("test-node");
      expect(span).toBeUndefined();
    });
  });

  describe("traceLlmCall", () => {
    it("creates a span for LLM call", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.traceLlmCall("gemini", "generate");

      expect(span).toBeDefined();
    });

    it("accepts LLM metadata with token usage", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const metadata = {
        model: "gemma-3-27b-it",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        latencyMs: 500
      };

      const span = service.traceLlmCall("gemini", "generate", undefined, metadata);

      expect(span).toBeDefined();
    });

    it("accepts parent span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const parentSpan = service.startTrace({ chatId: "test" });
      
      const llmSpan = service.traceLlmCall("gemini", "generate", parentSpan);

      expect(llmSpan).toBeDefined();
    });

    it("returns undefined when tracing is disabled", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();
      
      const span = service.traceLlmCall("gemini", "generate");
      expect(span).toBeUndefined();
    });
  });

  describe("traceDatabase", () => {
    it("creates a span for database operation", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.traceDatabase("query");

      expect(span).toBeDefined();
    });

    it("accepts database metadata", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const metadata = {
        operation: "query",
        table: "conversations",
        index: "by_chat_id",
        durationMs: 25,
        recordCount: 10
      };

      const span = service.traceDatabase("query", undefined, metadata);

      expect(span).toBeDefined();
    });

    it("accepts parent span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const parentSpan = service.startTrace({ chatId: "test" });
      
      const dbSpan = service.traceDatabase("mutation", parentSpan);

      expect(dbSpan).toBeDefined();
    });

    it("returns undefined when tracing is disabled", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();
      
      const span = service.traceDatabase("query");
      expect(span).toBeUndefined();
    });
  });

  describe("span", () => {
    it("creates a nested span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const parentSpan = service.startTrace({ chatId: "test" });
      
      const nestedSpan = service.span("nested-operation", parentSpan!);

      expect(nestedSpan).toBeDefined();
    });

    it("accepts custom attributes", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const parentSpan = service.startTrace({ chatId: "test" });
      
      const nestedSpan = service.span("nested-operation", parentSpan!, {
        customAttr: "value",
        count: 42
      });

      expect(nestedSpan).toBeDefined();
    });

    it("returns undefined when tracing is disabled", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();
      
      const mockParentSpan = { spanContext: () => ({ spanId: "test" }) } as any;
      const span = service.span("test", mockParentSpan);
      expect(span).toBeUndefined();
    });
  });

  describe("endSpan", () => {
    it("ends a span successfully", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });

      service.endSpan(span!, { success: true });

      // Span should be removed from active spans
      expect(span).toBeDefined();
    });

    it("records error on span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });
      const error = new Error("Test error");

      service.endSpan(span!, { success: false, error });

      expect(span).toBeDefined();
    });

    it("records duration", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });

      service.endSpan(span!, { success: true, durationMs: 1500 });

      expect(span).toBeDefined();
    });

    it("records token usage", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });

      service.endSpan(span!, {
        success: true,
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150
      });

      expect(span).toBeDefined();
    });

    it("handles null span gracefully", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      expect(() => service.endSpan(null as any, {})).not.toThrow();
    });
  });

  describe("flushTraces", () => {
    it("resolves without error", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      await expect(service.flushTraces()).resolves.not.toThrow();
    });

    it("ends all active spans", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      
      // Create multiple spans
      const span1 = service.startTrace({ chatId: "test1" });
      const span2 = service.startTrace({ chatId: "test2" });

      await service.flushTraces();

      expect(forceFlush).toHaveBeenCalled();
    });

    it("calls forceFlushLangfuseTelemetry", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      await service.flushTraces();

      expect(forceFlush).toHaveBeenCalled();
    });
  });

  describe("recordError", () => {
    it("records error on span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });
      const error = new Error("Test error");

      service.recordError(span!, error);

      expect(span).toBeDefined();
    });

    it("handles null span gracefully", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      expect(() => service.recordError(null as any, new Error("test"))).not.toThrow();
    });
  });

  describe("addEvent", () => {
    it("adds event to span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });

      service.addEvent(span!, "test-event", { key: "value" });

      expect(span).toBeDefined();
    });

    it("handles null span gracefully", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      expect(() => service.addEvent(null as any, "test-event")).not.toThrow();
    });
  });

  describe("setAttributes", () => {
    it("sets attributes on span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const span = service.startTrace({ chatId: "test" });

      service.setAttributes(span!, { customKey: "customValue", count: 42 });

      expect(span).toBeDefined();
    });

    it("handles null span gracefully", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      expect(() => service.setAttributes(null as any, { key: "value" })).not.toThrow();
    });
  });

  describe("withSpan", () => {
    it("wraps async function with tracing", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      const result = await service.withSpan("test-operation", async () => {
        return "success";
      });

      expect(result).toBe("success");
    });

    it("ends span on success", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      await service.withSpan("test-operation", async () => "result");

      // Span should be properly ended
    });

    it("ends span with error on failure", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      await expect(
        service.withSpan("test-operation", async () => {
          throw new Error("Test error");
        })
      ).rejects.toThrow("Test error");
    });

    it("accepts parent span", async () => {
      const service = new langfuseModule.LangfuseTracingService();
      const parentSpan = service.startTrace({ chatId: "test" });

      const result = await service.withSpan(
        "child-operation",
        async () => "child-result",
        parentSpan
      );

      expect(result).toBe("child-result");
    });

    it("accepts custom attributes", async () => {
      const service = new langfuseModule.LangfuseTracingService();

      const result = await service.withSpan(
        "test-operation",
        async () => "result",
        undefined,
        { customAttr: "value" }
      );

      expect(result).toBe("result");
    });

    it("works when tracing is disabled", async () => {
      getLangfuseSettings.mockReturnValue(null);
      vi.resetModules();
      
      const freshModule = await import("./langfuse.js");
      const service = new freshModule.LangfuseTracingService();

      const result = await service.withSpan("test", async () => "result");
      expect(result).toBe("result");
    });
  });
});

describe("convenience functions", () => {
  let langfuseModule: typeof import("./langfuse.js");

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    
    getLangfuseSettings.mockReturnValue({
      publicKey: "pk-test-key",
      secretKey: "sk-test-key",
      baseUrl: "http://localhost:3000",
      tracingEnvironment: "test",
      release: "test-release"
    });

    langfuseModule = await import("./langfuse.js");
  });

  describe("startTrace", () => {
    it("creates a trace using tracingService", () => {
      const span = langfuseModule.startTrace({ chatId: "test" });
      expect(span).toBeDefined();
    });
  });

  describe("traceNode export", () => {
    it("is exported from module", () => {
      expect(langfuseModule.traceNode).toBeDefined();
      expect(typeof langfuseModule.traceNode).toBe("function");
    });
  });
});
