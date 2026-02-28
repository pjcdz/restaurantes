import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

describe("POST /telegram/webhook", () => {
  it("sends the availability reply to the same Telegram chat", async () => {
    const telegramSender = vi.fn().mockResolvedValue(undefined);
    const app = createApp({
      now: () => new Date("2026-02-28T15:00:00.000Z"),
      telegramSender
    });

    const response = await request(app)
      .post("/telegram/webhook")
      .send({
        message: {
          chat: {
            id: 777
          },
          text: "hola"
        }
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true
    });
    expect(telegramSender).toHaveBeenCalledWith({
      chatId: 777,
      text: "El restaurante esta abierto."
    });
  });

  it("ignores non-message updates", async () => {
    const telegramSender = vi.fn().mockResolvedValue(undefined);
    const app = createApp({ telegramSender });

    const response = await request(app)
      .post("/telegram/webhook")
      .send({
        update_id: 123
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      ignored: true
    });
    expect(telegramSender).not.toHaveBeenCalled();
  });

  it("rejects invalid Telegram payloads", async () => {
    const app = createApp();

    const response = await request(app).post("/telegram/webhook").send([]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Request body must be a JSON object."
    });
  });
});
