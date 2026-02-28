import { describe, expect, it, vi } from "vitest";

import { sendTelegramTextMessage } from "./telegram";

describe("sendTelegramTextMessage", () => {
  it("posts the message to Telegram Bot API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200
    });

    await sendTelegramTextMessage(
      {
        token: "test-token",
        chatId: 12345,
        text: "El restaurante esta abierto."
      },
      fetchMock
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.telegram.org/bottest-token/sendMessage",
      {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          chat_id: 12345,
          text: "El restaurante esta abierto."
        })
      }
    );
  });
});
