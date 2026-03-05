/**
 * Token usage normalization utilities.
 *
 * Different providers and SDK layers expose usage in slightly different shapes.
 * This module converts those shapes into a stable `{input, output, total}` form.
 */

export type NormalizedTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedOutputTokens: boolean;
};

type TokenUsageRecord = Record<string, unknown>;

const ESTIMATED_CHARS_PER_TOKEN = 4;

function isRecord(value: unknown): value is TokenUsageRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toSafeInt(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      try {
        const parsed = JSON.parse(trimmed);
        return toSafeInt(parsed);
      } catch {
        // Continue with numeric parsing fallback.
      }
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
  }

  if (isRecord(value)) {
    if ("intValue" in value) {
      return toSafeInt(value.intValue);
    }

    if ("doubleValue" in value) {
      return toSafeInt(value.doubleValue);
    }

    if ("value" in value) {
      return toSafeInt(value.value);
    }
  }

  return undefined;
}

function pickTokenValue(...candidates: Array<unknown>): number | undefined {
  for (const candidate of candidates) {
    const parsed = toSafeInt(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function estimateTokensFromText(outputText: string | undefined): number {
  if (!outputText) {
    return 0;
  }

  const trimmed = outputText.trim();
  if (!trimmed) {
    return 0;
  }

  return Math.max(1, Math.ceil(trimmed.length / ESTIMATED_CHARS_PER_TOKEN));
}

/**
 * Extracts robust token usage from provider/SDK responses.
 *
 * The function gracefully handles:
 * - Standard numeric fields (`inputTokens`, `outputTokens`, `totalTokens`)
 * - Legacy fields (`promptTokens`, `completionTokens`)
 * - Nested raw fields (`raw.promptTokenCount`, `raw.totalTokenCount`)
 * - OTEL-style numeric wrappers (`{ intValue: 123 }`)
 *
 * If output tokens are reported as zero but output text exists, the function
 * estimates output tokens from text length to avoid zero-cost traces.
 */
export function normalizeTokenUsage(
  usage: unknown,
  outputText?: string
): NormalizedTokenUsage {
  const usageRecord = isRecord(usage) ? usage : undefined;
  const raw = usageRecord && isRecord(usageRecord.raw) ? usageRecord.raw : undefined;

  let inputTokens = pickTokenValue(
    usageRecord?.inputTokens,
    usageRecord?.promptTokens,
    usageRecord?.inputTokenCount,
    usageRecord?.promptTokenCount,
    usageRecord?.input,
    raw?.inputTokenCount,
    raw?.promptTokenCount
  );

  let outputTokens = pickTokenValue(
    usageRecord?.outputTokens,
    usageRecord?.completionTokens,
    usageRecord?.outputTokenCount,
    usageRecord?.completionTokenCount,
    usageRecord?.candidatesTokenCount,
    usageRecord?.candidateTokenCount,
    raw?.outputTokenCount,
    raw?.completionTokenCount,
    raw?.candidatesTokenCount
  );

  let totalTokens = pickTokenValue(
    usageRecord?.totalTokens,
    usageRecord?.totalTokenCount,
    usageRecord?.total,
    raw?.totalTokenCount
  );

  if (inputTokens === undefined) {
    inputTokens = 0;
  }

  if (outputTokens === undefined && totalTokens !== undefined && totalTokens >= inputTokens) {
    outputTokens = Math.max(0, totalTokens - inputTokens);
  }

  if (outputTokens === undefined) {
    outputTokens = 0;
  }

  let estimatedOutputTokens = false;
  if (outputTokens === 0) {
    const estimated = estimateTokensFromText(outputText);
    if (estimated > 0) {
      outputTokens = estimated;
      estimatedOutputTokens = true;
    }
  }

  if (totalTokens === undefined || totalTokens < inputTokens + outputTokens) {
    totalTokens = inputTokens + outputTokens;
  }

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedOutputTokens
  };
}
