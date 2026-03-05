import { beforeEach, describe, expect, it, vi } from "vitest";

const getLangfuseSettings = vi.fn();
const getLangfuseJudgeDatasetName = vi.fn();

const mockClient = {
  createDataset: vi.fn(async () => undefined),
  createDatasetItem: vi.fn(async () => undefined),
  createDatasetRunItem: vi.fn(async () => undefined),
  score: vi.fn(),
  flushAsync: vi.fn(async () => undefined),
  api: {
    scoreConfigsGet: vi.fn(async () => ({
      data: [],
      meta: {
        page: 1,
        limit: 100,
        totalItems: 0,
        totalPages: 1
      }
    })),
    scoreConfigsCreate: vi.fn(async (payload: { name: string }) => ({
      id: `cfg-${payload.name}`,
      name: payload.name
    }))
  }
};

const Langfuse = vi.fn(() => mockClient);

vi.mock("../config.js", () => ({
  getLangfuseSettings,
  getLangfuseJudgeDatasetName
}));

vi.mock("langfuse", () => ({
  Langfuse
}));

function buildBaseInput() {
  return {
    testId: "G1",
    category: "greeting",
    description: "Saludo inicial",
    messages: ["Hola"],
    expectedBehavior: "Responder cordialmente",
    actualResponse: "Hola, ¿cómo estás?",
    overallScore: 85,
    criteria: {
      relevance: 90,
      accuracy: 90,
      completeness: 80,
      tone: 90,
      actionability: 75
    },
    reasoning: "Buena respuesta",
    passed: true,
    runName: "judge-run-test"
  };
}

describe("uploadJudgeEvaluationToLangfuse", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    getLangfuseSettings.mockReturnValue({
      publicKey: "pk-test",
      secretKey: "sk-test",
      baseUrl: "https://cloud.langfuse.com",
      tracingEnvironment: "test",
      release: "test-release"
    });
    getLangfuseJudgeDatasetName.mockReturnValue("judge-test-battery");

    mockClient.api.scoreConfigsGet.mockResolvedValue({
      data: [
        { id: "cfg-judge.overall", name: "judge.overall" },
        { id: "cfg-judge.relevance", name: "judge.relevance" },
        { id: "cfg-judge.accuracy", name: "judge.accuracy" },
        { id: "cfg-judge.completeness", name: "judge.completeness" },
        { id: "cfg-judge.tone", name: "judge.tone" },
        { id: "cfg-judge.actionability", name: "judge.actionability" },
        { id: "cfg-judge.pass", name: "judge.pass" }
      ],
      meta: {
        page: 1,
        limit: 100,
        totalItems: 7,
        totalPages: 1
      }
    });
  });

  it("never sends observationId without traceId in score payloads", async () => {
    const module = await import("./langfuse-evals.js");

    await module.uploadJudgeEvaluationToLangfuse({
      ...buildBaseInput(),
      sutObservationId: "sut-observation-without-trace",
      judgeTraceId: "judge-trace-1",
      judgeObservationId: "judge-observation-1"
    });

    expect(mockClient.score).toHaveBeenCalledTimes(7);
    for (const call of mockClient.score.mock.calls) {
      const payload = call[0] as {
        traceId?: string;
        observationId?: string;
        configId?: string;
      };
      expect(payload.traceId).toBe("judge-trace-1");
      expect(typeof payload.configId).toBe("string");
    }
  });

  it("deduplicates identical score targets", async () => {
    const module = await import("./langfuse-evals.js");

    await module.uploadJudgeEvaluationToLangfuse({
      ...buildBaseInput(),
      sutTraceId: "trace-shared",
      judgeTraceId: "trace-shared"
    });

    expect(mockClient.score).toHaveBeenCalledTimes(7);
  });

  it("creates missing score configs before sending scores", async () => {
    mockClient.api.scoreConfigsGet.mockResolvedValueOnce({
      data: [],
      meta: {
        page: 1,
        limit: 100,
        totalItems: 0,
        totalPages: 1
      }
    });
    mockClient.api.scoreConfigsGet.mockResolvedValueOnce({
      data: [
        { id: "cfg-judge.overall", name: "judge.overall" },
        { id: "cfg-judge.relevance", name: "judge.relevance" },
        { id: "cfg-judge.accuracy", name: "judge.accuracy" },
        { id: "cfg-judge.completeness", name: "judge.completeness" },
        { id: "cfg-judge.tone", name: "judge.tone" },
        { id: "cfg-judge.actionability", name: "judge.actionability" },
        { id: "cfg-judge.pass", name: "judge.pass" }
      ],
      meta: {
        page: 1,
        limit: 100,
        totalItems: 7,
        totalPages: 1
      }
    });

    const module = await import("./langfuse-evals.js");

    await module.uploadJudgeEvaluationToLangfuse({
      ...buildBaseInput(),
      judgeTraceId: "judge-trace-1"
    });

    expect(mockClient.api.scoreConfigsCreate).toHaveBeenCalled();
    expect(mockClient.score).toHaveBeenCalledTimes(7);
  });
});
