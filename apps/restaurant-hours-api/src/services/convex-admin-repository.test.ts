import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listFallbackHandedOffSessions,
  resetFallbackHandedOffSessions,
  setFallbackSessionStatus
} from "./handoff-session-store.js";

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
      deleteCatalogItem: "conversations:deleteCatalogItem",
      deleteFaqEntry: "conversations:deleteFaqEntry",
      listCatalogItemsForAdmin: "conversations:listCatalogItemsForAdmin",
      listFaqEntries: "conversations:listFaqEntries",
      listHandedOffSessions: "conversations:listHandedOffSessions",
      updateSessionStatus: "conversations:updateSessionStatus",
      upsertCatalogItem: "conversations:upsertCatalogItem",
      upsertFaqEntry: "conversations:upsertFaqEntry"
    }
  }
}));

import { ConvexAdminRepository } from "./convex-admin-repository.js";

describe("ConvexAdminRepository compatibility retries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetFallbackHandedOffSessions();
  });

  it("retries upsertCatalogItem without unsupported extra field", async () => {
    const repository = new ConvexAdminRepository("https://convex.test");

    mockMutation
      .mockRejectedValueOnce(
        new Error(
          "ArgumentValidationError: Object contains extra field `aliases` that is not in the validator."
        )
      )
      .mockResolvedValueOnce(undefined);

    await repository.upsertCatalogItem({
      originalItem: null,
      item: "Bacon King",
      descripcion: "Hamburguesa",
      precio: 11200,
      categoria: "burgers",
      disponible: true,
      aliases: ["bacon"]
    });

    expect(mockMutation).toHaveBeenCalledTimes(2);
    expect(mockMutation.mock.calls[0]?.[1]).toHaveProperty("aliases");
    expect(mockMutation.mock.calls[1]?.[1]).not.toHaveProperty("aliases");
  });

  it("retries updateSessionStatus when payload has unsupported field", async () => {
    const repository = new ConvexAdminRepository("https://convex.test");

    mockMutation
      .mockRejectedValueOnce(
        new Error(
          "ArgumentValidationError: Object contains extra field `status` that is not in the validator."
        )
      )
      .mockResolvedValueOnce(undefined);

    await repository.reactivateSession("5493870000000");

    expect(mockMutation).toHaveBeenCalledTimes(2);
    expect(mockMutation.mock.calls[0]?.[1]).toEqual({
      chatId: "5493870000000",
      status: "active"
    });
    expect(mockMutation.mock.calls[1]?.[1]).toEqual({
      chatId: "5493870000000"
    });
  });

  it("returns fallback handed-off sessions when listHandedOffSessions function is unavailable", async () => {
    const repository = new ConvexAdminRepository("https://convex.test");

    setFallbackSessionStatus("5493871111111", "handed_off");
    mockQuery.mockRejectedValueOnce(
      new Error(
        "[Request ID: test] Server Error Could not find public function for 'conversations:listHandedOffSessions'."
      )
    );

    const sessions = await repository.getHandedOffSessions();

    expect(sessions).toEqual([
      expect.objectContaining({
        chatId: "5493871111111",
        phoneNumber: null
      })
    ]);
  });

  it("includes fallback handed-off sessions even when Convex query succeeds with empty data", async () => {
    const repository = new ConvexAdminRepository("https://convex.test");

    setFallbackSessionStatus("5493873333333", "handed_off");
    mockQuery.mockResolvedValueOnce([]);

    const sessions = await repository.getHandedOffSessions();

    expect(sessions).toEqual([
      expect.objectContaining({
        chatId: "5493873333333",
        phoneNumber: null
      })
    ]);
  });

  it("clears local fallback handoff session on reactivation when updateSessionStatus is unavailable", async () => {
    const repository = new ConvexAdminRepository("https://convex.test");

    setFallbackSessionStatus("5493872222222", "handed_off");
    mockMutation.mockRejectedValueOnce(
      new Error(
        "[Request ID: test] Server Error Could not find public function for 'conversations:updateSessionStatus'."
      )
    );

    await repository.reactivateSession("5493872222222");

    expect(listFallbackHandedOffSessions()).toEqual([]);
  });
});
