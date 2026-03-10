import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

describe("POST /kapso/webhook", () => {
  it("sends assistant reply to Kapso WhatsApp", async () => {
    const kapsoSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Respuesta generada por el asistente.")
    };
    const app = createApp({
      kapsoSender,
      assistantService,
      skipAuth: true,
      skipSignatureValidation: true
    });

    const response = await request(app)
      .post("/kapso/webhook")
      .send({
        phoneNumber: "+5491112345678",
        message: "hola"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "whatsapp:+5491112345678",
      text: "hola",
      tracingEnvironment: "dev"
    });
    expect(kapsoSender).toHaveBeenCalledWith({
      phoneNumber: "+5491112345678",
      text: "Respuesta generada por el asistente."
    });
  });

  it("does not send Kapso messages when assistant reply is empty", async () => {
    const kapsoSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("")
    };
    const app = createApp({
      kapsoSender,
      assistantService,
      skipAuth: true,
      skipSignatureValidation: true
    });

    const response = await request(app)
      .post("/kapso/webhook")
      .send({
        phoneNumber: "+5491112345678",
        message: "hola"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "whatsapp:+5491112345678",
      text: "hola",
      tracingEnvironment: "dev"
    });
    expect(kapsoSender).not.toHaveBeenCalled();
  });

  it("acknowledges webhook before assistant finishes", async () => {
    let resolveReply: ((value: string) => void) | null = null;
    const kapsoSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveReply = resolve;
          })
      )
    };
    const app = createApp({
      kapsoSender,
      assistantService,
      skipAuth: true,
      skipSignatureValidation: true
    });

    const responseOrTimeout = await Promise.race([
      request(app)
        .post("/kapso/webhook")
        .send({
          phoneNumber: "+5491112345678",
          message: "hola"
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
      chatId: "whatsapp:+5491112345678",
      text: "hola",
      tracingEnvironment: "dev"
    });
    expect(kapsoSender).not.toHaveBeenCalled();

    resolveReply?.("Respuesta tardia.");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(kapsoSender).toHaveBeenCalledWith({
      phoneNumber: "+5491112345678",
      text: "Respuesta tardia."
    });
  });

  it("returns 200 even when background processing fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const kapsoSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn().mockRejectedValue(new Error("boom"))
    };
    const app = createApp({
      kapsoSender,
      assistantService,
      skipAuth: true,
      skipSignatureValidation: true
    });

    const response = await request(app)
      .post("/kapso/webhook")
      .send({
        phoneNumber: "+5491112345678",
        message: "hola"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true
    });

    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });

    expect(kapsoSender).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("ignores requests without phone number", async () => {
    const kapsoSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn()
    };
    const app = createApp({
      kapsoSender,
      assistantService,
      skipAuth: true,
      skipSignatureValidation: true
    });

    const response = await request(app)
      .post("/kapso/webhook")
      .send({
        message: "hola"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      ignored: true
    });
    expect(assistantService.handleIncomingMessage).not.toHaveBeenCalled();
    expect(kapsoSender).not.toHaveBeenCalled();
  });

  it("ignores requests without message", async () => {
    const kapsoSender = vi.fn().mockResolvedValue(undefined);
    const assistantService = {
      handleIncomingMessage: vi.fn()
    };
    const app = createApp({
      kapsoSender,
      assistantService,
      skipAuth: true,
      skipSignatureValidation: true
    });

    const response = await request(app)
      .post("/kapso/webhook")
      .send({
        phoneNumber: "+5491112345678"
      });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      ignored: true
    });
    expect(assistantService.handleIncomingMessage).not.toHaveBeenCalled();
    expect(kapsoSender).not.toHaveBeenCalled();
  });

  it("rejects invalid payloads", async () => {
    const app = createApp({ skipAuth: true, skipSignatureValidation: true });

    const response = await request(app).post("/kapso/webhook").send([]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Request body must be a JSON object."
    });
  });

  it("rejects requests without signature validation in production", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";

    try {
      expect(() =>
        createApp({
          skipAuth: true,
          skipSignatureValidation: true
        })
      ).toThrow(
        "SECURITY: skipSignatureValidation option is not allowed in production environment"
      );
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
