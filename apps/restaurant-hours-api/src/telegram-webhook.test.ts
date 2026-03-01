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

  it("acknowledges the webhook before the assistant finishes", async () => {
    let resolveReply: ((value: string) => void) | null = null;
    const telegramSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveReply = resolve;
          })
      )
    };
    const app = createApp({
      telegramSender,
      assistantService
    });

    const responseOrTimeout = await Promise.race([
      request(app)
        .post("/telegram/webhook")
        .send({
          message: {
            chat: {
              id: 777
            },
            text: "hola"
          }
        }),
      new Promise<"timeout">((resolve) => {
        setTimeout(() => resolve("timeout"), 50);
      })
    ]);

    expect(responseOrTimeout).not.toBe("timeout");

    if (responseOrTimeout === "timeout") {
      return;
    }

    expect(responseOrTimeout.status).toBe(200);
    expect(responseOrTimeout.body).toEqual({
      ok: true
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "777",
      text: "hola"
    });
    expect(telegramSender).not.toHaveBeenCalled();

    resolveReply?.("Respuesta tardia.");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(telegramSender).toHaveBeenCalledWith({
      chatId: 777,
      text: "Respuesta tardia."
    });
  });

  it("returns 200 even when background processing fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const telegramSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockRejectedValue(new Error("boom"))
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

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(telegramSender).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
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
