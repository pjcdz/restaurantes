import { beforeEach, describe, expect, it, vi } from "vitest";

const traceLlmCall = vi.fn();
const endSpan = vi.fn();
const setAttributes = vi.fn();
const recordError = vi.fn();
const ensureLangfuseModelPricing = vi.fn(async () => undefined);

vi.mock("./langfuse.js", () => ({
  tracingService: {
    traceLlmCall,
    endSpan,
    setAttributes,
    recordError
  }
}));

vi.mock("./langfuse-model-pricing.js", () => ({
  ensureLangfuseModelPricing
}));

describe("withLlmTracing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("estimates output tokens when usage has zero outputTokens and extractOutput returns an object with text", async () => {
    const llmSpan = {
      setAttribute: vi.fn()
    };
    traceLlmCall.mockReturnValue(llmSpan);

    const { withLlmTracing } = await import("./conversation-tracing.js");

    const traceContext = {
      span: { setAttribute: vi.fn() },
      context: { chatId: "judge", traceId: "trace-1" },
      logContext: { chatId: "judge", traceId: "trace-1" },
      tokenUsage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        estimatedOutputTokens: 0
      }
    };

    const result = await withLlmTracing(
      "google",
      "judge-evaluate",
      traceContext,
      async () => ({
        text: "Respuesta del juez en texto plano con contenido suficiente.",
        usage: {
          inputTokens: 1113,
          outputTokens: 0,
          totalTokens: 1113
        }
      }),
      {
        extractOutput: (res) => ({ text: res.text, usage: res.usage }),
        extractUsage: (res) => res.usage,
        model: "gemma-3-27b-it"
      }
    );

    expect(result.text).toContain("Respuesta del juez");
    expect(ensureLangfuseModelPricing).toHaveBeenCalledTimes(1);
    expect(llmSpan.setAttribute).toHaveBeenCalledWith("llm.output_tokens_estimated", true);

    const endSpanMetadata = endSpan.mock.calls[0]?.[1] as
      | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
      | undefined;
    expect(endSpanMetadata?.inputTokens).toBe(1113);
    expect((endSpanMetadata?.outputTokens ?? 0)).toBeGreaterThan(0);
    expect((endSpanMetadata?.totalTokens ?? 0)).toBeGreaterThan(1113);

    const hasAccumulatedOutputTokens = setAttributes.mock.calls.some((call) => {
      const attrs = call[1] as Record<string, unknown> | undefined;
      const output = attrs?.["gen_ai.usage.output_tokens"];
      return typeof output === "number" && output > 0;
    });
    expect(hasAccumulatedOutputTokens).toBe(true);
  });
});
