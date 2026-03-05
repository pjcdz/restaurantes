import { describe, expect, it } from "vitest";

import { normalizeTokenUsage } from "./token-usage.js";

describe("normalizeTokenUsage", () => {
  it("extracts standard ai-sdk usage fields", () => {
    const usage = {
      inputTokens: 120,
      outputTokens: 35,
      totalTokens: 155
    };

    expect(normalizeTokenUsage(usage)).toEqual({
      inputTokens: 120,
      outputTokens: 35,
      totalTokens: 155,
      estimatedOutputTokens: false
    });
  });

  it("extracts raw nested token fields", () => {
    const usage = {
      raw: {
        promptTokenCount: 90,
        totalTokenCount: 110
      }
    };

    expect(normalizeTokenUsage(usage)).toEqual({
      inputTokens: 90,
      outputTokens: 20,
      totalTokens: 110,
      estimatedOutputTokens: false
    });
  });

  it("handles otel-style intValue wrappers", () => {
    const usage = {
      inputTokens: { intValue: 200 },
      outputTokens: { intValue: 30 },
      totalTokens: { intValue: 230 }
    };

    expect(normalizeTokenUsage(usage)).toEqual({
      inputTokens: 200,
      outputTokens: 30,
      totalTokens: 230,
      estimatedOutputTokens: false
    });
  });

  it("handles stringified otel-style wrappers", () => {
    const usage = {
      inputTokens: "{\"intValue\": 200}",
      outputTokens: "{\"intValue\": 30}",
      totalTokens: "{\"intValue\": 230}"
    };

    expect(normalizeTokenUsage(usage)).toEqual({
      inputTokens: 200,
      outputTokens: 30,
      totalTokens: 230,
      estimatedOutputTokens: false
    });
  });

  it("estimates output tokens when provider reports zero with non-empty output text", () => {
    const usage = {
      inputTokens: 100,
      outputTokens: 0,
      totalTokens: 100
    };

    const result = normalizeTokenUsage(usage, "respuesta final del modelo");

    expect(result.inputTokens).toBe(100);
    expect(result.outputTokens).toBeGreaterThan(0);
    expect(result.totalTokens).toBe(result.inputTokens + result.outputTokens);
    expect(result.estimatedOutputTokens).toBe(true);
  });
});
