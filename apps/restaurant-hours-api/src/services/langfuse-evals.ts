import { Langfuse } from "langfuse";

import {
  getLangfuseJudgeDatasetName,
  getLangfuseSettings
} from "../config.js";

type JudgeCriteria = {
  relevance: number;
  accuracy: number;
  completeness: number;
  tone: number;
  actionability: number;
};

export type JudgeEvaluationUpload = {
  testId: string;
  category: string;
  description: string;
  messages: Array<string>;
  expectedBehavior: string;
  actualResponse: string;
  overallScore: number;
  criteria: JudgeCriteria;
  reasoning: string;
  passed: boolean;
  runName: string;
  sutTraceId?: string;
  sutObservationId?: string;
  judgeTraceId?: string;
  judgeObservationId?: string;
};

let cachedLangfuseClient: Langfuse | null | undefined;

function getLangfuseClient(): Langfuse | null {
  if (cachedLangfuseClient !== undefined) {
    return cachedLangfuseClient;
  }

  const settings = getLangfuseSettings();
  if (!settings) {
    cachedLangfuseClient = null;
    return null;
  }

  cachedLangfuseClient = new Langfuse({
    publicKey: settings.publicKey,
    secretKey: settings.secretKey,
    baseUrl: settings.baseUrl,
    environment: settings.tracingEnvironment,
    release: settings.release
  });

  return cachedLangfuseClient;
}

function getJudgeDatasetName(): string {
  return getLangfuseJudgeDatasetName();
}

type ScoreTarget = {
  traceId: string;
  observationId?: string;
};

type ScoreConfigDataType = "NUMERIC" | "BOOLEAN";

type ScoreConfigDefinition = {
  name: string;
  dataType: ScoreConfigDataType;
  minValue?: number;
  maxValue?: number;
  description: string;
};

const SCORE_CONFIG_DEFINITIONS: Array<ScoreConfigDefinition> = [
  {
    name: "judge.overall",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 100,
    description: "Puntaje general (0-100) del AI Judge."
  },
  {
    name: "judge.relevance",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 100,
    description: "Relevancia de la respuesta frente a la consulta del usuario."
  },
  {
    name: "judge.accuracy",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 100,
    description: "Precision factual respecto del catalogo y FAQ."
  },
  {
    name: "judge.completeness",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 100,
    description: "Completitud de la respuesta."
  },
  {
    name: "judge.tone",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 100,
    description: "Calidad del tono (amigable/profesional)."
  },
  {
    name: "judge.actionability",
    dataType: "NUMERIC",
    minValue: 0,
    maxValue: 100,
    description: "Que tan accionable es la respuesta para el usuario."
  },
  {
    name: "judge.pass",
    dataType: "BOOLEAN",
    description: "Resultado binario del test (1=pass, 0=fail)."
  }
];

let cachedScoreConfigIds: Map<string, string> | undefined;

function normalizeId(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getScoreTargets(input: JudgeEvaluationUpload): Array<ScoreTarget> {
  const targets: Array<{ traceId?: string; observationId?: string }> = [
    {
      traceId: normalizeId(input.sutTraceId),
      observationId: normalizeId(input.sutObservationId)
    },
    {
      traceId: normalizeId(input.judgeTraceId),
      observationId: normalizeId(input.judgeObservationId)
    }
  ];

  const unique = new Map<string, ScoreTarget>();
  for (const target of targets) {
    const traceId = target.traceId;
    if (!traceId) {
      continue;
    }

    const observationId = target.observationId;
    const key = `${traceId}:${observationId ?? ""}`;
    unique.set(
      key,
      observationId === undefined ? { traceId } : { traceId, observationId }
    );
  }

  return Array.from(unique.values());
}

async function fetchScoreConfigIds(client: Langfuse): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const response = await client.api.scoreConfigsGet({
      page,
      limit: 100
    });
    totalPages = response.meta.totalPages;

    for (const config of response.data) {
      if (typeof config.name === "string" && typeof config.id === "string") {
        ids.set(config.name, config.id);
      }
    }

    page += 1;
  }

  return ids;
}

