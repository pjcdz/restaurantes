/**
 * Langfuse Tracing Integration for LangGraph Nodes
 *
 * Provides tracing wrappers for each LangGraph node in the conversation
 * assistant, capturing input/output state, token usage, and latency metrics.
 *
 * @module services/conversation-tracing
 */

import type { Span } from "@opentelemetry/api";
import { context, trace } from "@opentelemetry/api";
import { LangfuseOtelSpanAttributes, propagateAttributes } from "@langfuse/core";
import {
  tracingService,
  type TraceContext
} from "./langfuse.js";
import { normalizeTokenUsage } from "./token-usage.js";
import { ensureLangfuseModelPricing } from "./langfuse-model-pricing.js";
import { loggers, type RequestContext } from "../utils/logger.js";

/**
 * Logger instance for conversation tracing.
 */
const logger = loggers.conversation;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickTextField(value: unknown): string | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const directCandidates = [
    value.text,
    value.outputText,
    value.completion,
    value.response
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }

  if (Array.isArray(value.content)) {
    const textParts = value.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (isRecord(part) && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter((part) => part.trim().length > 0);

    if (textParts.length > 0) {
      return textParts.join("\n");
    }
  }

  return undefined;
}

function inferOutputText(outputData: unknown, result: unknown): string | undefined {
  if (typeof outputData === "string" && outputData.trim()) {
    return outputData;
  }

  const fromOutputData = pickTextField(outputData);
  if (fromOutputData) {
    return fromOutputData;
  }

  if (typeof result === "string" && result.trim()) {
    return result;
  }

  return pickTextField(result);
}

/**
 * Tracing context for a conversation flow.
 */
export interface ConversationTraceContext {
  /**
   * OpenTelemetry span for the conversation.
   */
  span?: Span;

  /**
   * Trace context with IDs.
   */
  context: TraceContext;

  /**
   * OpenTelemetry trace identifier from the root span.
   * Useful for correlating with Langfuse trace APIs.
   */
  otelTraceId?: string;

  /**
   * Root observation/span identifier.
   * Useful for score attribution at observation level.
   */
  rootObservationId?: string;

  /**
   * Logger context for structured logging.
   */
  logContext: RequestContext;

  /**
   * Accumulated token usage across all LLM calls in this trace.
   */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedOutputTokens: number;
  };

  /**
   * Optional Langfuse environment for this trace (dev, prod, judge, etc.).
   */
  environment?: string;
}

export interface ConversationTraceOptions {
  /**
   * Human-readable trace name shown in Langfuse.
   */
  name?: string;

  /**
   * Trace tags for filtering in Langfuse.
   */
  tags?: Array<string>;

  /**
   * Langfuse environment for this trace.
   */
  environment?: string;
}

function normalizeTraceTags(tags: Array<string> | undefined): Array<string> {
  if (!tags || tags.length === 0) {
    return [];
  }

  const unique = new Set<string>();
  for (const tag of tags) {
    const normalizedTag = tag.trim();
    if (!normalizedTag) {
      continue;
    }
    unique.add(normalizedTag);
  }

  return Array.from(unique);
}

function normalizeTraceEnvironment(environment: string | undefined): string | undefined {
  if (!environment) {
    return undefined;
  }

  const normalized = environment.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }

  // Langfuse environment regex: ^(?!langfuse)[a-z0-9-_]+$ with max length 40.
  const validPattern = /^(?!langfuse)[a-z0-9-_]+$/u;
  if (!validPattern.test(normalized) || normalized.length > 40) {
    return undefined;
  }

  return normalized;
}

function applyTraceEnvironment(
  span: Span | undefined,
  environment: string | undefined
): void {
  if (!span || !environment) {
    return;
  }

  span.setAttribute(LangfuseOtelSpanAttributes.ENVIRONMENT, environment);
}

/**
 * Creates a tracing context for a conversation.
 *
 * @param chatId - Chat ID from Telegram/WhatsApp
 * @param sessionId - Optional session ID
 * @param messageId - Optional message ID
 * @returns Tracing context for the conversation
 */
