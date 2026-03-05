import { type Server } from "node:http";
import { fileURLToPath } from "node:url";

import { loadEnvironmentFile } from "./environment.js";
import { createApp } from "./app.js";
import { getShutdownTimeoutMs } from "./config.js";
import { Logger } from "./utils/logger.js";

/**
 * Logger instance for server.
 */
const logger = new Logger({ service: "server" });

loadEnvironmentFile();

export function resolvePort(portValue: string | undefined): number {
  const parsedPort = Number(portValue);

  if (Number.isInteger(parsedPort) && parsedPort > 0) {
    return parsedPort;
  }

  return 3000;
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === process.argv[1];
}

/**
 * PROD-1: Tracks active connections for graceful shutdown.
 */
let activeConnections = 0;

/**
 * PROD-1: Gracefully shuts down the server.
 * Stops accepting new connections and waits for existing ones to complete.
 *
 * @param server - The HTTP server to shut down
 * @param signal - The signal that triggered the shutdown (SIGTERM or SIGINT)
 */
function gracefulShutdown(server: Server, signal: string): void {
  const shutdownTimeoutMs = getShutdownTimeoutMs();

  logger.info(`Received ${signal} - starting graceful shutdown`, undefined, {
    activeConnections,
    shutdownTimeoutMs
  });

  // Stop accepting new connections
  server.close(() => {
    logger.info("HTTP server closed - no longer accepting connections");
  });

  // Force shutdown after timeout
  const shutdownTimeout = setTimeout(() => {
    logger.warn("Graceful shutdown timeout exceeded - forcing exit", undefined, {
      activeConnections,
      timeout: shutdownTimeoutMs
    });
    process.exit(1);
  }, shutdownTimeoutMs);

  // Clear timeout if all connections close naturally
  server.on("close", () => {
    clearTimeout(shutdownTimeout);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  });
}

/**
 * PROD-1: Sets up graceful shutdown handlers for the server.
 *
 * @param server - The HTTP server to manage
 */
function setupGracefulShutdown(server: Server): void {
  // Track connections
  server.on("connection", (socket) => {
    activeConnections++;

    socket.on("close", () => {
      activeConnections--;
    });
  });

  // Handle SIGTERM (Kubernetes, Docker, etc.)
  process.on("SIGTERM", () => {
    gracefulShutdown(server, "SIGTERM");
  });

  // Handle SIGINT (Ctrl+C)
  process.on("SIGINT", () => {
    gracefulShutdown(server, "SIGINT");
  });

  logger.info("Graceful shutdown handlers configured");
}

if (isDirectExecution()) {
  const app = createApp();
  const port = resolvePort(process.env.PORT);

  const server = app.listen(port, () => {
    logger.info(`Restaurant hours API listening on port ${port}`, undefined, {
      port,
      env: process.env.NODE_ENV ?? "development"
    });
  });

  // PROD-1: Setup graceful shutdown handlers
  setupGracefulShutdown(server);
}
