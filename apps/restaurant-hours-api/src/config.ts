export const RESTAURANT_TIMEZONE = "America/Argentina/Buenos_Aires";
export const OPENING_HOUR = 9;
export const CLOSING_HOUR = 23;
export const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export const OPEN_MESSAGE = "El restaurante esta abierto.";
export const CLOSED_MESSAGE = "El restaurante esta cerrado.";

/**
 * Retrieves the Telegram bot token from the environment.
 * @returns The Telegram bot token
 * @throws Error if TELEGRAM_BOT_TOKEN is not set
 */
export function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  return token;
}

/**
 * Retrieves the Telegram webhook secret token from the environment.
 * Used to validate incoming webhook requests from Telegram.
 * @returns The Telegram webhook secret, or undefined if not configured
 */
export function getTelegramWebhookSecret(): string | undefined {
  return process.env.TELEGRAM_WEBHOOK_SECRET?.trim() || undefined;
}

/**
 * Retrieves the JWT secret from the environment.
 * Used for signing and verifying JWT tokens for admin authentication.
 * @returns The JWT secret
 * @throws Error if JWT_SECRET is not set
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();

  if (!secret) {
    throw new Error("JWT_SECRET is required for admin authentication.");
  }

  return secret;
}

/**
 * Retrieves the JWT expiration time from the environment.
 * @returns The JWT expiration time (default: '24h')
 */
export function getJwtExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || "24h";
}

/**
 * Retrieves the allowed CORS origins from the environment.
 * @returns Array of allowed origins, or empty array if not configured
 */
export function getAllowedOrigins(): string[] {
  const origins = process.env.ALLOWED_ORIGINS?.trim();

  if (!origins) {
    return [];
  }

  return origins.split(",").map((origin) => origin.trim()).filter(Boolean);
}

export function getConvexUrl(): string {
  const url = process.env.CONVEX_URL?.trim();

  if (!url) {
    throw new Error("CONVEX_URL is required.");
  }

  return url;
}

export function getGoogleGenerativeAiApiKey(): string {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY is required.");
  }

  return apiKey;
}

export type LangfuseSettings = {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  tracingEnvironment?: string;
  release?: string;
};

export type LangfuseModelUsageUnit =
  | "CHARACTERS"
  | "TOKENS"
  | "MILLISECONDS"
  | "SECONDS"
  | "IMAGES"
  | "REQUESTS";

export type LangfuseModelPricingConfig = {
  modelName: string;
  matchPattern: string;
  unit: LangfuseModelUsageUnit;
  inputPrice?: number;
  outputPrice?: number;
  totalPrice?: number;
};

export function getLangfuseSettings(): LangfuseSettings | null {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY?.trim();
  const secretKey = process.env.LANGFUSE_SECRET_KEY?.trim();

  if (!publicKey || !secretKey) {
    return null;
  }

  const baseUrl =
    process.env.LANGFUSE_BASE_URL?.trim() ??
    process.env.LANGFUSE_BASEURL?.trim() ??
    "https://cloud.langfuse.com";
  const rawTracingEnvironment = process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim();
  const tracingEnvironment =
    rawTracingEnvironment && rawTracingEnvironment.toLowerCase() !== "auto"
      ? rawTracingEnvironment
      : undefined;
  const release = process.env.LANGFUSE_RELEASE?.trim();

  return {
    publicKey,
    secretKey,
    baseUrl,
    tracingEnvironment,
    release
  };
}

export function getLangfuseJudgeDatasetName(): string {
  return process.env.LANGFUSE_JUDGE_DATASET_NAME?.trim() || "judge-test-battery";
}

function parseOptionalPositiveNumber(rawValue: string | undefined): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number(rawValue.trim());
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parsePricePerTokenFromEnv(
  directVar: string,
  perMillionVar: string
): number | undefined {
  const direct = parseOptionalPositiveNumber(process.env[directVar]);
  if (direct !== undefined) {
    return direct;
  }

  const perMillion = parseOptionalPositiveNumber(process.env[perMillionVar]);
  if (perMillion === undefined) {
    return undefined;
  }

  return perMillion / 1_000_000;
}

