/**
 * Rate Limiter Middleware for Production Hardening
 *
 * SEC-3: Provides rate limiting to protect against brute-force attacks
 * on authentication endpoints and other sensitive routes.
 *
 * @module middleware/rate-limiter
 */

import { type Request, type Response, type NextFunction } from "express";
import { Logger } from "../utils/logger.js";

/**
 * Logger instance for rate limiter middleware.
 */
const logger = new Logger({ service: "rate-limiter" });

/**
 * Entry tracking requests per client.
 */
interface RateLimitEntry {
  /** Timestamp of the first request in the current window */
  windowStart: number;
  /** Number of requests in the current window */
  count: number;
  /** Timestamp when the client will be unblocked (if blocked) */
  blockedUntil?: number;
}

/**
 * Configuration options for rate limiter.
 */
export interface RateLimiterOptions {
  /**
   * Unique identifier for this rate limiter instance.
   * Used in logging and error messages.
   */
  name: string;

  /**
   * Time window in milliseconds for counting requests.
   * @default 60000 (1 minute)
   */
  windowMs?: number;

  /**
   * Maximum number of requests allowed per window per client.
   * @default 100
   */
  maxRequests?: number;

  /**
   * Number of requests to allow before starting to log warnings.
   * @default 80 (80% of default max)
   */
  warningThreshold?: number;

  /**
   * Duration to block client after exceeding limit, in milliseconds.
   * @default 300000 (5 minutes)
   */
  blockDurationMs?: number;

  /**
   * Function to extract client identifier from request.
   * Defaults to IP address.
   */
  keyGenerator?: (request: Request) => string;

  /**
   * Whether to skip rate limiting for certain requests.
   */
  skip?: (request: Request) => boolean;

  /**
   * Custom handler for when rate limit is exceeded.
   */
  handler?: (request: Request, response: Response) => void;

  /**
   * List of trusted proxy IP addresses.
   * Only trust X-Forwarded-For and X-Real-IP headers when the request
   * comes from a trusted proxy (e.g., load balancer, reverse proxy).
   *
   * SECURITY: Without this validation, attackers can spoof their IP
   * by setting these headers directly, bypassing rate limits.
   *
   * Can be set via TRUSTED_PROXIES environment variable (comma-separated).
   * @default [] (no proxies trusted)
   */
  trustedProxies?: string[];
}

/**
 * Parses trusted proxies from environment variable.
 * Supports comma-separated list of IP addresses.
 * @returns Array of trusted proxy IPs, or empty array if not configured
 */
function parseTrustedProxiesFromEnv(): string[] {
  const envValue = process.env.TRUSTED_PROXIES;
  if (!envValue || envValue.trim() === "") {
    return [];
  }
  return envValue
    .split(",")
    .map((ip) => ip.trim())
    .filter((ip) => ip.length > 0);
}

/**
 * Global trusted proxies configuration from environment.
 * Loaded once at module initialization for performance.
 */
const globalTrustedProxies = parseTrustedProxiesFromEnv();

/**
 * Creates a key generator function with trusted proxy validation.
 *
 * SECURITY: This function only trusts X-Forwarded-For and X-Real-IP headers
 * when the request originates from a trusted proxy IP. This prevents
 * attackers from spoofing these headers to bypass rate limits.
 *
 * @param trustedProxies - List of trusted proxy IP addresses
 * @returns A key generator function
 */
function createKeyGenerator(trustedProxies: string[]): (request: Request) => string {
  return (request: Request): string => {
    const socketIp = request.socket?.remoteAddress;
    
    // Only trust proxy headers if request comes from a trusted proxy
    // This prevents IP spoofing attacks via header injection
    if (trustedProxies.length > 0 && socketIp && trustedProxies.includes(socketIp)) {
      // Try X-Forwarded-For header first (standard proxy header)
      const forwarded = request.headers["x-forwarded-for"];
      if (typeof forwarded === "string") {
        // Take the first IP in the chain (original client IP)
        const forwardedIp = forwarded.split(",")[0]?.trim();
        if (forwardedIp) {
          return forwardedIp;
        }
      }
      if (Array.isArray(forwarded) && forwarded.length > 0) {
        const forwardedIp = forwarded[0]?.split(",")[0]?.trim();
        if (forwardedIp) {
          return forwardedIp;
        }
      }

      // Try X-Real-IP header (used by some proxies like nginx)
      const realIp = request.headers["x-real-ip"];
      if (typeof realIp === "string") {
        const realIpTrimmed = realIp.trim();
        if (realIpTrimmed) {
          return realIpTrimmed;
        }
      }
    }

    // Fallback to socket address - this is the most reliable source
    // when we can't trust proxy headers
    return socketIp ?? "unknown";
  };
}