async function ensureJudgeScoreConfigs(client: Langfuse): Promise<Map<string, string>> {
  if (cachedScoreConfigIds) {
    return cachedScoreConfigIds;
  }

  const ids = await fetchScoreConfigIds(client);
  for (const definition of SCORE_CONFIG_DEFINITIONS) {
    if (ids.has(definition.name)) {
      continue;
    }

    try {
      const created = await client.api.scoreConfigsCreate({
        name: definition.name,
        dataType: definition.dataType,
        minValue: definition.minValue,
        maxValue: definition.maxValue,
        description: definition.description
      });
      ids.set(definition.name, created.id);
    } catch {
      // Config may already exist (race or eventual consistency). Reload once.
    }
  }

  if (SCORE_CONFIG_DEFINITIONS.some((definition) => !ids.has(definition.name))) {
    const refreshed = await fetchScoreConfigIds(client);
    for (const [name, id] of refreshed.entries()) {
      ids.set(name, id);
    }
  }

  cachedScoreConfigIds = ids;
  return ids;
}

/**
 * Uploads judge outputs to Langfuse:
 * - Numeric scores (`judge.overall`, per-criterion)
 * - Binary score (`judge.pass`)
 * - Dataset item + dataset run item (for experiment comparison in UI)
 */
export async function uploadJudgeEvaluationToLangfuse(
  input: JudgeEvaluationUpload
): Promise<void> {
  const client = getLangfuseClient();
  if (!client) {
    return;
  }

  try {
    const datasetName = getJudgeDatasetName();
    const datasetItemId = `${datasetName}:${input.testId}`;
    const scoreTargets = getScoreTargets(input);
    const scoreConfigIds = await ensureJudgeScoreConfigs(client);
    const sutTraceId = normalizeId(input.sutTraceId);
    const judgeTraceId = normalizeId(input.judgeTraceId);
    const datasetTraceId = sutTraceId ?? judgeTraceId;

    await client.createDataset({
      name: datasetName,
      description: "Dataset de evaluación AI-as-a-Judge para el asistente conversacional."
    });

    await client.createDatasetItem({
      id: datasetItemId,
      datasetName,
      input: {
        messages: input.messages
      },
      expectedOutput: {
        expectedBehavior: input.expectedBehavior
      },
      metadata: {
        testId: input.testId,
        category: input.category,
        description: input.description
      },
      sourceTraceId: sutTraceId
    });

    if (datasetTraceId) {
      await client.createDatasetRunItem({
        runName: input.runName,
        runDescription: "Ejecución automatizada del runner de judge",
        datasetItemId,
        traceId: datasetTraceId,
        metadata: {
          testId: input.testId,
          category: input.category,
          overallScore: input.overallScore,
          passed: input.passed,
          judgeTraceId: input.judgeTraceId
        }
      });
    }

    for (const target of scoreTargets) {
      const scoreTarget = target.observationId
        ? { traceId: target.traceId, observationId: target.observationId }
        : { traceId: target.traceId };

      client.score({
        ...scoreTarget,
        name: "judge.overall",
        configId: scoreConfigIds.get("judge.overall"),
        value: input.overallScore,
        comment: input.reasoning,
        metadata: {
          testId: input.testId,
          category: input.category
        }
      });
      client.score({
        ...scoreTarget,
        name: "judge.relevance",
        configId: scoreConfigIds.get("judge.relevance"),
        value: input.criteria.relevance,
        metadata: { testId: input.testId }
      });
      client.score({
        ...scoreTarget,
        name: "judge.accuracy",
        configId: scoreConfigIds.get("judge.accuracy"),
        value: input.criteria.accuracy,
        metadata: { testId: input.testId }
      });
      client.score({
        ...scoreTarget,
        name: "judge.completeness",
        configId: scoreConfigIds.get("judge.completeness"),
        value: input.criteria.completeness,
        metadata: { testId: input.testId }
      });
      client.score({
        ...scoreTarget,
        name: "judge.tone",
        configId: scoreConfigIds.get("judge.tone"),
        value: input.criteria.tone,
        metadata: { testId: input.testId }
      });
      client.score({
        ...scoreTarget,
        name: "judge.actionability",
        configId: scoreConfigIds.get("judge.actionability"),
        value: input.criteria.actionability,
        metadata: { testId: input.testId }
      });
      client.score({
        ...scoreTarget,
        name: "judge.pass",
        configId: scoreConfigIds.get("judge.pass"),
        value: input.passed ? 1 : 0,
        metadata: { testId: input.testId }
      });
    }

    await client.flushAsync();
  } catch (error) {
    console.error("Failed to upload judge evaluation to Langfuse.", error);
  }
}

export async function flushLangfuseEvaluations(): Promise<void> {
  const client = getLangfuseClient();
  if (!client) {
    return;
  }

  await client.flushAsync();
}
