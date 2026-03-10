import { describe, expect, it, beforeEach, vi } from "vitest";

import { sendKapsoTextMessage, activateKapsoHandoff } from "./kapso";

describe("Kapso service", () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    // Set KAPSO_API_KEY for testing
    process.env.KAPSO_API_KEY = "test-kapso-api-key";
  });

  it("should send message to Kapso API", async () => {
    mockFetch.mockResolvedValue({
      ok: true
    } as Response);

    await sendKapsoTextMessage({
      phoneNumber: "+5491112345678",
      text: "Test message"
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/messages"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "content-type": "application/json",
          "authorization": expect.stringContaining("Bearer")
        }),
        body: expect.stringContaining("+5491112345678")
      })
    );
  });

  it("should throw error when API request fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    } as Response);

    await expect(
      sendKapsoTextMessage({
        phoneNumber: "+5491112345678",
        text: "Test message"
      })
    ).rejects.toThrow("Kapso sendMessage failed with status 500.");
  });

  it("should activate handoff", async () => {
    mockFetch.mockResolvedValue({
      ok: true
    } as Response);

    await activateKapsoHandoff({
      phoneNumber: "+5491112345678",
      reason: "complaint"
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/v1/handoff"),
      expect.objectContaining({
        method: "POST"
      })
    );
  });

  it("should throw error when handoff activation fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    } as Response);

    await expect(
      activateKapsoHandoff({
        phoneNumber: "+5491112345678",
        reason: "complaint"
      })
    ).rejects.toThrow("Kapso handoff activation failed with status 500.");
  });
});