export function createConversationTraceContext(
  chatId: string,
  sessionId?: string,
  messageId?: string,
  options?: ConversationTraceOptions
): ConversationTraceContext {
  const traceId = generateTraceId();
  const context: TraceContext = {
    chatId,
    sessionId,
    messageId,
    traceId
  };
  const logContext: RequestContext = {
    traceId,
    chatId,
    sessionId
  };

  const traceName = options?.name?.trim() || "conversation";
  const span = tracingService.startTrace(context, traceName);
  const spanContext = span?.spanContext();
  const tags = normalizeTraceTags(options?.tags);
  const environment = normalizeTraceEnvironment(options?.environment);

  if (span) {
    span.setAttribute(LangfuseOtelSpanAttributes.TRACE_NAME, traceName);
    if (tags.length > 0) {
      span.setAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, tags);
    }
    applyTraceEnvironment(span, environment);
  }

  return {
    span,
    context,
    otelTraceId: spanContext?.traceId,
    rootObservationId: spanContext?.spanId,
    logContext,
    tokenUsage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      estimatedOutputTokens: 0
    },
    environment
  };
}

/**
 * Sets or replaces tags on the root conversation trace.
 */
export function setTraceTags(
  traceContext: ConversationTraceContext,
  tags: Array<string>
): void {
  if (!traceContext.span) {
    return;
  }

  const normalizedTags = normalizeTraceTags(tags);
  traceContext.span.setAttribute(
    LangfuseOtelSpanAttributes.TRACE_TAGS,
    normalizedTags
  );
}

/**
 * Sets or replaces environment on the root conversation trace.
 */
export function setTraceEnvironment(
  traceContext: ConversationTraceContext,
  environment: string
): void {
  const normalized = normalizeTraceEnvironment(environment);
  if (!traceContext.span || !normalized) {
    return;
  }

  traceContext.environment = normalized;
  applyTraceEnvironment(traceContext.span, normalized);
}

/**
 * Runs work with Langfuse correlated trace attributes propagated to child observations.
 * This allows tags/name to be attached consistently across nested spans.
 */
export async function withPropagatedTraceAttributes<T>(
  traceContext: ConversationTraceContext,
  options: ConversationTraceOptions,
  work: () => Promise<T>
): Promise<T> {
  if (!traceContext.span) {
    return work();
  }

  const tags = normalizeTraceTags(options.tags);
  const traceName = options.name?.trim();
  const params: {
    tags?: Array<string>;
    traceName?: string;
  } = {};

  if (tags.length > 0) {
    params.tags = tags;
  }
  if (traceName) {
    params.traceName = traceName;
  }

  const activeWithRootSpan = trace.setSpan(context.active(), traceContext.span);
  return context.with(activeWithRootSpan, () => {
    if (!params.tags && !params.traceName) {
      return work();
    }
    return propagateAttributes(params, work);
  });
}

/**
 * Generates a unique trace ID.
 */
function generateTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Wraps a LangGraph node with tracing.
 *
 * @param nodeName - Name of the node
 * @param traceContext - Tracing context
 * @param nodeFn - Node function to wrap
 * @returns Wrapped function with tracing
 */