function escapeRegexLiteral(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseLangfuseModelPricingUnit(value: string | undefined): LangfuseModelUsageUnit {
  const normalized = value?.trim().toUpperCase();
  if (
    normalized === "CHARACTERS" ||
    normalized === "TOKENS" ||
    normalized === "MILLISECONDS" ||
    normalized === "SECONDS" ||
    normalized === "IMAGES" ||
    normalized === "REQUESTS"
  ) {
    return normalized;
  }

  return "TOKENS";
}

function normalizePricingEntry(
  entry: Partial<LangfuseModelPricingConfig>
): LangfuseModelPricingConfig | null {
  const modelName = entry.modelName?.trim();
  if (!modelName) {
    return null;
  }

  const inputPrice = entry.inputPrice;
  const outputPrice = entry.outputPrice;
  const totalPrice = entry.totalPrice;
  const hasAnyPrice =
    typeof inputPrice === "number" ||
    typeof outputPrice === "number" ||
    typeof totalPrice === "number";
  if (!hasAnyPrice) {
    return null;
  }

  return {
    modelName,
    matchPattern:
      entry.matchPattern?.trim() || `(?i)^(${escapeRegexLiteral(modelName)})$`,
    unit: entry.unit ?? "TOKENS",
    inputPrice,
    outputPrice,
    totalPrice
  };
}

function getLegacyLangfuseModelPricingConfig():
  | LangfuseModelPricingConfig
  | null {
  const modelName = process.env.LANGFUSE_MODEL_PRICING_MODEL_NAME?.trim();
  if (!modelName) {
    return null;
  }

  const inputPrice = parsePricePerTokenFromEnv(
    "LANGFUSE_MODEL_PRICING_INPUT_PRICE",
    "LANGFUSE_MODEL_PRICING_INPUT_PRICE_PER_1M"
  );
  const outputPrice = parsePricePerTokenFromEnv(
    "LANGFUSE_MODEL_PRICING_OUTPUT_PRICE",
    "LANGFUSE_MODEL_PRICING_OUTPUT_PRICE_PER_1M"
  );
  const totalPrice = parsePricePerTokenFromEnv(
    "LANGFUSE_MODEL_PRICING_TOTAL_PRICE",
    "LANGFUSE_MODEL_PRICING_TOTAL_PRICE_PER_1M"
  );
  const unit = parseLangfuseModelPricingUnit(
    process.env.LANGFUSE_MODEL_PRICING_UNIT
  );

  return normalizePricingEntry({
    modelName,
    matchPattern: process.env.LANGFUSE_MODEL_PRICING_MATCH_PATTERN,
    unit,
    inputPrice,
    outputPrice,
    totalPrice
  });
}

function getJsonLangfuseModelPricingConfigs(): Array<LangfuseModelPricingConfig> {
  const raw = process.env.LANGFUSE_MODEL_PRICING_JSON?.trim();
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item): LangfuseModelPricingConfig | null => {
        if (typeof item !== "object" || item === null || Array.isArray(item)) {
          return null;
        }

        const candidate = item as Partial<LangfuseModelPricingConfig> & {
          inputPricePer1M?: number;
          outputPricePer1M?: number;
          totalPricePer1M?: number;
        };

        const normalized = normalizePricingEntry({
          modelName: candidate.modelName,
          matchPattern: candidate.matchPattern,
          unit: parseLangfuseModelPricingUnit(candidate.unit),
          inputPrice:
            candidate.inputPrice ??
            (typeof candidate.inputPricePer1M === "number"
              ? candidate.inputPricePer1M / 1_000_000
              : undefined),
          outputPrice:
            candidate.outputPrice ??
            (typeof candidate.outputPricePer1M === "number"
              ? candidate.outputPricePer1M / 1_000_000
              : undefined),
          totalPrice:
            candidate.totalPrice ??
            (typeof candidate.totalPricePer1M === "number"
              ? candidate.totalPricePer1M / 1_000_000
              : undefined)
        });

        return normalized;
      })
      .filter((config): config is LangfuseModelPricingConfig => config !== null);
  } catch (error) {
    console.warn(
      "Invalid LANGFUSE_MODEL_PRICING_JSON. Ignoring model pricing configuration.",
      error
    );
    return [];
  }
}

export function getLangfuseModelPricingConfigs(): Array<LangfuseModelPricingConfig> {
  const fromJson = getJsonLangfuseModelPricingConfigs();
  const fromLegacy = getLegacyLangfuseModelPricingConfig();
  const all = fromLegacy ? [...fromJson, fromLegacy] : fromJson;

  const deduped = new Map<string, LangfuseModelPricingConfig>();
  for (const config of all) {
    deduped.set(`${config.modelName}::${config.matchPattern}`, config);
  }

  return Array.from(deduped.values());
}

