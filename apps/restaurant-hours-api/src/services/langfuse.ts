/**
 * Enhanced Langfuse Tracing Service
 *
 * Provides OpenTelemetry-based tracing with Langfuse integration for
 * observability of LLM operations, LangGraph nodes, and external API calls.
 *
 * @module services/langfuse
 */

import type { Tracer, Span, SpanOptions, Attributes, AttributeValue } from "@opentelemetry/api";
import { context, trace, SpanStatusCode } from "@opentelemetry/api";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

import { getLangfuseSettings } from "../config.js";

/**
 * Internal telemetry state containing the provider and tracer.
 */
type LangfuseTelemetryState = {
  provider: NodeTracerProvider;
  tracer: Tracer;
};

/**
 * Cached telemetry state singleton.
 */
let cachedTelemetryState: LangfuseTelemetryState | null | undefined;

/**
 * Context for tracing operations within a conversation.
 */
export interface TraceContext {
  /**
   * Chat ID from Telegram/WhatsApp.
   */
  chatId: string;

  /**
   * Session ID for the conversation.
   */
  sessionId?: string;

  /**
   * Message ID being processed.
   */
  messageId?: string;

  /**
   * Trace ID for correlation.
   */
  traceId?: string;
}

/**
 * Metadata for LLM operations.
 */
export interface LlmMetadata {
  /**
   * Model name used for generation.
   */
  model: string;

  /**
   * Number of input tokens.
   */
  inputTokens?: number;

  /**
   * Number of output tokens.
   */
  outputTokens?: number;

  /**
   * Total tokens used.
   */
  totalTokens?: number;

  /**
   * Latency in milliseconds.
   */
  latencyMs?: number;

  /**
   * Temperature setting.
   */
  temperature?: number;

  /**
   * Max tokens setting.
   */
  maxTokens?: number;
}

/**
 * Metadata for node execution.
 */
export interface NodeMetadata {
  /**
   * Name of the node.
   */
  nodeName: string;

  /**
   * Input state (sanitized).
   */
  input?: Record<string, unknown>;

  /**
   * Output state (sanitized).
   */
  output?: Record<string, unknown>;

  /**
   * Duration in milliseconds.
   */
  durationMs?: number;

  /**
   * Whether the node execution was successful.
   */
  success?: boolean;

  /**
   * Error message if failed.
   */
  error?: string;
}

/**
 * Metadata for database operations.
 */
export interface DatabaseMetadata {
  /**
   * Table being accessed.
   */
  table?: string;

  /**
   * Operation type (query, mutation).
   */
  operation: string;

  /**
   * Index used for queries.
   */
  index?: string;

  /**
   * Duration in milliseconds.
   */
  durationMs?: number;

  /**
   * Number of records affected.
   */
  recordCount?: number;
}

/**
 * Gets the Langfuse tracer if available.
 *
 * @returns The tracer instance or undefined if not configured
 */
export function getLangfuseTracer(): Tracer | undefined {
  const telemetryState = getLangfuseTelemetryState();
  return telemetryState?.tracer;
}

/**
 * Forces a flush of all pending traces to Langfuse.
 * Should be called during graceful shutdown.
 *
 * @returns Promise that resolves when flush is complete
 */
export async function forceFlushLangfuseTelemetry(): Promise<void> {
  const telemetryState = getLangfuseTelemetryState();

  if (!telemetryState) {
    return;
  }

  try {
    await telemetryState.provider.forceFlush();
  } catch (error) {
    console.error("Langfuse telemetry flush failed.", error);
  }
}

/**
 * Executes work and flushes traces afterward.
 * Useful for ensuring traces are sent before process exit.
 *
 * @param work - Async function to execute
 * @returns Result of the work function
 */
export async function flushLangfuseAfter<T>(
  work: () => Promise<T>
): Promise<T> {
  try {
    return await work();
  } finally {
    await forceFlushLangfuseTelemetry();
  }
}

/**
 * Gets or creates the Langfuse telemetry state.
 */
