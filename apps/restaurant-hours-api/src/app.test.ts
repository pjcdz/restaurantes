import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app";

describe("POST /message", () => {
  it("returns the assistant reply payload with a generated chatId", async () => {
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Respuesta del asistente.")
    };
    const createChatId = vi.fn(() => "generated-1");
    const app = createApp({
      assistantService,
      createChatId
    });

    const response = await request(app).post("/message").send({ message: "hola" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      chatId: "http:generated-1",
      reply: "Respuesta del asistente."
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "http:generated-1",
      text: "hola"
    });
    expect(createChatId).toHaveBeenCalledTimes(1);
  });

  it("uses the provided chatId when calling the assistant", async () => {
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Seguimos con el pedido.")
    };
    const app = createApp({
      assistantService
    });

    const response = await request(app)
      .post("/message")
      .send({ message: "agregame otra clasica", chatId: "web-123" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      chatId: "web-123",
      reply: "Seguimos con el pedido."
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "web-123",
      text: "agregame otra clasica"
    });
  });

  it("generates a new chatId for each request when none is provided", async () => {
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Ok")
    };
    const createChatId = vi
      .fn()
      .mockReturnValueOnce("generated-1")
      .mockReturnValueOnce("generated-2");
    const app = createApp({
      assistantService,
      createChatId
    });

    const firstResponse = await request(app).post("/message").send({ message: "hola" });
    const secondResponse = await request(app).post("/message").send({ message: "hola de nuevo" });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(firstResponse.body).toEqual({
      chatId: "http:generated-1",
      reply: "Ok"
    });
    expect(secondResponse.body).toEqual({
      chatId: "http:generated-2",
      reply: "Ok"
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenNthCalledWith(1, {
      chatId: "http:generated-1",
      text: "hola"
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenNthCalledWith(2, {
      chatId: "http:generated-2",
      text: "hola de nuevo"
    });
  });

  it("rejects non-object JSON payloads", async () => {
    const app = createApp();

    const response = await request(app).post("/message").send([]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Request body must be a JSON object."
    });
  });

  it("rejects missing or empty messages", async () => {
    const app = createApp();

    const response = await request(app).post("/message").send({ message: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "message must be a non-empty string."
    });
  });
});