/**
 * Default key generator using IP address with trusted proxy validation.
 * Uses global trusted proxies from TRUSTED_PROXIES environment variable.
 */
const defaultKeyGenerator = createKeyGenerator(globalTrustedProxies);

/**
 * In-memory store for rate limit entries.
 *
 * IMPORTANT: Multi-Instance Deployment Limitation
 * -----------------------------------------------
 * This in-memory store does NOT coordinate rate limits across multiple API instances.
 * In a deployment with N instances, a client could make N * maxRequests requests per minute.
 *
 * For production deployments with multiple instances, consider:
 * 1. Using a Redis-based distributed rate limiter
 * 2. Using sticky sessions (session affinity) at the load balancer level
 * 3. Deploying a single instance with horizontal scaling via auto-scaling groups
 *
 * The current implementation is suitable for:
 * - Single-instance deployments
 * - Development and testing environments
 * - Deployments with sticky sessions enabled
 */
const stores = new Map<string, Map<string, RateLimitEntry>>();

/**
 * Gets or creates a store for a rate limiter instance.
 */
function getStore(name: string): Map<string, RateLimitEntry> {
  if (!stores.has(name)) {
    stores.set(name, new Map());
  }
  return stores.get(name)!;
}

/**
 * Cleans up expired entries from a store.
 */
function cleanupStore(store: Map<string, RateLimitEntry>, now: number): void {
  for (const [key, entry] of store.entries()) {
    // Remove entries that are no longer blocked and have expired windows
    if (entry.blockedUntil && entry.blockedUntil < now) {
      store.delete(key);
    } else if (!entry.blockedUntil && entry.windowStart < now - 3600000) {
      // Remove entries older than 1 hour that aren't blocked
      store.delete(key);
    }
  }
}

