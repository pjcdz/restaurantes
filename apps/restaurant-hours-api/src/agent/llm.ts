import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { CallbackHandler } from "langfuse-langchain";

/**
 * Get the Google Generative AI model instance
 * Using gemma-3-27b-it as specified
 */
export function getLLM(): ChatGoogleGenerativeAI {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  
  if (!apiKey) {
    throw new Error("GOOGLE_GENERATIVE_AI_API_KEY environment variable is required");
  }

  return new ChatGoogleGenerativeAI({
    apiKey,
    model: "gemma-3-27b-it",
    temperature: 0.7,
    maxOutputTokens: 1024,
  });
}

/**
 * Get LangFuse callback handler for tracing
 */
export function getLangfuseCallbackHandler(
  traceName: string,
  sessionId?: string,
  userId?: string,
): CallbackHandler {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  const host = process.env.LANGFUSE_HOST || "http://localhost:3001";

  if (!publicKey || !secretKey || publicKey === "pk-lf-..." || secretKey === "sk-lf-...") {
    console.warn("LangFuse keys not configured, tracing disabled");
    // Return a no-op handler with dummy values
    return new CallbackHandler({
      publicKey: "pk-dummy",
      secretKey: "sk-dummy",
      baseUrl: "http://localhost:9999", // Non-existent host
    });
  }

  return new CallbackHandler({
    publicKey,
    secretKey,
    baseUrl: host,
    // Note: traceName, sessionId, userId are set via the trace object in actual usage
  });
}

/**
 * Check if LangFuse is properly configured
 */
export function isLangfuseConfigured(): boolean {
  const publicKey = process.env.LANGFUSE_PUBLIC_KEY;
  const secretKey = process.env.LANGFUSE_SECRET_KEY;
  
  return !!(
    publicKey &&
    secretKey &&
    publicKey !== "pk-lf-..." &&
    secretKey !== "sk-lf-..."
  );
}
