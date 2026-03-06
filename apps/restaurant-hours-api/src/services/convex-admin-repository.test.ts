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
});
