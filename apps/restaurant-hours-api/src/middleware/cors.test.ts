import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

import {
  createCorsMiddleware,
  createDevelopmentCorsMiddleware
} from "./cors.js";

// Mock the config module
const mockGetAllowedOrigins = vi.fn();
const mockGetAllowNoOrigin = vi.fn();

vi.mock("../config.js", () => ({
  getAllowedOrigins: () => mockGetAllowedOrigins(),
  getAllowNoOrigin: () => mockGetAllowNoOrigin()
}));

describe("CORS Middleware", () => {
  let app: Express;

  beforeEach(() => {
    vi.clearAllMocks();
    app = express();
  });

  afterEach(() => {
    vi.resetModules();
  });

  describe("createCorsMiddleware", () => {
    describe("with allowed origins configured", () => {
      beforeEach(() => {
        mockGetAllowedOrigins.mockReturnValue([
          "https://example.com",
          "https://admin.example.com"
        ]);
        // Default to allowing no-origin requests for backward compatibility
        mockGetAllowNoOrigin.mockReturnValue(true);
      });

      it("allows requests from allowed origins", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("Origin", "https://example.com");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe(
          "https://example.com"
        );
      });

      it("allows requests from second allowed origin", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("Origin", "https://admin.example.com");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe(
          "https://admin.example.com"
        );
      });

      it("blocks requests from disallowed origins", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));
        // Add error handler for CORS errors
        app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
          if (err.message === "Not allowed by CORS") {
            res.status(403).json({ error: "CORS blocked" });
            return;
          }
          next(err);
        });

        const response = await request(app)
          .get("/test")
          .set("Origin", "https://malicious-site.com");

        // CORS middleware throws error for disallowed origins
        expect(response.status).toBe(403);
      });

      it("sets credentials header to true", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("Origin", "https://example.com");

        expect(response.headers["access-control-allow-credentials"]).toBe(
          "true"
        );
      });

      it("handles preflight OPTIONS requests", async () => {
        app.use(createCorsMiddleware());
        app.post("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .options("/test")
          .set("Origin", "https://example.com")
          .set("Access-Control-Request-Method", "POST");

        expect(response.status).toBe(204);
        expect(response.headers["access-control-allow-origin"]).toBe(
          "https://example.com"
        );
      });

      it("allows specified HTTP methods", async () => {
        app.use(createCorsMiddleware());
        app.post("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .options("/test")
          .set("Origin", "https://example.com")
          .set("Access-Control-Request-Method", "POST");

        const allowMethods = response.headers["access-control-allow-methods"];
        expect(allowMethods).toBeDefined();
        expect(allowMethods).toContain("GET");
        expect(allowMethods).toContain("POST");
        expect(allowMethods).toContain("PUT");
        expect(allowMethods).toContain("DELETE");
        expect(allowMethods).toContain("OPTIONS");
      });

      it("allows Authorization header", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .options("/test")
          .set("Origin", "https://example.com")
          .set("Access-Control-Request-Headers", "Authorization, Content-Type");

        const allowHeaders = response.headers["access-control-allow-headers"];
        expect(allowHeaders).toBeDefined();
        expect(allowHeaders).toContain("Authorization");
        expect(allowHeaders).toContain("Content-Type");
      });

      it("allows Telegram bot API secret token header", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .options("/test")
          .set("Origin", "https://example.com");

        const allowHeaders = response.headers["access-control-allow-headers"];
        expect(allowHeaders).toContain("X-Telegram-Bot-Api-Secret-Token");
      });

      it("sets max-age for preflight cache", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .options("/test")
          .set("Origin", "https://example.com");

        expect(response.headers["access-control-max-age"]).toBe("3600");
      });

      it("exposes Content-Length and X-Request-Id headers", async () => {
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("Origin", "https://example.com");

        const exposedHeaders = response.headers["access-control-expose-headers"];
        expect(exposedHeaders).toBeDefined();
        expect(exposedHeaders).toContain("Content-Length");
        expect(exposedHeaders).toContain("X-Request-Id");
      });
    });

    describe("without allowed origins configured (wildcard mode)", () => {
      beforeEach(() => {
        mockGetAllowedOrigins.mockReturnValue([]);
        mockGetAllowNoOrigin.mockReturnValue(true);
      });

      it("allows all origins when no ALLOWED_ORIGINS set", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("Origin", "https://any-origin.com");

        expect(response.status).toBe(200);
        expect(response.headers["access-control-allow-origin"]).toBe(
          "https://any-origin.com"
        );
        
        warnSpy.mockRestore();
      });

      it("logs warning about missing configuration", async () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        await request(app)
          .get("/test")
          .set("Origin", "https://any-origin.com");

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining("Development mode - allowing all origins")
        );
        
        warnSpy.mockRestore();
      });
    });

    describe("requests without Origin header", () => {
      beforeEach(() => {
        mockGetAllowedOrigins.mockReturnValue(["https://example.com"]);
      });

      it("allows requests without Origin when ALLOW_NO_ORIGIN=true (default)", async () => {
        mockGetAllowNoOrigin.mockReturnValue(true);
        
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ ok: true });
      });

      it("rejects requests without Origin when ALLOW_NO_ORIGIN=false", async () => {
        mockGetAllowNoOrigin.mockReturnValue(false);
        
        app.use(createCorsMiddleware());
        app.get("/test", (req, res) => res.json({ ok: true }));
        // Add error handler for CORS errors
        app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
          if (err.message === "Origin header required") {
            res.status(403).json({ error: "Origin header required" });
            return;
          }
          next(err);
        });

        const response = await request(app).get("/test");

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ error: "Origin header required" });
      });
    });
  });

  describe("createDevelopmentCorsMiddleware", () => {
    it("allows all origins in development", async () => {
      app.use(createDevelopmentCorsMiddleware());
      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .get("/test")
        .set("Origin", "https://any-random-origin.com");

      expect(response.status).toBe(200);
      expect(response.headers["access-control-allow-origin"]).toBe(
        "https://any-random-origin.com"
      );
    });

    it("sets credentials to true", async () => {
      app.use(createDevelopmentCorsMiddleware());
      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .get("/test")
        .set("Origin", "https://example.com");

      expect(response.headers["access-control-allow-credentials"]).toBe(
        "true"
      );
    });

    it("allows common HTTP methods", async () => {
      app.use(createDevelopmentCorsMiddleware());
      app.post("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .options("/test")
        .set("Origin", "https://example.com");

      const allowMethods = response.headers["access-control-allow-methods"];
      expect(allowMethods).toContain("GET");
      expect(allowMethods).toContain("POST");
    });

    it("allows Authorization and Content-Type headers", async () => {
      app.use(createDevelopmentCorsMiddleware());
      app.get("/test", (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .options("/test")
        .set("Origin", "https://example.com");

      const allowHeaders = response.headers["access-control-allow-headers"];
      expect(allowHeaders).toContain("Authorization");
      expect(allowHeaders).toContain("Content-Type");
    });
  });
});