/**
 * Creates a rate limiter middleware.
 *
 * @param options - Rate limiter configuration options
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * // Create rate limiter for authentication endpoints
 * const authLimiter = createRateLimiter({
 *   name: "auth",
 *   windowMs: 60000,     // 1 minute
 *   maxRequests: 10,     // 10 requests per minute
 *   blockDurationMs: 300000  // Block for 5 minutes
 * });
 *
 * // Apply to routes
 * app.post("/admin/login", authLimiter, loginHandler);
 * ```
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const {
    name,
    windowMs = 60000,
    maxRequests = 100,
    warningThreshold = Math.floor(maxRequests * 0.8),
    blockDurationMs = 300000,
    // Use provided trustedProxies or fall back to global from environment
    trustedProxies = globalTrustedProxies,
    // Use provided keyGenerator or create one with trusted proxy support
    keyGenerator,
    skip = () => false,
    handler
  } = options;

  // Create key generator with trusted proxy validation if not provided
  const effectiveKeyGenerator = keyGenerator ?? createKeyGenerator(trustedProxies);

  const store = getStore(name);

  // Periodic cleanup (every 5 minutes)
  const cleanupInterval = setInterval(() => {
    cleanupStore(store, Date.now());
  }, 300000);

  // Prevent the interval from keeping the process alive
  cleanupInterval.unref();

  logger.info("Rate limiter initialized", undefined, {
    name,
    windowMs,
    maxRequests,
    blockDurationMs,
    trustedProxiesConfigured: trustedProxies.length > 0
  });

  return async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    // Skip rate limiting if configured
    if (skip(request)) {
      next();
      return;
    }

    const key = effectiveKeyGenerator(request);
    const now = Date.now();

    // Get or create entry
    let entry = store.get(key);

    // Check if currently blocked
    if (entry?.blockedUntil && entry.blockedUntil > now) {
      const remainingMs = entry.blockedUntil - now;
      logger.warn("Rate limit exceeded - request blocked", undefined, {
        limiter: name,
        key,
        remainingMs,
        blocked: true
      });

      if (handler) {
        handler(request, response);
        return;
      }

      response.setHeader("Retry-After", Math.ceil(remainingMs / 1000));
      response.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil(remainingMs / 1000)
      });
      return;
    }

    // Reset window if expired
    if (!entry || entry.windowStart < now - windowMs) {
      entry = {
        windowStart: now,
        count: 0
      };
      store.set(key, entry);
    }

    // Increment count
    entry.count++;

    // Check if approaching limit
    if (entry.count >= warningThreshold && entry.count < maxRequests) {
      logger.warn("Rate limit approaching threshold", undefined, {
        limiter: name,
        key,
        count: entry.count,
        maxRequests
      });
    }

    // Check if limit exceeded
    if (entry.count > maxRequests) {
      entry.blockedUntil = now + blockDurationMs;

      logger.error("Rate limit exceeded - blocking client", undefined, undefined, {
        limiter: name,
        key,
        count: entry.count,
        maxRequests,
        blockDurationMs
      });

      if (handler) {
        handler(request, response);
        return;
      }

      response.setHeader("Retry-After", Math.ceil(blockDurationMs / 1000));
      response.status(429).json({
        error: "Too Many Requests",
        message: "Rate limit exceeded. Please try again later.",
        retryAfter: Math.ceil(blockDurationMs / 1000)
      });
      return;
    }

    // Add rate limit headers
    response.setHeader("X-RateLimit-Limit", maxRequests);
    response.setHeader("X-RateLimit-Remaining", Math.max(0, maxRequests - entry.count));
    response.setHeader("X-RateLimit-Reset", entry.windowStart + windowMs);

    next();
  };
}

/**
 * Pre-configured rate limiter for authentication endpoints.
 * SEC-3: Protects against brute-force attacks on JWT authentication.
 *
 * - 10 requests per minute per IP
 * - Blocks for 15 minutes after exceeding limit
 */
export const authRateLimiter = createRateLimiter({
  name: "auth",
  windowMs: 60000,        // 1 minute
  maxRequests: 10,        // 10 requests per minute
  blockDurationMs: 900000 // 15 minutes
});

/**
 * Pre-configured rate limiter for Telegram webhook.
 * More lenient to handle legitimate message bursts.
 *
 * - 60 requests per minute per chat
 * - Blocks for 5 minutes after exceeding limit
 */
export const telegramRateLimiter = createRateLimiter({
  name: "telegram-webhook",
  windowMs: 60000,        // 1 minute
  maxRequests: 60,        // 60 requests per minute
  blockDurationMs: 300000, // 5 minutes
  keyGenerator: (request) => {
    // Rate limit by chat ID from request body
    const chatId = (request.body as { message?: { chat?: { id?: number } } })?.message?.chat?.id;
    return chatId ? `chat:${chatId}` : defaultKeyGenerator(request);
  }
});

/**
 * Pre-configured rate limiter for general API endpoints.
 *
 * - 100 requests per minute per IP
 * - Blocks for 5 minutes after exceeding limit
 */
export const apiRateLimiter = createRateLimiter({
  name: "api",
  windowMs: 60000,        // 1 minute
  maxRequests: 100,       // 100 requests per minute
  blockDurationMs: 300000 // 5 minutes
});

/**
 * Pre-configured rate limiter for Kapso webhook.
 * More lenient to handle legitimate message bursts.
 * Rate limits by session ID or phone number from request body.
 *
 * - 60 requests per minute per session
 * - Blocks for 5 minutes after exceeding limit
 */
export const kapsoRateLimiter = createRateLimiter({
  name: "kapso-webhook",
  windowMs: 60000,        // 1 minute
  maxRequests: 60,        // 60 requests per minute
  blockDurationMs: 300000, // 5 minutes
  keyGenerator: (request) => {
    // Extract session ID or phone number from Kapso payload
    const sessionId = (request.body as { sessionId?: string })?.sessionId;
    const phoneNumber = (request.body as { phoneNumber?: string })?.phoneNumber;
    return sessionId ? `session:${sessionId}` : phoneNumber ? `phone:${phoneNumber}` : defaultKeyGenerator(request);
  }
});