export async function withNodeTracing<T>(
  nodeName: string,
  traceContext: ConversationTraceContext,
  nodeFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now();
  let nodeSpan: Span | undefined;

  // Create node span
  if (traceContext.span) {
    nodeSpan = tracingService.traceNode(nodeName, traceContext.span);
    applyTraceEnvironment(nodeSpan, traceContext.environment);
  }

  logger.debug(`Entering node: ${nodeName}`, traceContext.logContext);

  try {
    const result = nodeSpan
      ? await context.with(trace.setSpan(context.active(), nodeSpan), nodeFn)
      : await nodeFn();
    const duration = Date.now() - startTime;

    if (nodeSpan) {
      tracingService.endSpan(nodeSpan, {
        success: true,
        durationMs: duration
      });
    }

    logger.debug(`Completed node: ${nodeName}`, traceContext.logContext, {
      duration: duration
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    if (nodeSpan) {
      tracingService.recordError(nodeSpan, err);
      tracingService.endSpan(nodeSpan, {
        success: false,
        error: err,
        durationMs: duration
      });
    }

    logger.error(
      `Failed in node: ${nodeName}`,
      traceContext.logContext,
      error
    );

    throw error;
  }
}

/**
 * Wraps a synchronous LangGraph node with tracing.
 *
 * @param nodeName - Name of the node
 * @param traceContext - Tracing context
 * @param nodeFn - Node function to wrap
 * @returns Wrapped function with tracing
 */
export function withSyncNodeTracing<T>(
  nodeName: string,
  traceContext: ConversationTraceContext,
  nodeFn: () => T
): T {
  const startTime = Date.now();
  let nodeSpan: Span | undefined;

  // Create node span
  if (traceContext.span) {
    nodeSpan = tracingService.traceNode(nodeName, traceContext.span);
    applyTraceEnvironment(nodeSpan, traceContext.environment);
  }

  logger.debug(`Entering node: ${nodeName}`, traceContext.logContext);

  try {
    const result = nodeSpan
      ? context.with(trace.setSpan(context.active(), nodeSpan), nodeFn)
      : nodeFn();
    const duration = Date.now() - startTime;

    if (nodeSpan) {
      tracingService.endSpan(nodeSpan, {
        success: true,
        durationMs: duration
      });
    }

    logger.debug(`Completed node: ${nodeName}`, traceContext.logContext, {
      duration: duration
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    if (nodeSpan) {
      tracingService.recordError(nodeSpan, err);
      tracingService.endSpan(nodeSpan, {
        success: false,
        error: err,
        durationMs: duration
      });
    }

    logger.error(
      `Failed in node: ${nodeName}`,
      traceContext.logContext,
      error
    );

    throw error;
  }
}

/**
 * Options for LLM tracing.
 */
export interface LlmTracingOptions<T> {
  /**
   * Input data for the LLM call (prompts, messages, etc.)
   * Will be serialized and set as the observation input.
   */
  inputData?: unknown;

  /**
   * Optional function to extract output data from the result.
   * If not provided, the result itself will be used.
   */
  extractOutput?: (result: T) => unknown;

  /**
   * Model name for the LLM call.
   * Required for Langfuse cost calculation.
   */
  model?: string;

  /**
   * Optional usage extractor from provider response.
   * If provided, token usage is normalized and recorded on the span and trace.
   */
  extractUsage?: (result: T) => unknown;
}

/**
 * Traces an LLM API call within a node.
 *
 * @param provider - LLM provider name
 * @param operation - Operation type
 * @param traceContext - Tracing context
 * @param llmFn - LLM function to trace
 * @param options - Optional tracing options including input/output data
 * @returns Result of the LLM call
 */
export async function withLlmTracing<T>(
  provider: string,
  operation: string,
  traceContext: ConversationTraceContext,
  llmFn: () => Promise<T>,
  options?: LlmTracingOptions<T>
): Promise<T> {
  const startTime = Date.now();
  let llmSpan: Span | undefined;

  // Create LLM span with model metadata for cost calculation
  if (traceContext.span) {
    llmSpan = tracingService.traceLlmCall(provider, operation, traceContext.span, {
      model: options?.model
    });
    applyTraceEnvironment(llmSpan, traceContext.environment);
  }

  // Set input attributes on the span for Langfuse
  if (llmSpan && options?.inputData !== undefined) {
    const inputJson = JSON.stringify(options.inputData);
    // Set both Langfuse-specific and generic input attributes
    llmSpan.setAttribute("langfuse.observation.input", inputJson);
    llmSpan.setAttribute("input.value", inputJson);
    // Also set gen_ai.prompt for compatibility
    llmSpan.setAttribute("gen_ai.prompt", inputJson);
  }

  // Set model name on span for Langfuse cost calculation
  if (llmSpan && options?.model) {
    llmSpan.setAttribute("gen_ai.request.model", options.model);
    llmSpan.setAttribute("llm.model", options.model);
    llmSpan.setAttribute("langfuse.observation.model", options.model);
  }

  logger.debug(`Calling LLM: ${provider}.${operation}`, traceContext.logContext);

  try {
    if (options?.model) {
      await ensureLangfuseModelPricing();
    }

    const result = await llmFn();
    const duration = Date.now() - startTime;

    // Set output attributes on the span for Langfuse
    if (llmSpan) {
      const outputData = options?.extractOutput ? options.extractOutput(result) : result;
      const outputJson = JSON.stringify(outputData);
      const outputText = inferOutputText(outputData, result);
      const usagePayload = options?.extractUsage
        ? options.extractUsage(result)
        : (typeof result === "object" && result !== null && "usage" in result)
          ? (result as { usage?: unknown }).usage
          : undefined;
      const normalizedUsage = normalizeTokenUsage(
        usagePayload,
        outputText
      );
      // Set both Langfuse-specific and generic output attributes
      llmSpan.setAttribute("langfuse.observation.output", outputJson);
      llmSpan.setAttribute("output.value", outputJson);
      // Also set gen_ai.completion for compatibility
      llmSpan.setAttribute("gen_ai.completion", outputJson);
      llmSpan.setAttribute(
        "llm.output_tokens_estimated",
        normalizedUsage.estimatedOutputTokens
      );

      tracingService.endSpan(llmSpan, {
        success: true,
        durationMs: duration,
        inputTokens: normalizedUsage.inputTokens,
        outputTokens: normalizedUsage.outputTokens,
        totalTokens: normalizedUsage.totalTokens
      });

      if (usagePayload !== undefined || normalizedUsage.totalTokens > 0) {
        recordTokenUsage(
          traceContext,
          normalizedUsage.inputTokens,
          normalizedUsage.outputTokens,
          options?.model,
          normalizedUsage.estimatedOutputTokens
        );
      }
    }

    logger.info(`LLM call completed: ${provider}.${operation}`, traceContext.logContext, {
      duration: duration
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    if (llmSpan) {
      // Set error as output for visibility
      const errorOutput = { error: err.message, stack: err.stack };
      const errorJson = JSON.stringify(errorOutput);
      llmSpan.setAttribute("langfuse.observation.output", errorJson);
      llmSpan.setAttribute("output.value", errorJson);

      tracingService.recordError(llmSpan, err);
      tracingService.endSpan(llmSpan, {
        success: false,
        error: err,
        durationMs: duration
      });
    }

    logger.error(
      `LLM call failed: ${provider}.${operation}`,
      traceContext.logContext,
      error
    );

    throw error;
  }
}

/**
 * Traces a database operation within a node.
 *
 * @param operation - Database operation type
 * @param traceContext - Tracing context
 * @param dbFn - Database function to trace
 * @param metadata - Optional database metadata
 * @returns Result of the database call
 */
export async function withDatabaseTracing<T>(
  operation: string,
  traceContext: ConversationTraceContext,
  dbFn: () => Promise<T>,
  metadata?: { table?: string; index?: string }
): Promise<T> {
  const startTime = Date.now();
  let dbSpan: Span | undefined;

  // Create database span
  if (traceContext.span) {
    dbSpan = tracingService.traceDatabase(operation, traceContext.span, {
      operation,
      ...metadata
    });
    applyTraceEnvironment(dbSpan, traceContext.environment);
  }

  logger.debug(`Database operation: ${operation}`, traceContext.logContext, metadata);

  try {
    const result = await dbFn();
    const duration = Date.now() - startTime;

    if (dbSpan) {
      tracingService.endSpan(dbSpan, {
        success: true,
        durationMs: duration
      });
    }

    logger.debug(`Database operation completed: ${operation}`, traceContext.logContext, {
      duration: duration,
      ...metadata
    });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    const err = error as Error;

    if (dbSpan) {
      tracingService.recordError(dbSpan, err);
      tracingService.endSpan(dbSpan, {
        success: false,
        error: err,
        durationMs: duration
      });
    }

    logger.error(
      `Database operation failed: ${operation}`,
      traceContext.logContext,
      error,
      metadata
    );

    throw error;
  }
}

/**
 * Sets the input on the root trace span.
 * This is important for Langfuse to capture trace input.
 *
 * @param traceContext - Tracing context
 * @param input - Input data to record
 */
export function setTraceInput(
  traceContext: ConversationTraceContext,
  input: unknown
): void {
  if (traceContext.span) {
    const inputJson = JSON.stringify(input);
    // Set both Langfuse-specific and generic input attributes
    traceContext.span.setAttribute("langfuse.observation.input", inputJson);
    traceContext.span.setAttribute("input.value", inputJson);
  }
}

/**
 * Sets the output on the root trace span.
 * This is important for Langfuse to capture trace output.
 *
 * @param traceContext - Tracing context
 * @param output - Output data to record
 */
export function setTraceOutput(
  traceContext: ConversationTraceContext,
  output: unknown
): void {
  if (traceContext.span) {
    const outputJson = JSON.stringify(output);
    // Set both Langfuse-specific and generic output attributes
    traceContext.span.setAttribute("langfuse.observation.output", outputJson);
    traceContext.span.setAttribute("output.value", outputJson);
  }
}

/**
 * Ends the conversation trace and flushes if needed.
 *
 * @param traceContext - Tracing context to end
 */
export function endConversationTrace(
  traceContext: ConversationTraceContext,
  success: boolean = true
): void {
  if (traceContext.span) {
    tracingService.endSpan(traceContext.span, { success });
  }
}

/**
 * Records token usage on the trace.
 *
 * @param traceContext - Tracing context
 * @param inputTokens - Number of input tokens
 * @param outputTokens - Number of output tokens
 * @param model - Optional model name for cost calculation
 */
export function recordTokenUsage(
  traceContext: ConversationTraceContext,
  inputTokens: number,
  outputTokens: number,
  model?: string,
  estimatedOutputTokens: boolean = false
): void {
  const safeInputTokens = Math.max(0, Math.round(inputTokens));
  const safeOutputTokens = Math.max(0, Math.round(outputTokens));
  const safeTotalTokens = safeInputTokens + safeOutputTokens;

  traceContext.tokenUsage.inputTokens += safeInputTokens;
  traceContext.tokenUsage.outputTokens += safeOutputTokens;
  traceContext.tokenUsage.totalTokens += safeTotalTokens;

  if (estimatedOutputTokens) {
    traceContext.tokenUsage.estimatedOutputTokens += safeOutputTokens;
  }

  if (traceContext.span) {
    // Set token attributes using Langfuse OTel semantic conventions
    // These attribute names are recognized by Langfuse for cost calculation
    tracingService.setAttributes(traceContext.span, {
      // Accumulated totals across the full trace
      "gen_ai.usage.input_tokens": traceContext.tokenUsage.inputTokens,
      "gen_ai.usage.output_tokens": traceContext.tokenUsage.outputTokens,
      "gen_ai.usage.total_tokens": traceContext.tokenUsage.totalTokens,
      // Backward compatibility
      "llm.input_tokens": traceContext.tokenUsage.inputTokens,
      "llm.output_tokens": traceContext.tokenUsage.outputTokens,
      "llm.total_tokens": traceContext.tokenUsage.totalTokens,
      // Debug info
      "llm.output_tokens_estimated_total": traceContext.tokenUsage.estimatedOutputTokens
    });
    
    // Set model name if provided (required for cost calculation)
    if (model) {
      tracingService.setAttributes(traceContext.span, {
        "gen_ai.request.model": model,
        "llm.model": model,
        "langfuse.observation.model": model
      });
    }
  }

  logger.debug("Token usage recorded", traceContext.logContext, {
    inputTokens: safeInputTokens,
    outputTokens: safeOutputTokens,
    totalTokens: safeTotalTokens,
    cumulativeInputTokens: traceContext.tokenUsage.inputTokens,
    cumulativeOutputTokens: traceContext.tokenUsage.outputTokens,
    cumulativeTotalTokens: traceContext.tokenUsage.totalTokens,
    estimatedOutputTokens,
    model
  });
}

/**
 * Returns accumulated token usage for the trace.
 */
export function getTraceTokenUsage(traceContext: ConversationTraceContext): {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedOutputTokens: number;
} {
  return {
    inputTokens: traceContext.tokenUsage.inputTokens,
    outputTokens: traceContext.tokenUsage.outputTokens,
    totalTokens: traceContext.tokenUsage.totalTokens,
    estimatedOutputTokens: traceContext.tokenUsage.estimatedOutputTokens
  };
}

/**
 * Records an intent classification result.
 *
 * @param traceContext - Tracing context
 * @param intent - Detected intent
 * @param confidence - Optional confidence score
 */
export function recordIntentClassification(
  traceContext: ConversationTraceContext,
  intent: string,
  confidence?: number
): void {
  if (traceContext.span) {
    tracingService.setAttributes(traceContext.span, {
      "conversation.intent": intent,
      "conversation.intent_confidence": confidence ?? 1.0
    });
  }

  logger.info(`Intent classified: ${intent}`, traceContext.logContext, {
    intent,
    confidence
  });
}

/**
 * Records an error on the trace.
 *
 * @param traceContext - Tracing context
 * @param error - Error to record
 */
export function recordTraceError(
  traceContext: ConversationTraceContext,
  error: Error
): void {
  if (traceContext.span) {
    tracingService.recordError(traceContext.span, error);
  }

  logger.error("Error in conversation", traceContext.logContext, error);
}

/**
 * Creates a traced version of a conversation assistant.
 *
 * This higher-order function wraps all node executions with tracing.
 */
export function createTracedNodeExecutor(
  traceContext: ConversationTraceContext
) {
  return {
    /**
     * Executes a node with tracing.
     */
    async execute<T>(nodeName: string, fn: () => Promise<T>): Promise<T> {
      return withNodeTracing(nodeName, traceContext, fn);
    },

    /**
     * Executes a sync node with tracing.
     */
    executeSync<T>(nodeName: string, fn: () => T): T {
      return withSyncNodeTracing(nodeName, traceContext, fn);
    },

    /**
     * Executes an LLM call with tracing.
     */
    async executeLlm<T>(
      provider: string,
      operation: string,
      fn: () => Promise<T>,
      options?: LlmTracingOptions<T>
    ): Promise<T> {
      return withLlmTracing(provider, operation, traceContext, fn, options);
    },

    /**
     * Executes a database call with tracing.
     */
    async executeDb<T>(
      operation: string,
      fn: () => Promise<T>,
      metadata?: { table?: string; index?: string }
    ): Promise<T> {
      return withDatabaseTracing(operation, traceContext, fn, metadata);
    },

    /**
     * Records token usage.
     */
    recordTokens(inputTokens: number, outputTokens: number, model?: string): void {
      recordTokenUsage(traceContext, inputTokens, outputTokens, model);
    },

    /**
     * Records intent classification.
     */
    recordIntent(intent: string, confidence?: number): void {
      recordIntentClassification(traceContext, intent, confidence);
    },

    /**
     * Records an error.
     */
    error(error: Error): void {
      recordTraceError(traceContext, error);
    },

    /**
     * Ends the trace.
     */
    end(success: boolean = true): void {
      endConversationTrace(traceContext, success);
    },

    /**
     * Returns current accumulated token usage.
     */
    getTokenUsage() {
      return getTraceTokenUsage(traceContext);
    }
  };
}

/**
 * Node names for the conversation graph.
 */
export const NODE_NAMES = {
  LOAD_SESSION: "load_session",
  CHECK_HANDED_OFF: "check_handed_off",
  ANALYZE_MESSAGE: "analyze_message",
  GREETING_HANDLER: "greeting_handler",
  FAQ_HANDLER: "faq_handler",
  RESOLVE_ORDER_REQUEST: "resolve_order_request",
  ORDER_HANDLER: "order_handler",
  DUPLICATE_HANDLER: "duplicate_handler",
  COMPLAINT_HANDLER: "complaint_handler",
  HANDOFF_HANDLER: "handoff_handler",
  FORMAT_RESPONSE: "format_response"
} as const;

export type NodeName = (typeof NODE_NAMES)[keyof typeof NODE_NAMES];