function getLangfuseTelemetryState(): LangfuseTelemetryState | null {
  if (cachedTelemetryState !== undefined) {
    return cachedTelemetryState;
  }

  const settings = getLangfuseSettings();

  if (!settings) {
    cachedTelemetryState = null;
    return null;
  }

  const provider = new NodeTracerProvider({
    spanProcessors: [
      new LangfuseSpanProcessor({
        publicKey: settings.publicKey,
        secretKey: settings.secretKey,
        baseUrl: settings.baseUrl,
        environment: settings.tracingEnvironment,
        release: settings.release
      })
    ]
  });

  cachedTelemetryState = {
    provider,
    tracer: provider.getTracer("restaurant-hours-api")
  };

  return cachedTelemetryState;
}

/**
 * Converts unknown values into OpenTelemetry-compatible attribute values.
 */
function toAttributeValue(value: unknown): AttributeValue | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }

    if (value.every((item) => typeof item === "string")) {
      return value as Array<string>;
    }

    if (value.every((item) => typeof item === "number" && Number.isFinite(item))) {
      return value as Array<number>;
    }

    if (value.every((item) => typeof item === "boolean")) {
      return value as Array<boolean>;
    }

    return JSON.stringify(value);
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("intValue" in record) {
      return toAttributeValue(record.intValue);
    }
    if ("doubleValue" in record) {
      return toAttributeValue(record.doubleValue);
    }
    if ("value" in record) {
      return toAttributeValue(record.value);
    }

    return JSON.stringify(record);
  }

  return undefined;
}

/**
 * Converts a record to OpenTelemetry attributes.
 */
function toAttributes(record: Record<string, unknown>): Attributes {
  const attrs: Attributes = {};
  for (const [key, value] of Object.entries(record)) {
    const attrValue = toAttributeValue(value);
    if (attrValue !== undefined) {
      attrs[key] = attrValue;
    }
  }
  return attrs;
}

/**
 * Langfuse Tracing Service for enhanced observability.
 *
 * Provides methods for creating traces, spans, and tracking metrics
 * for LLM operations, LangGraph nodes, and database calls.
 *
 * @example
 * ```typescript
 * const tracing = new LangfuseTracingService();
 *
 * // Start a trace for a conversation
 * const trace = tracing.startTrace({ chatId: "123", sessionId: "abc" });
 *
 * // Trace a LangGraph node
 * const nodeSpan = tracing.traceNode("intent_classifier", trace);
 * // ... do work ...
 * tracing.endSpan(nodeSpan, { success: true });
 *
 * // Track LLM call
 * const llmSpan = tracing.traceLlmCall("gemini", "generate", trace);
 * // ... call LLM ...
 * tracing.endSpan(llmSpan, { inputTokens: 100, outputTokens: 50 });
 *
 * // Flush and end trace
 * await tracing.flushTraces();
 * ```
 */
export class LangfuseTracingService {
  private tracer: Tracer | undefined;
  private activeSpans: Map<string, Span> = new Map();

  constructor() {
    this.tracer = getLangfuseTracer();
  }

  /**
   * Checks if tracing is enabled.
   */
  isEnabled(): boolean {
    return this.tracer !== undefined;
  }

  /**
   * Starts a new trace for a conversation.
   *
   * @param context - Trace context with chat/session IDs
   * @param name - Optional name for the trace
   * @returns The created span or undefined if tracing is disabled
   */
  startTrace(
    context: TraceContext,
    name: string = "conversation"
  ): Span | undefined {
    if (!this.tracer) {
      return undefined;
    }

    const span = this.tracer.startSpan(`trace.${name}`, {
      attributes: toAttributes({
        "conversation.chat_id": context.chatId,
        "conversation.session_id": context.sessionId ?? "",
        "conversation.message_id": context.messageId ?? "",
        "conversation.trace_id": context.traceId ?? ""
      })
    });

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, span);

