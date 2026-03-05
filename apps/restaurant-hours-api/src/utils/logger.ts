/**
 * Structured JSON Logger for Production Hardening
 *
 * Provides structured logging with JSON output for production and
 * pretty-printed output for development. Supports trace ID propagation
 * and contextual logging.
 *
 * @module utils/logger
 */

/**
 * Log levels supported by the logger.
 */
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

/**
 * Numeric mapping for log level comparison.
 */
const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

/**
 * Context information for request tracing.
 */
export interface RequestContext {
  /**
   * Unique identifier for tracing a request through the system.
   */
  traceId: string;

  /**
   * Optional user ID associated with the request.
   */
  userId?: string;

  /**
   * Optional chat ID for Telegram/WhatsApp conversations.
   */
  chatId?: string;

  /**
   * Optional session ID for conversation tracking.
   */
  sessionId?: string;
}

/**
 * Additional metadata for log entries.
 */
export interface LogMetadata {
  /**
   * Duration of an operation in milliseconds.
   */
  duration?: number;

  /**
   * Number of tokens used in LLM operations.
   */
  tokenCount?: number;

  /**
   * Name of the service or component.
   */
  service?: string;

  /**
   * Intent detected in conversation.
   */
  intent?: string;

  /**
   * Error details if applicable.
   */
  error?: {
    name: string;
    message: string;
    stack?: string;
  };

  /**
   * Additional custom fields.
   */
  [key: string]: unknown;
}

/**
 * Structured log entry format.
 */
export interface LogEntry {
  /**
   * ISO 8601 timestamp of the log entry.
   */
  timestamp: string;

  /**
   * Log level.
   */
  level: LogLevel;

  /**
   * Log message.
   */
  message: string;

  /**
   * Service name.
   */
  service: string;

  /**
   * Trace ID for request correlation.
   */
  traceId?: string;

  /**
   * User ID if available.
   */
  userId?: string;

  /**
   * Chat ID if available.
   */
  chatId?: string;

  /**
   * Session ID if available.
   */
  sessionId?: string;

  /**
   * Duration in milliseconds if applicable.
   */
  duration?: number;

  /**
   * Additional metadata.
   */
  metadata?: LogMetadata;
}

/**
 * Logger configuration options.
 */
export interface LoggerConfig {
  /**
   * Minimum log level to output.
   * @default "INFO"
   */
  level: LogLevel;

  /**
   * Output format: "json" for production, "pretty" for development.
   * @default "json"
   */
  format: "json" | "pretty";

  /**
   * Service name to include in log entries.
   */
  service: string;
}

/**
 * Gets the log level from environment variable.
 */
function getLogLevelFromEnv(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toUpperCase();
  if (envLevel && envLevel in LOG_LEVEL_PRIORITY) {
    return envLevel as LogLevel;
  }
  return "INFO";
}

/**
 * Gets the log format from environment variable.
 */
function getLogFormatFromEnv(): "json" | "pretty" {
  const envFormat = process.env.LOG_FORMAT?.toLowerCase();
  if (envFormat === "pretty" || envFormat === "json") {
    return envFormat;
  }
  // Default to pretty in development, json in production
  return process.env.NODE_ENV === "production" ? "json" : "pretty";
}

/**
 * Formats a log entry for pretty output (development).
 */
function formatPretty(entry: LogEntry): string {
  const timestamp = entry.timestamp;
  const level = entry.level.padEnd(5);
  const service = entry.service;
  const tracePart = entry.traceId ? ` [${entry.traceId}]` : "";
  const chatPart = entry.chatId ? ` chat:${entry.chatId}` : "";
  const durationPart =
    entry.duration !== undefined ? ` (${entry.duration}ms)` : "";

  let output = `${timestamp} ${level} [${service}]${tracePart}${chatPart}${durationPart} ${entry.message}`;

  if (entry.metadata && Object.keys(entry.metadata).length > 0) {
    const metaStr = Object.entries(entry.metadata)
      .filter(([key]) => !["service", "traceId", "chatId", "duration"].includes(key))
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join(" ");
    if (metaStr) {
      output += ` | ${metaStr}`;
    }
  }

  if (entry.metadata?.error) {
    output += `\n  Error: ${entry.metadata.error.message}`;
    if (entry.metadata.error.stack) {
      output += `\n  ${entry.metadata.error.stack.split("\n").slice(0, 3).join("\n  ")}`;
    }
  }

  return output;
}

/**
 * Formats a log entry for JSON output (production).
 */
function formatJson(entry: LogEntry): string {
  return JSON.stringify(entry);
}

/**
 * Structured logger with JSON output and trace ID propagation.
 *
 * @example
 * ```typescript
 * const logger = new Logger({ service: "conversation-assistant" });
 *
 * // Simple logging
 * logger.info("Processing message");
 *
 * // With context
 * const ctx = { traceId: "abc123", chatId: "123456789" };
 * logger.info("Message received", ctx);
 *
 * // With metadata
 * logger.info("LLM response generated", ctx, { duration: 1500, tokenCount: 250 });
 *
 * // Error logging
 * logger.error("Failed to process", ctx, { error: err });
 * ```
 */
export class Logger {
  private readonly config: LoggerConfig;

  /**
   * Creates a new Logger instance.
   * @param config - Logger configuration (partial, defaults applied)
   */
  constructor(config: Partial<LoggerConfig> & { service: string }) {
    this.config = {
      level: getLogLevelFromEnv(),
      format: getLogFormatFromEnv(),
      ...config
    };
  }

