import type { Request } from "express";

/**
 * Resolves Langfuse tracing environment from incoming request host.
 * Local hosts are treated as dev, all other hosts as prod.
 */
export function resolveRequestTracingEnvironment(
  request: Request
): "dev" | "prod" {
  const forwardedHostHeader = request.headers["x-forwarded-host"];
  const forwardedHost = Array.isArray(forwardedHostHeader)
    ? forwardedHostHeader[0]
    : forwardedHostHeader;
  const host = typeof forwardedHost === "string" && forwardedHost.trim()
    ? forwardedHost
    : request.get("host") ?? "";

  const hostname = host
    .split(",")[0]
    ?.trim()
    .replace(/:\d+$/u, "")
    .replace(/^\[|\]$/gu, "")
    .toLowerCase();

  if (!hostname) {
    return "prod";
  }

  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1"
  ) {
    return "dev";
  }

  return "prod";
}
