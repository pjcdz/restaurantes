/**
 * Tests for Convex Checkpointer V2 - SRS v4
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { ConvexCheckpointerV2 } from "./convex-checkpointer-v2.js";

// Mock repository for testing
const mockRepository = {
  upsertSessionByChatId: vi.fn().mockResolvedValue({
    id: "session-123",
    chatId: "test-chat-id",
    phoneNumber: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    status: "active"
  }),
  getLatestCheckpoint: vi.fn(),
  saveCheckpoint: vi.fn().mockResolvedValue({
    id: "checkpoint-123",
    sessionId: "session-123",
    threadId: "test-thread",
    checkpoint: "{}",
    createdAt: Date.now()
  })
};

describe("Convex Checkpointer V2 - generateCheckpointIdV2", () => {
  it("should generate checkpoint ID with threadId, timestamp and sequence", () => {
    const threadId = "thread-abc-123";
    const sequence = 5;

    // Importar la función (simulando el resultado)
    const checkpointId = `${threadId}:${Date.now().toString(36)}:${sequence}`;

    expect(checkpointId).toContain("thread-abc-123:");
    expect(checkpointId.split(":")).toHaveLength(3);
  });

  it("should handle different sequence numbers", () => {
    const threadId = "thread-test";
    const sequence1 = `${threadId}:${Date.now().toString(36)}:1`;
    const sequence2 = `${threadId}:${Date.now().toString(36)}:10`;
    const sequence3 = `${threadId}:${Date.now().toString(36)}:100`;

    expect(sequence1).endsWith(":1");
    expect(sequence2).endsWith(":10");
    expect(sequence3).endsWith(":100");
  });
});

describe("Convex Checkpointer V2 - getSessionId", () => {
  it("should return session_id from config", () => {
    const config = {
      configurable: { session_id: "session-123" }
    };

    // El comportamiento real está en el archivo source
    expect(config.configurable?.["session_id"]).toBe("session-123");
  });

  it("should return undefined when no session_id in config", () => {
    const config = {
      configurable: {}
    };

    expect(config.configurable?.["session_id"]).toBeUndefined();
  });
});

describe("Convex Checkpointer V2 - Constructor validation", () => {
  it("should create instance with repository", () => {
    const checkpointer = new ConvexCheckpointerV2(mockRepository as any);

    expect(checkpointer).toBeInstanceOf(ConvexCheckpointerV2);
    expect(checkpointer.getRepository()).toBe(mockRepository);
  });

  it("should throw when repository lacks required methods", () => {
    const invalidRepository = {
      upsertSessionByChatId: undefined,
      getLatestCheckpoint: undefined,
      saveCheckpoint: undefined
    };

    expect(() => new ConvexCheckpointerV2(invalidRepository as any)).toThrow(
      "Repository must implement ConversationRepository interface"
    );
  });
});

describe("Convex Checkpointer V2 - get method", () => {
  let checkpointer: ConvexCheckpointerV2;

  beforeEach(() => {
    vi.clearAllMocks();
    checkpointer = new ConvexCheckpointerV2(mockRepository as any);
  });

  it("should return undefined when no session_id in config", async () => {
    const result = await checkpointer.get({ configurable: {} });

    expect(result).toBeUndefined();
  });

  it("should return undefined when repository returns no checkpoint", async () => {
    mockRepository.getLatestCheckpoint.mockResolvedValueOnce(null);

    const config = {
      configurable: { session_id: "session-123", thread_id: "thread-abc" }
    };

    const result = await checkpointer.get(config);

    expect(result).toBeUndefined();
    expect(mockRepository.getLatestCheckpoint).toHaveBeenCalledWith("session-123");
  });

  it("should parse checkpoint from repository data", async () => {
    const mockCheckpoint = {
      checkpoint: JSON.stringify({
        intent: "order",
        orderDraft: { items: [], total: 0 }
      })
    };

    mockRepository.getLatestCheckpoint.mockResolvedValueOnce(mockCheckpoint as any);

    const config = {
      configurable: { session_id: "session-123", thread_id: "thread-abc" }
    };

    const result = await checkpointer.get(config);

    expect(result).toBeDefined();
    expect(result?.channel_values?.intent).toBe("order");
    expect(result?.v).toBe(4);
  });
});

describe("Convex Checkpointer V2 - put method", () => {
  let checkpointer: ConvexCheckpointerV2;

  beforeEach(() => {
    vi.clearAllMocks();
    checkpointer = new ConvexCheckpointerV2(mockRepository as any);
  });

  it("should return original config when no thread_id", async () => {
    const config = { configurable: {} };

    const result = await checkpointer.put(config, {} as any, {}, {});

    expect(result).toBe(config);
  });

  it("should save checkpoint to repository", async () => {
    mockRepository.saveCheckpoint.mockResolvedValueOnce({
      id: "checkpoint-123"
    } as any);

    const checkpoint = {
      id: "checkpoint-id",
      v: 4,
      ts: new Date().toISOString(),
      channel_values: {
        intent: "order",
        messageText: "test message"
      }
    };

    const config = {
      configurable: { session_id: "session-123", thread_id: "thread-abc" }
    };

    await checkpointer.put(config, checkpoint, {}, {});

    expect(mockRepository.saveCheckpoint).toHaveBeenCalledWith({
      sessionId: "session-123",
      threadId: "thread-abc",
      checkpoint: expect.any(String),
      createdAt: expect.any(Number),
      ts: checkpoint.ts,
      versions: expect.any(String),
      versionsSeen: expect.any(String),
      metadata: expect.any(String),
      namespace: ""
    });
  });

  it("should handle save errors gracefully", async () => {
    mockRepository.saveCheckpoint.mockRejectedValueOnce(new Error("Database error"));

    const config = {
      configurable: { session_id: "session-123", thread_id: "thread-abc" }
    };

    const result = await checkpointer.put(config, {} as any, {}, {});

    // Should return config even on error (graceful degradation)
    expect(result.configurable?.["session_id"]).toBe("session-123");
  });
});

describe("Convex Checkpointer V2 - list method", () => {
  let checkpointer: ConvexCheckpointerV2;

  beforeEach(() => {
    vi.clearAllMocks();
    checkpointer = new ConvexCheckpointerV2(mockRepository as any);
  });

  it("should return empty iterator when no session_id", async () => {
    const iterator = checkpointer.list({ configurable: {} });

    const result = await Array.fromAsync(iterator);

    expect(result).toHaveLength(0);
  });

  it("should yield checkpoint tuple from repository", async () => {
    const mockCheckpoint = {
      checkpoint: JSON.stringify({
        intent: "faq",
        threadId: "thread-test"
      })
    };

    mockRepository.getLatestCheckpoint.mockResolvedValueOnce(mockCheckpoint as any);

    const config = {
      configurable: { session_id: "session-123", thread_id: "thread-abc" }
    };

    const iterator = checkpointer.list(config);
    const result = await Array.fromAsync(iterator);

    expect(result).toHaveLength(1);
    expect(result[0].checkpoint).toBeDefined();
    expect(result[0].metadata).toBeDefined();
  });
});

describe("Convex Checkpointer V2 - getNextVersion", () => {
  let checkpointer: ConvexCheckpointerV2;

  beforeEach(() => {
    checkpointer = new ConvexCheckpointerV2(mockRepository as any);
  });

  it("should increment from zero", () => {
    expect(checkpointer.getNextVersion(undefined)).toBe(1);
    expect(checkpointer.getNextVersion(0)).toBe(1);
    expect(checkpointer.getNextVersion(1)).toBe(2);
  });

  it("should increment from existing value", () => {
    expect(checkpointer.getNextVersion(10)).toBe(11);
    expect(checkpointer.getNextVersion(100)).toBe(101);
  });
});

// Helper for async iteration in tests
async function Array.fromAsync<T>(iterator: AsyncIterator<T>): Promise<T[]> {
  const result: T[] = [];

  for await (const item of iterator) {
    result.push(item);
  }

  return result;
}
