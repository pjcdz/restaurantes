import cors, { type CorsOptions } from "cors";

import { getAllowedOrigins, getAllowNoOrigin } from "../config.js";
import { Logger } from "../utils/logger.js";

/**
 * Logger instance for CORS middleware.
 */
const logger = new Logger({ service: "cors-middleware" });

/**
 * CORS configuration options for the API.
 *
 * Configures Cross-Origin Resource Sharing (CORS) to allow requests
 * from specified origins while blocking unauthorized cross-origin access.
 *
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS
 */

/**
 * Creates CORS middleware with environment-based origin configuration.
 *
 * Reads allowed origins from the ALLOWED_ORIGINS environment variable
 * (comma-separated list) and configures CORS accordingly.
 *
 * Security features:
 * - Only allows requests from configured origins
 * - SEC-2: Rejects all requests in production if no origins configured
 * - Enables credentials for authenticated requests
 * - Restricts HTTP methods to those needed by the API
 * - Allows specific headers required for authentication
 *
 * @returns Configured CORS middleware
 *
 * @example
 * ```typescript
 * // In app.ts
 * import { createCorsMiddleware } from "./middleware/cors.js";
 *
 * const app = express();
 * app.use(createCorsMiddleware());
 * ```
 *
 * @example
 * ```bash
 * # .env configuration
 * ALLOWED_ORIGINS=https://example.com,https://admin.example.com
 * ```
 */
export function createCorsMiddleware() {
  const allowedOrigins = getAllowedOrigins();
  const allowNoOrigin = getAllowNoOrigin();

  const corsOptions: CorsOptions = {
    /**
     * Origin validation function.
     * Allows requests from configured origins or denies with 403.
     */
    origin: (origin, callback) => {
      // SEC-2: In production, reject all requests if no origins configured
      if (allowedOrigins.length === 0) {
        if (process.env.NODE_ENV === "production") {
          logger.error("CORS not configured in production - rejecting request");
          callback(new Error("CORS not configured in production"));
          return;
        }
        // Development mode - allow with warning
        logger.warn(
          "CORS: Development mode - allowing all origins. " +
          "Configure ALLOWED_ORIGINS before deploying to production."
        );
        callback(null, true);
        return;
      }

      // Handle requests with no origin (server-to-server, mobile apps)
      // Configuration option for stricter security postures
      if (!origin) {
        if (allowNoOrigin) {
          callback(null, true);
          return;
        }
        logger.warn("Rejected request with no origin header (ALLOW_NO_ORIGIN=false)");
        callback(new Error("Origin header required"));
        return;
      }

      // Check if origin is in allowed list
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      // Reject requests from unauthorized origins
      logger.warn("Blocked request from unauthorized origin", undefined, { origin });
      callback(new Error("Not allowed by CORS"));
    },

    /** Allow cookies and authorization headers */
    credentials: true,

    /** Allowed HTTP methods */
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],

    /** Allowed request headers */
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "X-Telegram-Bot-Api-Secret-Token"
    ],

    /** Headers exposed to the client */
    exposedHeaders: ["Content-Length", "X-Request-Id"],

    /** Cache preflight response for 1 hour (in seconds) */
    maxAge: 3600,

    /** Handle OPTIONS preflight requests */
    preflightContinue: false,
    optionsSuccessStatus: 204
  };

  return cors(corsOptions);
}

/**
 * Simple CORS middleware for development environments.
 * Allows all origins - use only in development!
 *
 * @returns CORS middleware allowing all origins
 */
export function createDevelopmentCorsMiddleware() {
  return cors({
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  });
}
