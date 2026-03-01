export const RESTAURANT_TIMEZONE = "America/Argentina/Buenos_Aires";
export const OPENING_HOUR = 9;
export const CLOSING_HOUR = 23;
export const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export const OPEN_MESSAGE = "El restaurante esta abierto.";
export const CLOSED_MESSAGE = "El restaurante esta cerrado.";

export function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  return token;
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
  const tracingEnvironment = process.env.LANGFUSE_TRACING_ENVIRONMENT?.trim();
  const release = process.env.LANGFUSE_RELEASE?.trim();

  return {
    publicKey,
    secretKey,
    baseUrl,
    tracingEnvironment,
    release
  };
}
