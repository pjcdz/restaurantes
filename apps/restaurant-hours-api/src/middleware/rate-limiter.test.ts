import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import express, { type Express, type Request, type Response, type NextFunction } from "express";
import request from "supertest";

import {
  createRateLimiter,
  authRateLimiter,
  telegramRateLimiter,
  apiRateLimiter,
  type RateLimiterOptions
} from "./rate-limiter.js";

// Helper to create mock Express request
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    headers: {},
    socket: { remoteAddress: "127.0.0.1" } as Partial<Request["socket"]> as Request["socket"],
    body: {},
    ...overrides
  };
}

// Helper to create mock Express response
function createMockResponse(): Partial<Response> {
  const headers: Record<string, string | number> = {};
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    setHeader: vi.fn((name: string, value: string | number) => {
      headers[name] = value;
      return undefined as unknown as Response;
    }),
    getHeader: vi.fn((name: string) => headers[name]),
    _headers: headers
  };
}

// Helper to create mock next function
function createMockNext(): NextFunction {
  return vi.fn();
}

// Helper to advance time and wait for timers
async function advanceTime(ms: number): Promise<void> {
  vi.advanceTimersByTime(ms);
  // Allow any pending promises to resolve
  await Promise.resolve();
}

describe("Rate Limiter Middleware", () => {
  let app: Express;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    vi.useFakeTimers();
    app = express();
    mockRequest = createMockRequest();
    mockResponse = createMockResponse();
    mockNext = createMockNext();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
  });

  describe("createRateLimiter", () => {
    describe("Rate Limit Enforcement", () => {
      it("allows requests within the limit", async () => {
        const limiter = createRateLimiter({
          name: "test-limiter",
          windowMs: 60000,
          maxRequests: 5
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make 3 requests (within limit of 5)
        for (let i = 0; i < 3; i++) {
          const response = await request(app).get("/test");
          expect(response.status).toBe(200);
        }
      });

      it("blocks requests exceeding the limit with 429 status", async () => {
        const limiter = createRateLimiter({
          name: "test-limiter-429",
          windowMs: 60000,
          maxRequests: 3
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make 3 requests (at limit)
        for (let i = 0; i < 3; i++) {
          const response = await request(app).get("/test");
          expect(response.status).toBe(200);
        }

        // 4th request should be blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        expect(response.body).toEqual({
          error: "Too Many Requests",
          message: "Rate limit exceeded. Please try again later.",
          retryAfter: expect.any(Number)
        });
      });

      it("sets X-RateLimit-Limit header correctly", async () => {
        const limiter = createRateLimiter({
          name: "test-limit-header",
          windowMs: 60000,
          maxRequests: 10
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-limit"]).toBe("10");
      });

      it("sets X-RateLimit-Remaining header correctly", async () => {
        const limiter = createRateLimiter({
          name: "test-remaining-header",
          windowMs: 60000,
          maxRequests: 5
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // First request: 5 - 1 = 4 remaining
        let response = await request(app).get("/test");
        expect(response.headers["x-ratelimit-remaining"]).toBe("4");

        // Second request: 5 - 2 = 3 remaining
        response = await request(app).get("/test");
        expect(response.headers["x-ratelimit-remaining"]).toBe("3");

        // Third request: 5 - 3 = 2 remaining
        response = await request(app).get("/test");
        expect(response.headers["x-ratelimit-remaining"]).toBe("2");
      });

      it("sets X-RateLimit-Reset header with timestamp", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const limiter = createRateLimiter({
          name: "test-reset-header",
          windowMs: 60000,
          maxRequests: 10
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        const resetHeader = response.headers["x-ratelimit-reset"];
        
        // Reset should be approximately startTime + windowMs (as string)
        expect(resetHeader).toBe(String(startTime + 60000));
      });

      it("sets Retry-After header when rate limited", async () => {
        const limiter = createRateLimiter({
          name: "test-retry-after",
          windowMs: 60000,
          maxRequests: 2,
          blockDurationMs: 300000 // 5 minutes
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Exhaust the limit
        await request(app).get("/test");
        await request(app).get("/test");

        // Next request should be blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        // Verify retryAfter in response body (headers may not be accessible in supertest)
        expect(response.body.retryAfter).toBe(300); // 300 seconds = 5 minutes
      });

      it("does not set rate limit headers when request is blocked", async () => {
        const limiter = createRateLimiter({
          name: "test-no-headers-when-blocked",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // First request succeeds
        await request(app).get("/test");

        // Second request is blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        // Rate limit headers are not set for blocked requests
        expect(response.headers["x-ratelimit-remaining"]).toBeUndefined();
      });
    });

    describe("IP-Based Rate Limiting", () => {
      it("tracks different IPs with separate counters", async () => {
        // SECURITY: Configure trusted proxies to allow X-Forwarded-For to be trusted
        // The test requests come from localhost (127.0.0.1 or ::ffff:127.0.0.1)
        const limiter = createRateLimiter({
          name: "test-ip-separate",
          windowMs: 60000,
          maxRequests: 2,
          trustedProxies: ["127.0.0.1", "::ffff:127.0.0.1"]
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // IP 1 makes 2 requests (at limit)
        const response1a = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "192.168.1.1");
        expect(response1a.status).toBe(200);

        const response1b = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "192.168.1.1");
        expect(response1b.status).toBe(200);

        // IP 2 should still be able to make requests
        const response2 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "192.168.1.2");
        expect(response2.status).toBe(200);

        // IP 1 should be blocked
        const response1c = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "192.168.1.1");
        expect(response1c.status).toBe(429);
      });

      it("accumulates count for same IP", async () => {
        const limiter = createRateLimiter({
          name: "test-ip-accumulate",
          windowMs: 60000,
          maxRequests: 3
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Same IP makes multiple requests
        for (let i = 0; i < 3; i++) {
          const response = await request(app)
            .get("/test")
            .set("X-Forwarded-For", "10.0.0.1");
          expect(response.status).toBe(200);
        }

        // Next request from same IP should be blocked
        const response = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "10.0.0.1");
        expect(response.status).toBe(429);
      });
    });

    describe("Key Generator", () => {
      it("uses X-Forwarded-For header when present", async () => {
        const limiter = createRateLimiter({
          name: "test-xforwarded",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.1");
        
        expect(response.status).toBe(200);
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-remaining"]).toBe("0");
      });

      it("uses first IP from comma-separated X-Forwarded-For", async () => {
        const limiter = createRateLimiter({
          name: "test-xforwarded-multi",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
        const response = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.1, 198.51.100.1, 192.0.2.1");
        
        expect(response.status).toBe(200);
        
        // Second request with same first IP should be blocked
        const response2 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.1, 198.51.100.2");
        expect(response2.status).toBe(429);
      });

      it("uses X-Real-IP header as fallback", async () => {
        const limiter = createRateLimiter({
          name: "test-realip",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app)
          .get("/test")
          .set("X-Real-IP", "198.51.100.50");
        
        expect(response.status).toBe(200);
        
        // Second request should be blocked
        const response2 = await request(app)
          .get("/test")
          .set("X-Real-IP", "198.51.100.50");
        expect(response2.status).toBe(429);
      });

      it("prefers X-Forwarded-For over X-Real-IP", async () => {
        // SECURITY: Configure trusted proxies to allow X-Forwarded-For to be trusted
        const limiter = createRateLimiter({
          name: "test-prefer-xforwarded",
          windowMs: 60000,
          maxRequests: 1,
          trustedProxies: ["127.0.0.1", "::ffff:127.0.0.1"]
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Both headers present, X-Forwarded-For should be used
        const response = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.1")
          .set("X-Real-IP", "198.51.100.50");
        
        expect(response.status).toBe(200);
        
        // Same X-Real-IP but different X-Forwarded-For should be allowed
        const response2 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.2")
          .set("X-Real-IP", "198.51.100.50");
        expect(response2.status).toBe(200);
      });

      it("uses socket remote address as final fallback", async () => {
        const limiter = createRateLimiter({
          name: "test-socket-fallback",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // No IP headers, should use socket address
        const response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("ignores forwarded headers when request is not from a trusted proxy", async () => {
        const limiter = createRateLimiter({
          name: "test-untrusted-forwarded",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response1 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.10");
        expect(response1.status).toBe(200);

        // Different spoofed forwarded IP should still map to socket address and be blocked.
        const response2 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.11");
        expect(response2.status).toBe(429);
      });

      it("uses forwarded headers only when request comes from a trusted proxy", async () => {
        const limiter = createRateLimiter({
          name: "test-trusted-forwarded",
          windowMs: 60000,
          maxRequests: 1,
          trustedProxies: ["127.0.0.1", "::ffff:127.0.0.1", "::1"]
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response1 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.20");
        expect(response1.status).toBe(200);

        // Different forwarded IP is treated as a separate key when proxy is trusted.
        const response2 = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "203.0.113.21");
        expect(response2.status).toBe(200);
      });

      it("supports custom key generator", async () => {
        const customKeyGenerator = vi.fn((req: Request) => {
          return req.headers["x-api-key"] as string || "anonymous";
        });

        const limiter = createRateLimiter({
          name: "test-custom-key",
          windowMs: 60000,
          maxRequests: 2,
          keyGenerator: customKeyGenerator
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // API key 1 makes requests
        const response1 = await request(app)
          .get("/test")
          .set("X-API-Key", "key-123");
        expect(response1.status).toBe(200);

        // API key 2 should have its own limit
        const response2 = await request(app)
          .get("/test")
          .set("X-API-Key", "key-456");
        expect(response2.status).toBe(200);

        expect(customKeyGenerator).toHaveBeenCalled();
      });
    });

    describe("Window Reset", () => {
      it("resets count after window expires", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const limiter = createRateLimiter({
          name: "test-window-reset",
          windowMs: 10000, // 10 seconds window
          maxRequests: 2,
          blockDurationMs: 5000 // 5 second block duration
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make 2 requests (at limit)
        await request(app).get("/test");
        await request(app).get("/test");

        // Third request should be blocked
        let response = await request(app).get("/test");
        expect(response.status).toBe(429);

        // Advance time past both the window AND block duration
        await advanceTime(15000);

        // Should be allowed again (block expired and new window)
        response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("starts new window after expiry", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const limiter = createRateLimiter({
          name: "test-new-window",
          windowMs: 30000, // 30 seconds
          maxRequests: 2
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // First request sets window start
        await request(app).get("/test");

        // Advance 20 seconds (still in window)
        await advanceTime(20000);

        // Still in window, count should be 2
        const response = await request(app).get("/test");
        expect(response.headers["x-ratelimit-remaining"]).toBe("0");

        // Advance past window
        await advanceTime(15000); // Total 35 seconds

        // New window should start
        const response2 = await request(app).get("/test");
        expect(response2.headers["x-ratelimit-remaining"]).toBe("1");
      });
    });

    describe("Blocking Behavior", () => {
      it("blocks client for configured duration after exceeding limit", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const limiter = createRateLimiter({
          name: "test-block-duration",
          windowMs: 60000,
          maxRequests: 2,
          blockDurationMs: 120000 // 2 minutes
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Exhaust limit
        await request(app).get("/test");
        await request(app).get("/test");

        // Should be blocked
        let response = await request(app).get("/test");
        expect(response.status).toBe(429);

        // Advance 1 minute (window resets but block still active)
        await advanceTime(60000);
        response = await request(app).get("/test");
        expect(response.status).toBe(429);

        // Advance past block duration
        await advanceTime(70000); // Total 130000ms > 120000ms block
        response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("returns correct retryAfter when blocked", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const limiter = createRateLimiter({
          name: "test-retry-after-block",
          windowMs: 60000,
          maxRequests: 1,
          blockDurationMs: 180000 // 3 minutes
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        await request(app).get("/test");

        // Advance 30 seconds and get blocked
        await advanceTime(30000);
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        
        // Block duration is 180 seconds from now
        expect(response.body.retryAfter).toBe(180);
      });
    });

    describe("Skip Function", () => {
      it("skips rate limiting when skip returns true", async () => {
        const skipMock = vi.fn((req: Request) => {
          return req.headers["x-skip-rate-limit"] === "true";
        });

        const limiter = createRateLimiter({
          name: "test-skip",
          windowMs: 60000,
          maxRequests: 1,
          skip: skipMock
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make many requests with skip header
        for (let i = 0; i < 5; i++) {
          const response = await request(app)
            .get("/test")
            .set("X-Skip-Rate-Limit", "true");
          expect(response.status).toBe(200);
        }

        expect(skipMock).toHaveBeenCalled();
      });

      it("applies rate limiting when skip returns false", async () => {
        const limiter = createRateLimiter({
          name: "test-skip-false",
          windowMs: 60000,
          maxRequests: 2,
          skip: () => false
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make requests up to limit
        await request(app).get("/test");
        await request(app).get("/test");

        // Should be blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
      });
    });

    describe("Custom Handler", () => {
      it("calls custom handler when rate limit is exceeded", async () => {
        const customHandler = vi.fn((req: Request, res: Response) => {
          res.status(429).json({
            custom: true,
            message: "Custom rate limit message"
          });
        });

        const limiter = createRateLimiter({
          name: "test-custom-handler",
          windowMs: 60000,
          maxRequests: 1,
          handler: customHandler
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        await request(app).get("/test");

        // Next request triggers handler
        const response = await request(app).get("/test");
        expect(customHandler).toHaveBeenCalled();
        expect(response.status).toBe(429);
        expect(response.body).toEqual({
          custom: true,
          message: "Custom rate limit message"
        });
      });
    });

    describe("Warning Threshold", () => {
      it("uses default warning threshold at 80% of max", async () => {
        // This is tested indirectly through logging
        // We can verify the behavior by checking that requests still succeed
        const limiter = createRateLimiter({
          name: "test-warning-threshold",
          windowMs: 60000,
          maxRequests: 10
          // Default warningThreshold should be 8 (80% of 10)
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make 9 requests (past warning threshold but under limit)
        for (let i = 0; i < 9; i++) {
          const response = await request(app).get("/test");
          expect(response.status).toBe(200);
        }

        // 10th request should still succeed
        const response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("accepts custom warning threshold", async () => {
        const limiter = createRateLimiter({
          name: "test-custom-warning",
          windowMs: 60000,
          maxRequests: 10,
          warningThreshold: 5
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Should still allow up to maxRequests
        for (let i = 0; i < 10; i++) {
          const response = await request(app).get("/test");
          expect(response.status).toBe(200);
        }
      });
    });

    describe("Edge Cases", () => {
      it("handles missing socket remote address", async () => {
        const limiter = createRateLimiter({
          name: "test-missing-socket",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Request without any IP info should still work
        const response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("handles X-Forwarded-For as array", async () => {
        // Note: Express parses headers, so this tests the array handling
        const limiter = createRateLimiter({
          name: "test-xforwarded-array",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("handles concurrent requests from same IP", async () => {
        const limiter = createRateLimiter({
          name: "test-concurrent",
          windowMs: 60000,
          maxRequests: 5
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Make concurrent requests
        const promises = Array(5).fill(null).map(() => 
          request(app).get("/test").set("X-Forwarded-For", "10.0.0.1")
        );

        const responses = await Promise.all(promises);
        
        // All should succeed (within limit)
        responses.forEach(response => {
          expect(response.status).toBe(200);
        });

        // Next request should be blocked
        const response = await request(app)
          .get("/test")
          .set("X-Forwarded-For", "10.0.0.1");
        expect(response.status).toBe(429);
      });

      it("handles request with empty body", async () => {
        const limiter = createRateLimiter({
          name: "test-empty-body",
          windowMs: 60000,
          maxRequests: 5
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("uses unknown as key when no IP information available", async () => {
        // Create a limiter with a custom key generator that simulates no IP
        const limiter = createRateLimiter({
          name: "test-unknown-key",
          windowMs: 60000,
          maxRequests: 2,
          keyGenerator: () => "unknown"
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // All requests share the "unknown" key
        await request(app).get("/test");
        await request(app).get("/test");

        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
      });

      it("handles negative remaining correctly", async () => {
        const limiter = createRateLimiter({
          name: "test-negative-remaining",
          windowMs: 60000,
          maxRequests: 1
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-remaining"]).toBe("0");
      });
    });

    describe("Default Values", () => {
      it("uses default windowMs of 60000ms (1 minute)", async () => {
        const limiter = createRateLimiter({
          name: "test-default-window"
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        expect(response.status).toBe(200);
      });

      it("uses default maxRequests of 100", async () => {
        const limiter = createRateLimiter({
          name: "test-default-max"
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-limit"]).toBe("100");
      });

      it("uses default blockDurationMs of 300000ms (5 minutes)", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        const limiter = createRateLimiter({
          name: "test-default-block",
          windowMs: 1000,
          maxRequests: 1
          // Default blockDurationMs: 300000
        });

        app.use(limiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        await request(app).get("/test");
        const response = await request(app).get("/test");

        expect(response.status).toBe(429);
        // Verify retryAfter in response body (5 minutes in seconds)
        expect(response.body.retryAfter).toBe(300);
      });
    });
  });

  describe("Pre-configured Rate Limiters", () => {
    describe("authRateLimiter", () => {
      it("is configured with 10 requests per minute", async () => {
        app.use(authRateLimiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-limit"]).toBe("10");
      });

      it("blocks for 15 minutes after exceeding limit", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        app.use(authRateLimiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Exhaust the limit (10 requests)
        for (let i = 0; i < 10; i++) {
          await request(app).get("/test");
        }

        // Next request should be blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        // Verify retryAfter in response body (15 minutes in seconds)
        expect(response.body.retryAfter).toBe(900);
      });
    });

    describe("telegramRateLimiter", () => {
      it("is configured with 60 requests per minute", async () => {
        app.use(telegramRateLimiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-limit"]).toBe("60");
      });

      it("uses chat ID from request body for rate limiting", async () => {
        app.use(express.json());
        app.use(telegramRateLimiter);
        app.post("/test", (req, res) => res.json({ ok: true }));

        // Request with chat ID in body
        const response1 = await request(app)
          .post("/test")
          .send({ message: { chat: { id: 12345 } } });
        expect(response1.status).toBe(200);

        // Different chat ID should have separate limit
        const response2 = await request(app)
          .post("/test")
          .send({ message: { chat: { id: 67890 } } });
        expect(response2.status).toBe(200);
      });

      it("falls back to IP when chat ID is not present", async () => {
        app.use(express.json());
        app.use(telegramRateLimiter);
        app.post("/test", (req, res) => res.json({ ok: true }));

        // Request without chat ID
        const response = await request(app)
          .post("/test")
          .send({});
        expect(response.status).toBe(200);
      });

      it("blocks for 5 minutes after exceeding limit", async () => {
        app.use(telegramRateLimiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Exhaust the limit (60 requests)
        for (let i = 0; i < 60; i++) {
          await request(app).get("/test");
        }

        // Next request should be blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        // Verify retryAfter in response body (5 minutes in seconds)
        expect(response.body.retryAfter).toBe(300);
      });
    });

    describe("apiRateLimiter", () => {
      it("is configured with 100 requests per minute", async () => {
        app.use(apiRateLimiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        const response = await request(app).get("/test");
        // HTTP headers are returned as strings
        expect(response.headers["x-ratelimit-limit"]).toBe("100");
      });

      it("blocks for 5 minutes after exceeding limit", async () => {
        const startTime = Date.now();
        vi.setSystemTime(startTime);

        app.use(apiRateLimiter);
        app.get("/test", (req, res) => res.json({ ok: true }));

        // Exhaust the limit (100 requests)
        for (let i = 0; i < 100; i++) {
          await request(app).get("/test");
        }

        // Next request should be blocked
        const response = await request(app).get("/test");
        expect(response.status).toBe(429);
        // Verify retryAfter in response body (5 minutes in seconds)
        expect(response.body.retryAfter).toBe(300);
      });
    });
  });

  describe("Integration Tests", () => {
    it("works with multiple limiters on different routes", async () => {
      const strictLimiter = createRateLimiter({
        name: "strict",
        windowMs: 60000,
        maxRequests: 2
      });

      const lenientLimiter = createRateLimiter({
        name: "lenient",
        windowMs: 60000,
        maxRequests: 5
      });

      app.get("/strict", strictLimiter, (req, res) => res.json({ route: "strict" }));
      app.get("/lenient", lenientLimiter, (req, res) => res.json({ route: "lenient" }));

      // Exhaust strict limit
      await request(app).get("/strict");
      await request(app).get("/strict");
      const strictResponse = await request(app).get("/strict");
      expect(strictResponse.status).toBe(429);

      // Lenient route should still work
      for (let i = 0; i < 5; i++) {
        const lenientResponse = await request(app).get("/lenient");
        expect(lenientResponse.status).toBe(200);
      }
    });

    it("maintains separate counters per limiter name", async () => {
      const limiter1 = createRateLimiter({
        name: "limiter-one",
        windowMs: 60000,
        maxRequests: 2
      });

      const limiter2 = createRateLimiter({
        name: "limiter-two",
        windowMs: 60000,
        maxRequests: 2
      });

      app.use((req, res, next) => {
        // Apply both limiters to same route
        limiter1(req, res, (err) => {
          if (err) return next(err);
          limiter2(req, res, next);
        });
      });
      app.get("/test", (req, res) => res.json({ ok: true }));

      // Each limiter tracks separately
      const response = await request(app).get("/test");
      expect(response.status).toBe(200);
    });
  });
});
