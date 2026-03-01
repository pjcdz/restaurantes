import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

describe("POST /telegram/webhook", () => {
  it("sends the assistant reply to the same Telegram chat", async () => {
    const telegramSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Respuesta generada por el asistente.")
    };
    const app = createApp({
      telegramSender,
      assistantService
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
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "777",
      text: "hola"
    });
    expect(telegramSender).toHaveBeenCalledWith({
      chatId: 777,
      text: "Respuesta generada por el asistente."
    });
  });

  it("ignores non-message updates", async () => {
    const telegramSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn()
    };
    const app = createApp({
      telegramSender,
      assistantService
    });

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
    expect(assistantService.handleIncomingMessage).not.toHaveBeenCalled();
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