/**
 * Circuit Breaker configuration.
 */
export interface CircuitBreakerConfig {
  /**
   * Number of consecutive failures before opening the circuit.
   */
  failureThreshold: number;

  /**
   * Time in milliseconds to wait before attempting reset.
   */
  resetTimeoutMs: number;
}

/**
 * Gets the circuit breaker configuration for Gemini API.
 * @returns Circuit breaker configuration with defaults
 */
export function getGeminiCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: process.env.GEMINI_CIRCUIT_FAILURE_THRESHOLD
      ? parseInt(process.env.GEMINI_CIRCUIT_FAILURE_THRESHOLD, 10)
      : 5,
    resetTimeoutMs: process.env.GEMINI_CIRCUIT_RESET_TIMEOUT_MS
      ? parseInt(process.env.GEMINI_CIRCUIT_RESET_TIMEOUT_MS, 10)
      : 30000
  };
}

/**
 * Gets the circuit breaker configuration for Convex.
 * @returns Circuit breaker configuration with defaults
 */
export function getConvexCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    failureThreshold: process.env.CONVEX_CIRCUIT_FAILURE_THRESHOLD
      ? parseInt(process.env.CONVEX_CIRCUIT_FAILURE_THRESHOLD, 10)
      : 3,
    resetTimeoutMs: process.env.CONVEX_CIRCUIT_RESET_TIMEOUT_MS
      ? parseInt(process.env.CONVEX_CIRCUIT_RESET_TIMEOUT_MS, 10)
      : 15000
  };
}

/**
 * Log level type.
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Log format type.
 */
export type LogFormat = "json" | "pretty";

/**
 * Gets the configured log level.
 * @returns The log level (default: INFO)
 */
export function getLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel === "DEBUG" || envLevel === "INFO" || envLevel === "WARN" || envLevel === "ERROR") {
    return envLevel;
  }
  return "INFO";
}

/**
 * Gets the configured log format.
 * @returns The log format (default: pretty in development, json in production)
 */
export function getLogFormat(): LogFormat {
  const envFormat = process.env.LOG_FORMAT?.toLowerCase();
  if (envFormat === "json" || envFormat === "pretty") {
    return envFormat;
  }
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

/**
 * Gets the graceful shutdown timeout in milliseconds.
 * @returns The shutdown timeout (default: 30000ms / 30 seconds)
 */
export function getShutdownTimeoutMs(): number {
  const timeout = process.env.SHUTDOWN_TIMEOUT_MS;
  if (timeout) {
    const parsed = parseInt(timeout, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 30000;
}

/**
 * Gets whether to allow requests with no origin header.
 * Server-to-server and mobile app requests typically don't have an origin.
 * @returns True if no-origin requests should be allowed (default: true for backward compatibility)
 */
export function getAllowNoOrigin(): boolean {
  const value = process.env.ALLOW_NO_ORIGIN?.toLowerCase();
  // Default to true for backward compatibility
  if (value === "false" || value === "0") {
    return false;
  }
  return true;
}

/**
 * Gets the token version store backend type.
 * @returns 'convex' for distributed deployments, 'memory' for single-instance (default: memory)
 */
export function getTokenStoreBackend(): "convex" | "memory" {
  const backend = process.env.TOKEN_STORE_BACKEND?.toLowerCase();
  if (backend === "convex") {
    return "convex";
  }
  return "memory";
}

/**
 * Kapso.ai API base URL for WhatsApp integration.
 */
export const KAPSO_API_BASE_URL = "https://api.kapso.ai";

/**
 * Retrieves the Kapso.ai API key from the environment.
 * Used for sending messages through Kapso WhatsApp integration.
 * @returns The Kapso API key
 * @throws Error if KAPSO_API_KEY is not set
 */
export function getKapsoApiKey(): string {
  const apiKey = process.env.KAPSO_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("KAPSO_API_KEY is required.");
  }
  return apiKey;
}

/**
 * Retrieves the Kapso webhook secret token from the environment.
 * Used to validate incoming webhook requests from Kapso.ai.
 * @returns The Kapso webhook secret, or undefined if not configured
 */
export function getKapsoWebhookSecret(): string | undefined {
  return process.env.KAPSO_WEBHOOK_SECRET?.trim() || undefined;
}