    return span;
  }

  /**
   * Creates a span for a LangGraph node execution.
   *
   * @param nodeName - Name of the node being traced
   * @param parentSpan - Optional parent span for nested tracing
   * @param metadata - Optional node metadata
   * @returns The created span or undefined if tracing is disabled
   */
  traceNode(
    nodeName: string,
    parentSpan?: Span,
    metadata?: NodeMetadata
  ): Span | undefined {
    if (!this.tracer) {
      return undefined;
    }

    const ctx = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = this.tracer.startSpan(
      `node.${nodeName}`,
      {
        attributes: toAttributes({
          "node.name": nodeName,
          "node.input": metadata?.input
            ? JSON.stringify(metadata.input)
            : undefined,
          "node.success": metadata?.success ?? true
        })
      },
      ctx
    );

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, span);

    return span;
  }

  /**
   * Creates a span for an LLM API call.
   *
   * @param provider - LLM provider name (e.g., "gemini")
   * @param operation - Operation type (e.g., "generate", "embed")
   * @param parentSpan - Optional parent span
   * @param metadata - Optional LLM metadata
   * @returns The created span or undefined if tracing is disabled
   */
  traceLlmCall(
    provider: string,
    operation: string,
    parentSpan?: Span,
    metadata?: Partial<LlmMetadata>
  ): Span | undefined {
    if (!this.tracer) {
      return undefined;
    }

    const ctx = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = this.tracer.startSpan(
      `llm.${provider}.${operation}`,
      {
        attributes: toAttributes({
          "llm.provider": provider,
          "llm.operation": operation,
          "llm.model": metadata?.model,
          "llm.input_tokens": metadata?.inputTokens,
          "llm.output_tokens": metadata?.outputTokens,
          "llm.total_tokens": metadata?.totalTokens,
          "llm.latency_ms": metadata?.latencyMs,
          "llm.temperature": metadata?.temperature,
          "llm.max_tokens": metadata?.maxTokens
        })
      },
      ctx
    );

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, span);

    return span;
  }

  /**
   * Creates a span for a database operation.
   *
   * @param operation - Operation type (e.g., "query", "mutation")
   * @param parentSpan - Optional parent span
   * @param metadata - Optional database metadata
   * @returns The created span or undefined if tracing is disabled
   */
  traceDatabase(
    operation: string,
    parentSpan?: Span,
    metadata?: DatabaseMetadata
  ): Span | undefined {
    if (!this.tracer) {
      return undefined;
    }

    const ctx = parentSpan
      ? trace.setSpan(context.active(), parentSpan)
      : context.active();

    const span = this.tracer.startSpan(
      `db.${operation}`,
      {
        attributes: toAttributes({
          "db.system": "convex",
          "db.operation": operation,
          "db.table": metadata?.table ?? "",
          "db.index": metadata?.index ?? "",
          "db.duration_ms": metadata?.durationMs ?? 0,
          "db.record_count": metadata?.recordCount ?? 0
        })
      },
      ctx
    );

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, span);

    return span;
  }

  /**
   * Creates a nested span within a parent span.
   *
   * @param name - Name for the span
   * @param parentSpan - Parent span to nest under
   * @param attributes - Optional attributes to add
   * @returns The created span or undefined if tracing is disabled
   */
  span(
    name: string,
    parentSpan: Span,
    attributes?: Record<string, unknown>
  ): Span | undefined {
    if (!this.tracer) {
      return undefined;
    }

    const ctx = trace.setSpan(context.active(), parentSpan);

    const span = this.tracer.startSpan(
      name,
      {
        attributes: attributes ? toAttributes(attributes) : undefined
      },
      ctx
    );

    const spanId = span.spanContext().spanId;
    this.activeSpans.set(spanId, span);

    return span;
  }

  /**
   * Ends a span and records its final state.
   *
   * @param span - The span to end
   * @param metadata - Optional final metadata to record
   */
  endSpan(
    span: Span,
    metadata?: {
      success?: boolean;
      error?: Error;
      durationMs?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
      [key: string]: unknown;
    }
  ): void {
    if (!span) {
      return;
    }

    // Set status based on success
    if (metadata?.error) {
      span.recordException(metadata.error);
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: metadata.error.message
      });
    } else if (metadata?.success === false) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: "Operation failed"
      });
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
    }

    // Add final attributes
    if (metadata?.durationMs !== undefined) {
      span.setAttribute("duration_ms", metadata.durationMs);
    }
    if (metadata?.inputTokens !== undefined) {
      span.setAttribute("llm.input_tokens", metadata.inputTokens);
      span.setAttribute("gen_ai.usage.input_tokens", metadata.inputTokens);
    }
    if (metadata?.outputTokens !== undefined) {
      span.setAttribute("llm.output_tokens", metadata.outputTokens);
      span.setAttribute("gen_ai.usage.output_tokens", metadata.outputTokens);
    }
    if (metadata?.totalTokens !== undefined) {
      span.setAttribute("llm.total_tokens", metadata.totalTokens);
      span.setAttribute("gen_ai.usage.total_tokens", metadata.totalTokens);
    }

    // Add any additional attributes that are primitive values
    for (const [key, value] of Object.entries(metadata ?? {})) {
      if (
        ![
          "success",
          "error",
          "durationMs",
          "inputTokens",
          "outputTokens",
          "totalTokens"
        ].includes(key) &&
        value !== undefined &&
        value !== null
      ) {
        const attrValue = toAttributeValue(value);
        if (attrValue !== undefined) {
          span.setAttribute(key, attrValue);
        }
      }
    }

    const spanId = span.spanContext().spanId;
    this.activeSpans.delete(spanId);

    span.end();
  }

  /**
   * Records an error on a span.
   *
   * @param span - The span to record the error on
   * @param error - The error to record
   */
  recordError(span: Span, error: Error): void {
    if (!span) {
      return;
    }

    span.recordException(error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error.message
    });
  }

  /**
   * Adds an event to a span.
   *
   * @param span - The span to add the event to
   * @param name - Event name
   * @param attributes - Optional event attributes
   */
  addEvent(
    span: Span,
    name: string,
    attributes?: Record<string, unknown>
  ): void {
    if (!span) {
      return;
    }

    span.addEvent(name, attributes ? toAttributes(attributes) : undefined);
  }

  /**
   * Sets attributes on a span.
   *
   * @param span - The span to set attributes on
   * @param attributes - Attributes to set
   */
  setAttributes(span: Span, attributes: Record<string, unknown>): void {
    if (!span) {
      return;
    }

    for (const [key, value] of Object.entries(attributes)) {
      const attrValue = toAttributeValue(value);
      if (attrValue !== undefined) {
        span.setAttribute(key, attrValue);
      }
    }
  }

  /**
   * Flushes all pending traces to Langfuse.
   * Should be called during graceful shutdown.
   */
  async flushTraces(): Promise<void> {
    // End all active spans first
    for (const span of this.activeSpans.values()) {
      span.end();
    }
    this.activeSpans.clear();

    await forceFlushLangfuseTelemetry();
  }

  /**
   * Wraps an async function with tracing.
   *
   * @param name - Name for the span
   * @param fn - Function to execute
   * @param parentSpan - Optional parent span
   * @param attributes - Optional attributes
   * @returns Result of the function
   */
  async withSpan<T>(
    name: string,
    fn: () => Promise<T>,
    parentSpan?: Span,
    attributes?: Record<string, unknown>
  ): Promise<T> {
    const span = parentSpan
      ? this.span(name, parentSpan, attributes)
      : this.tracer?.startSpan(name, {
          attributes: attributes ? toAttributes(attributes) : undefined
        });

    if (!span) {
      return fn();
    }

    const startTime = Date.now();

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.endSpan(span, { success: true, durationMs: duration });
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.endSpan(span, {
        success: false,
        error: error as Error,
        durationMs: duration
      });
      throw error;
    }
  }
}

/**
 * Default tracing service instance.
 */
export const tracingService = new LangfuseTracingService();

/**
 * Convenience function to start a trace.
 */
export function startTrace(
  context: TraceContext,
  name?: string
): Span | undefined {
  return tracingService.startTrace(context, name);
}

/**
 * Convenience function to trace a node.
 */
export function traceNode(
  nodeName: string,
  parentSpan?: Span,
  metadata?: NodeMetadata
): Span | undefined {
  return tracingService.traceNode(nodeName, parentSpan, metadata);
}

/**
 * Convenience function to trace an LLM call.
 */
export function traceLlmCall(
  provider: string,
  operation: string,
  parentSpan?: Span,
  metadata?: Partial<LlmMetadata>
): Span | undefined {
  return tracingService.traceLlmCall(provider, operation, parentSpan, metadata);
}

/**
 * Convenience function to flush traces.
 */
export async function flushTraces(): Promise<void> {
  await tracingService.flushTraces();
}
