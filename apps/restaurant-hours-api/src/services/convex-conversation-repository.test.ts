import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMutation = vi.fn();
const mockQuery = vi.fn();

vi.mock("convex/browser", () => ({
  ConvexHttpClient: vi.fn().mockImplementation(() => ({
    mutation: mockMutation,
    query: mockQuery
  }))
}));

vi.mock("convex/server", () => ({
  anyApi: {
    conversations: {
      getLatestCheckpointBySessionId: "conversations:getLatestCheckpointBySessionId",
      listFaqEntries: "conversations:listFaqEntries",
      listMenuItems: "conversations:listMenuItems",
      listPriceEntries: "conversations:listPriceEntries",
      saveCheckpoint: "conversations:saveCheckpoint",
      updateSessionStatus: "conversations:updateSessionStatus",
      upsertPedidoForSession: "conversations:upsertPedidoForSession",
      upsertSessionByChatId: "conversations:upsertSessionByChatId"
    },
    payments: {
      getActivePaymentConfig: "payments:getActivePaymentConfig"
    }
  }
}));

import { ConvexConversationRepository } from "./convex-conversation-repository.js";

describe("ConvexConversationRepository compatibility retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retries saveCheckpoint without unsupported metadata field", async () => {
    const repository = new ConvexConversationRepository("https://convex.test");

    mockMutation
      .mockRejectedValueOnce(
        new Error(
          "ArgumentValidationError: Object contains extra field `metadata` that is not in the validator."
        )
      )
      .mockResolvedValueOnce({
        id: "checkpoint-1",
        sessionId: "session-1",
        threadId: "thread-1",
        checkpoint: "{}",
        createdAt: 1
      });

    await repository.saveCheckpoint({
      sessionId: "session-1",
      threadId: "thread-1",
      checkpoint: "{}",
      createdAt: 1,
      metadata: "{\"source\":\"input\"}",
      namespace: "restaulang-main",
      ts: "2026-03-06T00:00:00.000Z",
      versions: "{}",
      versionsSeen: "{}"
    });

    expect(mockMutation).toHaveBeenCalledTimes(2);
    expect(mockMutation.mock.calls[0]?.[1]).toHaveProperty("metadata");
    expect(mockMutation.mock.calls[1]?.[1]).not.toHaveProperty("metadata");
  });

  it("retries upsertOrderForSession without unsupported montoAbono field", async () => {
    const repository = new ConvexConversationRepository("https://convex.test");

    mockMutation
      .mockRejectedValueOnce(
        new Error(
          "ArgumentValidationError: Object contains extra field `montoAbono` that is not in the validator."
        )
      )
      .mockResolvedValueOnce({
        id: "pedido-1",
        sessionId: "session-1",
        telefono: "5493870000000",
        items: [],
        direccion: null,
        tipoEntrega: null,
        metodoPago: null,
        nombreCliente: null,
        total: 8500,
        estado: "incompleto",
        createdAt: 1,
        updatedAt: 1
      });

    const result = await repository.upsertOrderForSession({
      sessionId: "session-1",
      telefono: "5493870000000",
      items: [],
      direccion: null,
      tipoEntrega: null,
      metodoPago: null,
      nombreCliente: null,
      montoAbono: 10000,
      total: 8500,
      estado: "incompleto"
    });

    expect(mockMutation).toHaveBeenCalledTimes(2);
    expect(mockMutation.mock.calls[0]?.[1]).toHaveProperty("montoAbono");
    expect(mockMutation.mock.calls[1]?.[1]).not.toHaveProperty("montoAbono");
    expect(result.montoAbono).toBeNull();
  });
});