  /**
   * Gets the current log level.
   */
  getLevel(): LogLevel {
    return this.config.level;
  }

  /**
   * Gets the current output format.
   */
  getFormat(): "json" | "pretty" {
    return this.config.format;
  }

  /**
   * Checks if a log level should be output.
   */
  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.config.level];
  }

  /**
   * Creates a log entry object.
   */
  private createEntry(
    level: LogLevel,
    message: string,
    context?: RequestContext,
    metadata?: LogMetadata
  ): LogEntry {
    return {
      timestamp: new Date().toISOString(),
      level,
      message,
      service: this.config.service,
      traceId: context?.traceId,
      userId: context?.userId,
      chatId: context?.chatId,
      sessionId: context?.sessionId,
      duration: metadata?.duration,
      metadata
    };
  }

  /**
   * Outputs a log entry.
   */
  private log(entry: LogEntry): void {
    if (!this.shouldLog(entry.level)) {
      return;
    }

    const output =
      this.config.format === "json"
        ? formatJson(entry)
        : formatPretty(entry);

    if (entry.level === "ERROR") {
      console.error(output);
    } else if (entry.level === "WARN") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  /**
   * Logs a debug message.
   *
   * @param message - The log message
   * @param context - Optional request context for tracing
   * @param metadata - Optional additional metadata
   */
  debug(
    message: string,
    context?: RequestContext,
    metadata?: LogMetadata
  ): void {
    const entry = this.createEntry("DEBUG", message, context, metadata);
    this.log(entry);
  }

  /**
   * Logs an info message.
   *
   * @param message - The log message
   * @param context - Optional request context for tracing
   * @param metadata - Optional additional metadata
   */
  info(
    message: string,
    context?: RequestContext,
    metadata?: LogMetadata
  ): void {
    const entry = this.createEntry("INFO", message, context, metadata);
    this.log(entry);
  }

  /**
   * Logs a warning message.
   *
   * @param message - The log message
   * @param context - Optional request context for tracing
   * @param metadata - Optional additional metadata
   */
  warn(
    message: string,
    context?: RequestContext,
    metadata?: LogMetadata
  ): void {
    const entry = this.createEntry("WARN", message, context, metadata);
    this.log(entry);
  }

  /**
   * Logs an error message.
   *
   * @param message - The log message
   * @param context - Optional request context for tracing
   * @param error - Optional error object to include
   * @param metadata - Optional additional metadata
   */
  error(
    message: string,
    context?: RequestContext,
    error?: Error | unknown,
    metadata?: LogMetadata
  ): void {
    const errorMeta: LogMetadata | undefined = error
      ? {
          ...metadata,
          error:
            error instanceof Error
              ? {
                  name: error.name,
                  message: error.message,
                  stack: error.stack
                }
              : { name: "UnknownError", message: String(error) }
        }
      : metadata;

    const entry = this.createEntry("ERROR", message, context, errorMeta);
    this.log(entry);
  }

  /**
   * Creates a child logger with additional context.
   *
   * @param context - Context to include in all log entries
   * @returns A new logger bound to the context
   */
  child(context: RequestContext): BoundLogger {
    return new BoundLogger(this, context);
  }

  /**
   * Logs the start of an operation and returns a function to log its completion.
   *
   * @param operation - Name of the operation
   * @param context - Optional request context
   * @returns A function to call when the operation completes
   */
  startTimer(
    operation: string,
    context?: RequestContext
  ): (metadata?: LogMetadata) => void {
    const startTime = Date.now();
    this.debug(`Starting: ${operation}`, context);

    return (metadata?: LogMetadata) => {
      const duration = Date.now() - startTime;
      this.info(`Completed: ${operation}`, context, { ...metadata, duration });
    };
  }
}

/**
 * A logger bound to a specific request context.
 * Automatically includes the context in all log entries.
 */
export class BoundLogger {
  constructor(
    private readonly logger: Logger,
    private readonly context: RequestContext
  ) {}

  /**
   * Logs a debug message with bound context.
   */
  debug(message: string, metadata?: LogMetadata): void {
    this.logger.debug(message, this.context, metadata);
  }

  /**
   * Logs an info message with bound context.
   */
  info(message: string, metadata?: LogMetadata): void {
    this.logger.info(message, this.context, metadata);
  }

  /**
   * Logs a warning message with bound context.
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.logger.warn(message, this.context, metadata);
  }

  /**
   * Logs an error message with bound context.
   */
  error(message: string, error?: Error | unknown, metadata?: LogMetadata): void {
    this.logger.error(message, this.context, error, metadata);
  }

  /**
   * Starts a timer with bound context.
   */
  startTimer(operation: string): (metadata?: LogMetadata) => void {
    return this.logger.startTimer(operation, this.context);
  }
}

/**
 * Generates a unique trace ID.
 * Uses crypto.randomUUID if available, otherwise falls back to timestamp-based ID.
 */
export function generateTraceId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older Node.js versions
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Default logger instance for the application.
 */
export const appLogger = new Logger({ service: "restaurant-hours-api" });

/**
 * Creates a logger for a specific service/component.
 *
 * @param service - Name of the service
 * @returns A new Logger instance
 */
export function createLogger(service: string): Logger {
  return new Logger({ service });
}

/**
 * Pre-configured loggers for common services.
 */
export const loggers = {
  app: appLogger,
  conversation: createLogger("conversation-assistant"),
  convex: createLogger("convex-repository"),
  gemini: createLogger("gemini-api"),
  telegram: createLogger("telegram-webhook"),
  admin: createLogger("admin-routes"),
  resilience: createLogger("resilience")
};
