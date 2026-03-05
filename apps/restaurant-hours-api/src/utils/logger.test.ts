import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  Logger,
  BoundLogger,
  generateTraceId,
  type RequestContext,
  type LogEntry
} from "./logger.js";

// Mock console methods
const originalConsole = {
  log: console.log,
  warn: console.warn,
  error: console.error
};

describe("Logger", () => {
  let logger: Logger;
  let mockConsoleLog: ReturnType<typeof vi.fn>;
  let mockConsoleWarn: ReturnType<typeof vi.fn>;
  let mockConsoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConsoleLog = vi.fn();
    mockConsoleWarn = vi.fn();
    mockConsoleError = vi.fn();
    console.log = mockConsoleLog;
    console.warn = mockConsoleWarn;
    console.error = mockConsoleError;
  });

  afterEach(() => {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
    vi.resetModules();
  });

  describe("constructor and configuration", () => {
    it("creates logger with service name", () => {
      logger = new Logger({ service: "test-service" });
      expect(logger.getLevel()).toBe("INFO"); // Default level
    });

    it("accepts custom log level", () => {
      const originalLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = "DEBUG";
      
      logger = new Logger({ service: "test-service" });
      expect(logger.getLevel()).toBe("DEBUG");
      
      process.env.LOG_LEVEL = originalLevel;
    });

    it("defaults to pretty format in development", () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "development";
      
      logger = new Logger({ service: "test-service" });
      expect(logger.getFormat()).toBe("pretty");
      
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe("log levels", () => {
    beforeEach(() => {
      logger = new Logger({ service: "test-service", level: "DEBUG" });
    });

    it("logs DEBUG messages", () => {
      logger.debug("Debug message");
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it("logs INFO messages", () => {
      logger.info("Info message");
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it("logs WARN messages", () => {
      logger.warn("Warn message");
      expect(mockConsoleWarn).toHaveBeenCalled();
    });

    it("logs ERROR messages", () => {
      logger.error("Error message");
      expect(mockConsoleError).toHaveBeenCalled();
    });

    it("respects log level hierarchy - INFO skips DEBUG", () => {
      const infoLogger = new Logger({ service: "test", level: "INFO" });
      infoLogger.debug("Should not log");
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it("respects log level hierarchy - WARN skips INFO and DEBUG", () => {
      const warnLogger = new Logger({ service: "test", level: "WARN" });
      warnLogger.debug("Should not log");
      warnLogger.info("Should not log");
      expect(mockConsoleLog).not.toHaveBeenCalled();
    });

    it("respects log level hierarchy - ERROR only logs errors", () => {
      const errorLogger = new Logger({ service: "test", level: "ERROR" });
      errorLogger.debug("Should not log");
      errorLogger.info("Should not log");
      errorLogger.warn("Should not log");
      expect(mockConsoleLog).not.toHaveBeenCalled();
      expect(mockConsoleWarn).not.toHaveBeenCalled();
      
      errorLogger.error("Should log");
      expect(mockConsoleError).toHaveBeenCalled();
    });
  });

  describe("JSON format output", () => {
    beforeEach(() => {
      logger = new Logger({
        service: "test-service",
        level: "DEBUG",
        format: "json"
      });
    });

    it("outputs valid JSON for info messages", () => {
      logger.info("Test message");
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed).toHaveProperty("timestamp");
      expect(parsed).toHaveProperty("level", "INFO");
      expect(parsed).toHaveProperty("message", "Test message");
      expect(parsed).toHaveProperty("service", "test-service");
    });

    it("includes trace ID in JSON output", () => {
      const context: RequestContext = { traceId: "trace-123" };
      logger.info("Test message", context);
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.traceId).toBe("trace-123");
    });

    it("includes chat ID in JSON output", () => {
      const context: RequestContext = { traceId: "trace-123", chatId: "chat-456" };
      logger.info("Test message", context);
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.chatId).toBe("chat-456");
    });

    it("includes session ID in JSON output", () => {
      const context: RequestContext = { traceId: "trace-123", sessionId: "session-789" };
      logger.info("Test message", context);
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.sessionId).toBe("session-789");
    });

    it("includes user ID in JSON output", () => {
      const context: RequestContext = { traceId: "trace-123", userId: "user-abc" };
      logger.info("Test message", context);
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.userId).toBe("user-abc");
    });

    it("includes duration in JSON output", () => {
      logger.info("Test message", undefined, { duration: 1500 });
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.duration).toBe(1500);
    });

    it("includes metadata in JSON output", () => {
      logger.info("Test message", undefined, { tokenCount: 250, intent: "order" });
      
      const call = mockConsoleLog.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.metadata.tokenCount).toBe(250);
      expect(parsed.metadata.intent).toBe("order");
    });

    it("includes error details in JSON output", () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test.js:1:1";
      logger.error("Error occurred", undefined, error);
      
      const call = mockConsoleError.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.metadata.error.name).toBe("Error");
      expect(parsed.metadata.error.message).toBe("Test error");
      expect(parsed.metadata.error.stack).toBeDefined();
    });

    it("handles non-Error objects in error parameter", () => {
      logger.error("Error occurred", undefined, "string error");
      
      const call = mockConsoleError.mock.calls[0][0];
      const parsed = JSON.parse(call);
      
      expect(parsed.metadata.error.name).toBe("UnknownError");
      expect(parsed.metadata.error.message).toBe("string error");
    });
  });

  describe("Pretty format output", () => {
    beforeEach(() => {
      logger = new Logger({
        service: "test-service",
        level: "DEBUG",
        format: "pretty"
      });
    });

    it("outputs human-readable format", () => {
      logger.info("Test message");
      
      const output = mockConsoleLog.mock.calls[0][0];
      
      expect(output).toContain("INFO");
      expect(output).toContain("test-service");
      expect(output).toContain("Test message");
    });

    it("includes trace ID in brackets", () => {
      const context: RequestContext = { traceId: "trace-123" };
      logger.info("Test message", context);
      
      const output = mockConsoleLog.mock.calls[0][0];
      
      expect(output).toContain("[trace-123]");
    });

    it("includes chat ID with label", () => {
      const context: RequestContext = { traceId: "trace-123", chatId: "chat-456" };
      logger.info("Test message", context);
      
      const output = mockConsoleLog.mock.calls[0][0];
      
      expect(output).toContain("chat:chat-456");
    });

    it("includes duration in parentheses", () => {
      logger.info("Test message", undefined, { duration: 1500 });
      
      const output = mockConsoleLog.mock.calls[0][0];
      
      expect(output).toContain("(1500ms)");
    });

    it("includes metadata as key=value pairs", () => {
      logger.info("Test message", undefined, { tokenCount: 250 });
      
      const output = mockConsoleLog.mock.calls[0][0];
      
      expect(output).toContain("tokenCount=250");
    });

    it("formats error with stack trace", () => {
      const error = new Error("Test error");
      error.stack = "Error: Test error\n    at test.js:1:1\n    at another.js:2:2";
      logger.error("Error occurred", undefined, error);
      
      const output = mockConsoleError.mock.calls[0][0];
      
      expect(output).toContain("Error: Test error");
      expect(output).toContain("at test.js");
    });
  });

  describe("trace ID propagation", () => {
    beforeEach(() => {
      logger = new Logger({
        service: "test-service",
        level: "DEBUG",
        format: "json"
      });
    });

    it("propagates trace ID through context", () => {
      const context: RequestContext = { traceId: "propagated-trace" };
      logger.info("Message 1", context);
      logger.info("Message 2", context);
      
      const call1 = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      const call2 = JSON.parse(mockConsoleLog.mock.calls[1][0]);
      
      expect(call1.traceId).toBe("propagated-trace");
      expect(call2.traceId).toBe("propagated-trace");
    });

    it("works without context", () => {
      logger.info("No context message");
      
      const call = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      
      expect(call.traceId).toBeUndefined();
    });
  });

  describe("child logger", () => {
    beforeEach(() => {
      logger = new Logger({
        service: "test-service",
        level: "DEBUG",
        format: "json"
      });
    });

    it("creates bound logger with context", () => {
      const context: RequestContext = { traceId: "child-trace", chatId: "child-chat" };
      const child = logger.child(context);
      
      expect(child).toBeInstanceOf(BoundLogger);
    });

    it("child logger includes bound context in all messages", () => {
      const context: RequestContext = { traceId: "child-trace", chatId: "child-chat" };
      const child = logger.child(context);
      
      child.info("Child message");
      
      const call = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      
      expect(call.traceId).toBe("child-trace");
      expect(call.chatId).toBe("child-chat");
    });

    it("child logger inherits parent service name", () => {
      const child = logger.child({ traceId: "test" });
      
      child.info("Message");
      
      const call = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      
      expect(call.service).toBe("test-service");
    });

    it("child logger can add additional metadata", () => {
      const child = logger.child({ traceId: "test" });
      
      child.info("Message", { duration: 100 });
      
      const call = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      
      expect(call.duration).toBe(100);
    });

    it("child logger supports all log levels", () => {
      const child = logger.child({ traceId: "test" });
      
      child.debug("Debug");
      child.info("Info");
      child.warn("Warn");
      child.error("Error");
      
      expect(mockConsoleLog).toHaveBeenCalledTimes(2); // debug and info
      expect(mockConsoleWarn).toHaveBeenCalledTimes(1);
      expect(mockConsoleError).toHaveBeenCalledTimes(1);
    });
  });

  describe("startTimer", () => {
    beforeEach(() => {
      logger = new Logger({
        service: "test-service",
        level: "DEBUG",
        format: "json"
      });
    });

    it("returns a function that logs completion", () => {
      const done = logger.startTimer("test-operation");
      
      expect(typeof done).toBe("function");
    });

    it("logs duration when timer completes", async () => {
      const done = logger.startTimer("test-operation");
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      done();
      
      const completionCall = mockConsoleLog.mock.calls.find(
        (call) => call[0].includes("Completed")
      );
      
      expect(completionCall).toBeDefined();
    });

    it("includes duration in completion log", async () => {
      const done = logger.startTimer("test-operation");
      
      await new Promise((resolve) => setTimeout(resolve, 10));
      
      done();
      
      // Find the completion log (second call)
      const allCalls = mockConsoleLog.mock.calls;
      const completionCall = allCalls[allCalls.length - 1];
      const parsed = JSON.parse(completionCall[0]);
      
      expect(parsed.duration).toBeGreaterThanOrEqual(10);
    });

    it("accepts additional metadata on completion", () => {
      const done = logger.startTimer("test-operation");
      
      done({ tokenCount: 100 });
      
      const allCalls = mockConsoleLog.mock.calls;
      const completionCall = allCalls[allCalls.length - 1];
      const parsed = JSON.parse(completionCall[0]);
      
      expect(parsed.metadata.tokenCount).toBe(100);
    });

    it("works with context", () => {
      const context: RequestContext = { traceId: "timer-trace" };
      const done = logger.startTimer("test-operation", context);
      
      done();
      
      const startCall = JSON.parse(mockConsoleLog.mock.calls[0][0]);
      expect(startCall.traceId).toBe("timer-trace");
    });
  });
});

