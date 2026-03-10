import express, {
  type ErrorRequestHandler,
  type NextFunction,
  type Request,
  type Response
} from "express";
import helmet from "helmet";

import { createCorsMiddleware } from "./middleware/cors.js";
import { Logger } from "./utils/logger.js";
import { createMessageRouter, type MessageRouteOptions } from "./routes/message.js";
import {
  createTelegramWebhookRouter,
  type TelegramWebhookRouteOptions
} from "./routes/telegram-webhook.js";
import {
  createKapsoWebhookRouter,
  type KapsoWebhookRouteOptions
} from "./routes/kapso-webhook.js";

/**
 * Logger instance for application errors.
 */
const logger = new Logger({ service: "app" });

/**
 * PROD-2: Application startup timestamp for uptime tracking.
 */
const appStartTime = Date.now();

/**
 * PROD-2: Health check response structure.
 */
interface HealthCheckResponse {
  status: "healthy" | "unhealthy";
  timestamp: string;
  uptime: number;
  version: string;
}

/**
 * PROD-2: Readiness check response structure.
 */
interface ReadinessCheckResponse {
  status: "ready" | "not_ready";
  timestamp: string;
  checks: {
    server: boolean;
  };
}

export type AppOptions =
  & MessageRouteOptions
  & TelegramWebhookRouteOptions
  & KapsoWebhookRouteOptions;

/**
 * Creates and configures the Express application with security middleware.
 *
 * Security features enabled:
 * - SEC-06: CORS configuration with allowed origins
 * - SEC-07: Helmet security headers
 *   - Content-Security-Policy
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY
 *   - Strict-Transport-Security (HSTS)
 *
 * @param options - Application configuration options
 * @returns Configured Express application
 */
export function createApp(options: AppOptions = {}) {
  const app = express();

  // SEC-07: Helmet security headers
  app.use(helmet({
    /**
     * Content Security Policy configuration.
     * For an API, we use a restrictive policy that prevents content injection.
     */
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        // APIs typically don't need scripts, styles, or images
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
        imgSrc: ["'none'"],
        fontSrc: ["'none'"],
        // Prevent framing of the API
        frameAncestors: ["'none'"],
        // Only allow form actions to self
        formAction: ["'self'"],
        // Upgrade insecure requests in production
        upgradeInsecureRequests: []
      }
    },

    /**
     * Prevents MIME type sniffing.
     * Forces browsers to respect declared Content-Type headers.
     */
    xContentTypeOptions: true,

    /**
     * Prevents clickjacking by denying all framing.
     */
    xFrameOptions: {
      action: "deny"
    },

    /**
     * HTTP Strict Transport Security (HSTS).
     * Forces browsers to use HTTPS for future requests.
     */
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },

    /**
     * X-XSS-Protection header.
     * Enabled for legacy browser support.
     */
    xXssProtection: true,

    /**
     * Referrer-Policy header.
     * Limits referrer information for privacy.
     */
    referrerPolicy: {
      policy: "strict-origin-when-cross-origin"
    },

    /**
     * Disable X-Powered-By header to avoid revealing server technology.
     */
    hidePoweredBy: true,

    /**
     * X-Download-Options for IE8+ security.
     */
    ieNoOpen: true,

    /**
     * DNS prefetch control.
     */
    dnsPrefetchControl: {
      allow: false
    },

    /**
     * Cross-Origin policies for additional security.
     */
    crossOriginEmbedderPolicy: false, // May interfere with API responses
    crossOriginOpenerPolicy: true,
    crossOriginResourcePolicy: { policy: "same-origin" },

    /**
     * Origin-Agent-Cluster header for process isolation.
     */
    originAgentCluster: true
  }));

  // SEC-06: CORS configuration
  app.use(createCorsMiddleware());

  // Body parsing middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // PROD-2: Health check endpoint - lightweight check for load balancers
  app.get("/health", (_request: Request, response: Response) => {
    const healthResponse: HealthCheckResponse = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - appStartTime) / 1000),
      version: process.env.npm_package_version ?? "1.0.0"
    };
    response.status(200).json(healthResponse);
  });

  // PROD-2: Readiness check endpoint - verifies server can handle requests
  app.get("/ready", (_request: Request, response: Response) => {
    // Server is ready if it can respond to this request
    const readinessResponse: ReadinessCheckResponse = {
      status: "ready",
      timestamp: new Date().toISOString(),
      checks: {
        server: true
      }
    };
    response.status(200).json(readinessResponse);
  });

  // Route handlers
  app.use("/message", createMessageRouter(options));
  app.use("/telegram/webhook", createTelegramWebhookRouter(options));
  app.use("/kapso/webhook", createKapsoWebhookRouter(options));

  const jsonErrorHandler: ErrorRequestHandler = (error, _request, response, next) => {
    if (
      error instanceof SyntaxError &&
      "status" in error &&
      error.status === 400 &&
      "body" in error
    ) {
      return response.status(400).json({
        error: "Invalid JSON body."
      });
    }

    return next(error);
  };

  const fallbackErrorHandler: ErrorRequestHandler = (
    error,
    _request,
    response,
    _next
  ) => {
    logger.error("Unhandled error in request handler", error);
    const isProduction = process.env.NODE_ENV === "production";
    return response.status(500).json({
      error: isProduction ? "Internal server error." : error.message
    });
  };

  app.use(jsonErrorHandler);
  app.use(fallbackErrorHandler);

  return app;
}
