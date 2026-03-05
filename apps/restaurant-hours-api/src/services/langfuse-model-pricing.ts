import { Langfuse } from "langfuse";

import {
  getLangfuseModelPricingConfigs,
  getLangfuseSettings,
  type LangfuseModelPricingConfig
} from "../config.js";

type ApiModelLike = {
  modelName?: string | null;
  matchPattern?: string | null;
};

let ensurePromise: Promise<void> | null = null;
let hasEnsuredPricing = false;

function isModelMatchingConfig(
  model: ApiModelLike,
  config: LangfuseModelPricingConfig
): boolean {
  return (
    model.modelName === config.modelName &&
    model.matchPattern === config.matchPattern
  );
}

async function fetchAllLangfuseModels(client: Langfuse): Promise<Array<ApiModelLike>> {
  const models: Array<ApiModelLike> = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await client.api.modelsList({ page, limit: 100 });
    models.push(...response.data);
    totalPages = response.meta.totalPages;
    page += 1;
  }

  return models;
}

async function createModelIfMissing(
  client: Langfuse,
  existingModels: Array<ApiModelLike>,
  config: LangfuseModelPricingConfig
): Promise<void> {
  const modelExists = existingModels.some((model) =>
    isModelMatchingConfig(model, config)
  );
  if (modelExists) {
    return;
  }

  await client.api.modelsCreate({
    modelName: config.modelName,
    matchPattern: config.matchPattern,
    unit: config.unit,
    inputPrice: config.inputPrice,
    outputPrice: config.outputPrice,
    totalPrice: config.totalPrice
  });
}

async function ensureLangfuseModelPricingInternal(): Promise<void> {
  const settings = getLangfuseSettings();
  if (!settings) {
    return;
  }

  const pricingConfigs = getLangfuseModelPricingConfigs();
  if (pricingConfigs.length === 0) {
    return;
  }

  const client = new Langfuse({
    publicKey: settings.publicKey,
    secretKey: settings.secretKey,
    baseUrl: settings.baseUrl,
    environment: settings.tracingEnvironment,
    release: settings.release
  });

  try {
    const models = await fetchAllLangfuseModels(client);
    for (const pricingConfig of pricingConfigs) {
      await createModelIfMissing(client, models, pricingConfig);
    }
    hasEnsuredPricing = true;
  } finally {
    await client.shutdownAsync();
  }
}

export async function ensureLangfuseModelPricing(): Promise<void> {
  if (hasEnsuredPricing) {
    return;
  }

  if (ensurePromise) {
    await ensurePromise;
    return;
  }

  ensurePromise = ensureLangfuseModelPricingInternal().catch((error) => {
    console.error("Failed to ensure Langfuse model pricing configuration.", error);
  }).finally(() => {
    ensurePromise = null;
  });

  await ensurePromise;
}
