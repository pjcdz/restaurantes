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
      createChatId,
      skipAuth: true
    });

    const response = await request(app).post("/message").send({ message: "hola" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      chatId: "http:generated-1",
      reply: "Respuesta del asistente."
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: "http:generated-1",
      text: "hola",
      tracingEnvironment: "dev"
    });
    expect(createChatId).toHaveBeenCalledTimes(1);
  });

  it("uses the provided chatId when calling the assistant", async () => {
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Seguimos con el pedido.")
    };
    const app = createApp({
      assistantService,
      skipAuth: true
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
      text: "agregame otra clasica",
      tracingEnvironment: "dev"
    });
  });

  it("returns trace and token metrics when detailed assistant response is available", async () => {
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("fallback"),
      handleIncomingMessageDetailed: vi.fn().mockResolvedValue({
        reply: "Respuesta detallada.",
        traceId: "trace-abc",
        tokens: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          estimatedOutputTokens: 0
        }
      })
    };
    const app = createApp({
      assistantService,
      skipAuth: true
    });

    const response = await request(app)
      .post("/message")
      .send({ message: "hola", chatId: "web-123" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      chatId: "web-123",
      reply: "Respuesta detallada.",
      traceId: "trace-abc",
      metrics: {
        tokens: {
          inputTokens: 120,
          outputTokens: 45,
          totalTokens: 165,
          estimatedOutputTokens: 0
        }
      }
    });
    expect(assistantService.handleIncomingMessageDetailed).toHaveBeenCalledWith({
      chatId: "web-123",
      text: "hola",
      tracingEnvironment: "dev"
    });
    expect(assistantService.handleIncomingMessage).not.toHaveBeenCalled();
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
      createChatId,
      skipAuth: true
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
      text: "hola",
      tracingEnvironment: "dev"
    });
    expect(assistantService.handleIncomingMessage).toHaveBeenNthCalledWith(2, {
      chatId: "http:generated-2",
      text: "hola de nuevo",
      tracingEnvironment: "dev"
    });
  });

  it("classifies non-local hosts as prod tracing environment", async () => {
    const assistantService = {
      handleIncomingMessage: vi.fn().mockResolvedValue("Respuesta del asistente.")
    };
    const app = createApp({
      assistantService,
      skipAuth: true
    });

    const response = await request(app)
      .post("/message")
      .set("Host", "api.example.com")
      .send({ message: "hola" });

    expect(response.status).toBe(200);
    expect(assistantService.handleIncomingMessage).toHaveBeenCalledWith({
      chatId: expect.any(String),
      text: "hola",
      tracingEnvironment: "prod"
    });
  });

  it("rejects non-object JSON payloads", async () => {
    const app = createApp({ skipAuth: true });

    const response = await request(app).post("/message").send([]);

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "Request body must be a JSON object."
    });
  });

  it("rejects missing or empty messages", async () => {
    const app = createApp({ skipAuth: true });

    const response = await request(app).post("/message").send({ message: "   " });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: "message must be a non-empty string."
    });
  });
});

describe("GET /admin authentication defaults", () => {
  function buildAdminRepository() {
    return {
      getAdminData: vi.fn().mockResolvedValue({
        products: [],
        faq: []
      }),
      getHandedOffSessions: vi.fn().mockResolvedValue([]),
      reactivateSession: vi.fn().mockResolvedValue(undefined),
      upsertCatalogItem: vi.fn().mockResolvedValue(undefined),
      deleteCatalogItem: vi.fn().mockResolvedValue(undefined),
      upsertFaqEntry: vi.fn().mockResolvedValue(undefined),
      deleteFaqEntry: vi.fn().mockResolvedValue(undefined)
    };
  }

  it("does not require Authorization header in development by default", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;

    try {
      process.env.NODE_ENV = "development";
      process.env.JWT_SECRET = "test-jwt-secret";

      const app = createApp({ adminRepository: buildAdminRepository() });
      const response = await request(app).get("/admin");

      expect(response.status).toBe(200);
      expect(response.type).toMatch(/html/);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalJwtSecret;
      }
    }
  });

  it("requires Authorization header in production by default", async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;
    const originalAllowedOrigins = process.env.ALLOWED_ORIGINS;

    try {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = "test-jwt-secret";
      process.env.ALLOWED_ORIGINS = "https://admin.example.com";

      const app = createApp({ adminRepository: buildAdminRepository() });
      const response = await request(app)
        .get("/admin")
        .set("Origin", "https://admin.example.com");

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        error: "Authorization header is required.",
        code: "MISSING_TOKEN"
      });
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }

      if (originalJwtSecret === undefined) {
        delete process.env.JWT_SECRET;
      } else {
        process.env.JWT_SECRET = originalJwtSecret;
      }

      if (originalAllowedOrigins === undefined) {
        delete process.env.ALLOWED_ORIGINS;
      } else {
        process.env.ALLOWED_ORIGINS = originalAllowedOrigins;
      }
    }
  });
});

describe("GET /admin local access and rendering policy", () => {
  function buildAdminRepository() {
    return {
      getAdminData: vi.fn().mockResolvedValue({
        products: [],
        faq: []
      }),
      getHandedOffSessions: vi.fn().mockResolvedValue([]),
      reactivateSession: vi.fn().mockResolvedValue(undefined),
      upsertCatalogItem: vi.fn().mockResolvedValue(undefined),
      deleteCatalogItem: vi.fn().mockResolvedValue(undefined),
      upsertFaqEntry: vi.fn().mockResolvedValue(undefined),
      deleteFaqEntry: vi.fn().mockResolvedValue(undefined)
    };
  }

  it("rejects admin access when Host is not localhost", async () => {
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "development";
      const app = createApp({ adminRepository: buildAdminRepository() });

      const response = await request(app)
        .get("/admin")
        .set("Host", "admin.example.com");

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        error: "Admin panel is only available from localhost."
      });
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });

  it("serves admin HTML with CSP that allows inline styles and scripts", async () => {
    const originalNodeEnv = process.env.NODE_ENV;

    try {
      process.env.NODE_ENV = "development";
      const app = createApp({ adminRepository: buildAdminRepository() });

      const response = await request(app).get("/admin");
      const csp = String(response.headers["content-security-policy"] ?? "");

      expect(response.status).toBe(200);
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = originalNodeEnv;
      }
    }
  });
});