describe("BoundLogger", () => {
  let logger: Logger;
  let boundLogger: BoundLogger;
  let mockConsoleLog: ReturnType<typeof vi.fn>;
  let mockConsoleError: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockConsoleLog = vi.fn();
    mockConsoleError = vi.fn();
    console.log = mockConsoleLog;
    console.error = mockConsoleError;
    
    logger = new Logger({
      service: "test-service",
      level: "DEBUG",
      format: "json"
    });
    
    boundLogger = new BoundLogger(logger, {
      traceId: "bound-trace",
      chatId: "bound-chat"
    });
  });

  it("logs with bound context", () => {
    boundLogger.info("Bound message");
    
    const call = JSON.parse(mockConsoleLog.mock.calls[0][0]);
    
    expect(call.traceId).toBe("bound-trace");
    expect(call.chatId).toBe("bound-chat");
  });

  it("supports error logging with bound context", () => {
    const error = new Error("Bound error");
    boundLogger.error("Error occurred", error);
    
    const call = JSON.parse(mockConsoleError.mock.calls[0][0]);
    
    expect(call.traceId).toBe("bound-trace");
    expect(call.metadata.error.message).toBe("Bound error");
  });

  it("startTimer returns function with bound context", () => {
    const done = boundLogger.startTimer("bound-operation");
    done();
    
    const calls = mockConsoleLog.mock.calls;
    const startCall = JSON.parse(calls[0][0]);
    
    expect(startCall.traceId).toBe("bound-trace");
  });
});

describe("generateTraceId", () => {
  it("generates a non-empty string", () => {
    const traceId = generateTraceId();
    expect(typeof traceId).toBe("string");
    expect(traceId.length).toBeGreaterThan(0);
  });

  it("generates unique IDs", () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateTraceId());
    }
    expect(ids.size).toBe(100);
  });

  it("uses crypto.randomUUID when available", () => {
    // crypto.randomUUID should be available in modern Node.js
    const traceId = generateTraceId();
    // UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
    expect(traceId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });
});
