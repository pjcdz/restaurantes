import { beforeEach, describe, expect, it, vi } from "vitest";

const getLangfuseSettings = vi.fn();
const getLangfuseModelPricingConfigs = vi.fn();
const Langfuse = vi.fn();

vi.mock("../config.js", () => ({
  getLangfuseSettings,
  getLangfuseModelPricingConfigs
}));

vi.mock("langfuse", () => ({
  Langfuse
}));

function createMockLangfuseClient(models: Array<{ modelName: string; matchPattern: string }>) {
  return {
    api: {
      modelsList: vi.fn(async () => ({
        data: models,
        meta: {
          page: 1,
          limit: 100,
          totalItems: models.length,
          totalPages: 1
        }
      })),
      modelsCreate: vi.fn(async () => undefined)
    },
    shutdownAsync: vi.fn(async () => undefined)
  };
}

describe("ensureLangfuseModelPricing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("creates model pricing definition when missing", async () => {
    const mockClient = createMockLangfuseClient([]);
    Langfuse.mockImplementation(() => mockClient);

    getLangfuseSettings.mockReturnValue({
      publicKey: "pk",
      secretKey: "sk",
      baseUrl: "https://cloud.langfuse.com"
    });
    getLangfuseModelPricingConfigs.mockReturnValue([
      {
        modelName: "gemma-3-27b-it",
        matchPattern: "(?i)^(gemma-3-27b-it)$",
        unit: "TOKENS",
        inputPrice: 0.000001,
        outputPrice: 0.000002
      }
    ]);

    const module = await import("./langfuse-model-pricing.js");
    await module.ensureLangfuseModelPricing();

    expect(mockClient.api.modelsCreate).toHaveBeenCalledTimes(1);
    expect(mockClient.api.modelsCreate).toHaveBeenCalledWith({
      modelName: "gemma-3-27b-it",
      matchPattern: "(?i)^(gemma-3-27b-it)$",
      unit: "TOKENS",
      inputPrice: 0.000001,
      outputPrice: 0.000002,
      totalPrice: undefined
    });
    expect(mockClient.shutdownAsync).toHaveBeenCalledTimes(1);
  });

  it("does not recreate model pricing when already present", async () => {
    const mockClient = createMockLangfuseClient([
      {
        modelName: "gemma-3-27b-it",
        matchPattern: "(?i)^(gemma-3-27b-it)$"
      }
    ]);
    Langfuse.mockImplementation(() => mockClient);

    getLangfuseSettings.mockReturnValue({
      publicKey: "pk",
      secretKey: "sk",
      baseUrl: "https://cloud.langfuse.com"
    });
    getLangfuseModelPricingConfigs.mockReturnValue([
      {
        modelName: "gemma-3-27b-it",
        matchPattern: "(?i)^(gemma-3-27b-it)$",
        unit: "TOKENS",
        inputPrice: 0.000001,
        outputPrice: 0.000002
      }
    ]);

    const module = await import("./langfuse-model-pricing.js");
    await module.ensureLangfuseModelPricing();
    await module.ensureLangfuseModelPricing();

    expect(mockClient.api.modelsCreate).not.toHaveBeenCalled();
    expect(mockClient.api.modelsList).toHaveBeenCalledTimes(1);
  });
});
