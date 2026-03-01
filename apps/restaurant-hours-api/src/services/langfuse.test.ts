import { beforeEach, describe, expect, it, vi } from "vitest";

const getLangfuseSettings = vi.fn();
const forceFlush = vi.fn(async () => undefined);
const getTracer = vi.fn(() => ({ name: "mock-tracer" }));
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

    expect(tracer).toEqual({
      name: "mock-tracer"
    });
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
