import { type NextFunction, type Request, type Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";
import { api } from "../../convex/_generated/api.js";

import { getJwtSecret } from "../config.js";
import { Logger } from "../utils/logger.js";

/**
 * Logger instance for JWT authentication.
 */
const logger = new Logger({ service: "jwt-auth" });
const convexApi = anyApi as Record<string, any>;

function getConvexAdminToken(): string | null {
  const adminToken = process.env.CONVEX_DEPLOY_KEY?.trim() ?? process.env.CONVEX_ADMIN_KEY?.trim();
  if (!adminToken) {
    return null;
  }
  return adminToken;
}

/**
 * TokenVersionStore interface for token revocation mechanism.
 * SEC-5: Allows different backend implementations for single-instance and distributed deployments.
 */
export interface TokenVersionStore {
  /**
   * Gets the current token version for a user.
   * @param userId - The user identifier
   * @returns The current token version (defaults to 0)
   */
  getVersion(userId: string): number | Promise<number>;

  /**
   * Sets a specific token version for a user.
   * @param userId - The user identifier
   * @param version - The token version to set
   */
  setVersion(userId: string, version: number): void | Promise<void>;

  /**
   * Increments the token version for a user, revoking all previous tokens.
   * @param userId - The user identifier
   * @returns The new version number
   */
  incrementVersion(userId: string): number | Promise<number>;
}

/**
 * In-memory implementation of TokenVersionStore.
 * Suitable for single-instance deployments.
 */
export class InMemoryTokenVersionStore implements TokenVersionStore {
  private readonly store = new Map<string, number>();

  getVersion(userId: string): number {
    return this.store.get(userId) ?? 0;
  }

  setVersion(userId: string, version: number): void {
    this.store.set(userId, version);
  }

  incrementVersion(userId: string): number {
    const currentVersion = this.store.get(userId) ?? 0;
    const newVersion = currentVersion + 1;
    this.store.set(userId, newVersion);
    return newVersion;
  }
}

/**
 * Convex-based implementation of TokenVersionStore with local cache fallback.
 * Suitable for distributed deployments where multiple API instances need to share token version state.
 *
 * Security note: Uses a local cache as fallback when Convex is unavailable to prevent
 * revoked tokens from being accepted during outages. The cache stores the highest version
 * seen for each user, ensuring revocations are respected even during partial failures.
 */
export class ConvexTokenVersionStore implements TokenVersionStore {
  private readonly convex: ConvexHttpClient;
  /**
   * Local cache for fallback during Convex outages.
   * Stores the highest token version seen for each user.
   */
  private readonly localCache = new Map<string, number>();

  constructor(convexUrl: string, adminToken: string) {
    this.convex = new ConvexHttpClient(convexUrl);
    // Convex exposes setAdminAuth at runtime for server-side privileged calls.
    // The current type definitions do not surface it, so we cast explicitly.
    (
      this.convex as unknown as {
        setAdminAuth: (token: string) => void;
      }
    ).setAdminAuth(adminToken);
  }

  async getVersion(userId: string): Promise<number> {
    try {
      const version = await this.convex.query(api.tokenVersions.getTokenVersion, { userId });
      // Update local cache with the latest version from Convex
      const cachedVersion = this.localCache.get(userId);
      if (cachedVersion === undefined || version > cachedVersion) {
        this.localCache.set(userId, version);
      }
      return version;
    } catch (error) {
      logger.error(
        "Failed to get token version from Convex - using local cache fallback",
        undefined,
        error,
        {
          userId,
          cachedVersion: this.localCache.get(userId) ?? 0
        }
      );
      // Return the cached version (or 0 if never cached) to respect previous revocations
      // This is safer than returning 0 which would accept all tokens during outages
      return this.localCache.get(userId) ?? 0;
    }
  }

  async setVersion(userId: string, version: number): Promise<void> {
    try {
      await this.convex.mutation(convexApi.tokenVersions.setTokenVersion, { userId, version });
      // Update local cache after successful Convex update
      this.localCache.set(userId, version);
    } catch (error) {
      logger.error("Failed to set token version in Convex", undefined, error, {
        userId,
        version
      });
      throw error;
    }
  }

  async incrementVersion(userId: string): Promise<number> {
    try {
      const newVersion = await this.convex.mutation(convexApi.tokenVersions.incrementTokenVersion, { userId });
      // Update local cache after successful Convex update
      this.localCache.set(userId, newVersion);
      return newVersion;
    } catch (error) {
      logger.error("Failed to increment token version in Convex", undefined, error, {
        userId
      });
      throw error;
    }
  }
}

/**
 * Creates the appropriate TokenVersionStore based on environment configuration.
 * TOKEN_STORE_BACKEND=convex -> ConvexTokenVersionStore (for distributed deployments)
 * TOKEN_STORE_BACKEND=memory or unset -> InMemoryTokenVersionStore (for single-instance)
 */
function createTokenVersionStore(): TokenVersionStore {
  const backend = process.env.TOKEN_STORE_BACKEND?.toLowerCase();

  if (backend === "convex") {
    const convexUrl = process.env.CONVEX_URL;
    const convexAdminToken = getConvexAdminToken();
    if (!convexUrl) {
      logger.warn("TOKEN_STORE_BACKEND=convex but CONVEX_URL not set - falling back to in-memory store");
      return new InMemoryTokenVersionStore();
    }
    if (!convexAdminToken) {
      logger.warn(
        "TOKEN_STORE_BACKEND=convex but CONVEX_DEPLOY_KEY/CONVEX_ADMIN_KEY not set - falling back to in-memory store"
      );
      return new InMemoryTokenVersionStore();
    }
    logger.info("Using Convex token version store for distributed deployments");
    return new ConvexTokenVersionStore(convexUrl, convexAdminToken);
  }

  logger.info("Using in-memory token version store (single-instance mode)");
  return new InMemoryTokenVersionStore();
}

/**
 * Global token version store instance.
 * Selected based on TOKEN_STORE_BACKEND environment variable.
 */
const tokenVersionStore = createTokenVersionStore();

/**
 * JWT payload structure for admin authentication.
 * Contains the user identity and admin status.
 */
export interface AdminJwtPayload extends JwtPayload {
  /** Unique identifier for the user */
  sub: string;
  /** Indicates if the user has admin privileges */
  isAdmin: boolean;
  /** SEC-5: Token version for revocation support */
  tokenVersion: number;
  /** Token issued at timestamp */
  iat?: number;
  /** Token expiration timestamp */
  exp?: number;
}

/**
 * Extended request interface with authenticated user data.
 */
export interface AuthenticatedRequest extends Request {
  /** The decoded JWT payload if authentication succeeded */
  user?: AdminJwtPayload;
}

/**
 * Error response structure for authentication failures.
 */
interface AuthErrorResponse {
  error: string;
  code: "MISSING_TOKEN" | "INVALID_TOKEN" | "INSUFFICIENT_PRIVILEGES" | "TOKEN_REVOKED";
}

/**
 * SEC-5: Gets the current token version for a user.
 * Used for token revocation mechanism.
 *
 * @param userId - The user identifier
 * @returns The current token version (defaults to 0)
 */
export async function getUserTokenVersion(userId: string): Promise<number> {
  return tokenVersionStore.getVersion(userId);
}

/**
 * SEC-5: Invalidates all tokens for a user by incrementing their token version.
 * This effectively revokes all previously issued tokens.
 *
 * @param userId - The user identifier whose tokens should be revoked
 *
 * @example
 * ```typescript
 * // Revoke all tokens for a user (e.g., on password change or logout from all devices)
 * await invalidateUserTokens("user-123");
 * ```
 */
export async function invalidateUserTokens(userId: string): Promise<void> {
  const newVersion = await tokenVersionStore.incrementVersion(userId);
  logger.info("User tokens invalidated", undefined, { userId, newVersion });
}

/**
 * SEC-5: Sets a specific token version for a user.
 * Useful for testing or manual token management.
 *
 * @param userId - The user identifier
 * @param version - The token version to set
 */
export async function setUserTokenVersion(userId: string, version: number): Promise<void> {
  await tokenVersionStore.setVersion(userId, version);
}

/**
 * JWT Authentication Middleware for protecting admin routes.
 *
 * This middleware validates JWT tokens from the Authorization header
 * and ensures the user has admin privileges.
 *
 * SEC-5: Includes token version checking for revocation support.
 *
 * @example
 * ```typescript
 * const middleware = new JwtAuthMiddleware();
 *
 * // Protect a single route
 * router.get("/protected", middleware.authenticate.bind(middleware), handler);
 *
 * // Protect all routes in a router
 * router.use(middleware.authenticate.bind(middleware));
 * ```
 */
export class JwtAuthMiddleware {
  private readonly secret: string;

  /**
   * Creates a new JWT authentication middleware instance.
   * @throws Error if JWT_SECRET is not configured
   */
  constructor() {
    this.secret = getJwtSecret();
  }

  /**
   * Verifies and decodes a JWT token.
   * SEC-5: Also checks token version for revocation support.
   *
   * @param token - The JWT token string to verify
   * @returns The decoded payload if verification succeeds
   * @throws JsonWebTokenError if the token is invalid
   * @throws TokenExpiredError if the token has expired
   * @throws NotBeforeError if the token is used before its valid date
   * @throws Error if the token has been revoked (version mismatch)
   *
   * @example
   * ```typescript
   * const middleware = new JwtAuthMiddleware();
   * try {
   *   const payload = middleware.verifyToken(token);
   *   console.log(`User ${payload.sub} is admin: ${payload.isAdmin}`);
   * } catch (error) {
   *   console.error("Token verification failed");
   * }
   * ```
   */
  async verifyToken(token: string): Promise<AdminJwtPayload> {
    const decoded = jwt.verify(token, this.secret, {
      algorithms: ['HS256']  // Only allow HMAC-SHA256
    });

    // Handle case where verify returns a string (shouldn't happen with our tokens)
    if (typeof decoded === "string") {
      throw new Error("Invalid token format");
    }

    const sub = decoded.sub;
    if (typeof sub !== "string" || sub.trim() === "") {
      throw new Error("Invalid token subject");
    }

    if (typeof decoded.isAdmin !== "boolean") {
      throw new Error("Invalid admin flag");
    }

    // SEC-5: Check token version for revocation support
    // Tokens without version field are treated as version 0
    const tokenVersion = decoded.tokenVersion ?? 0;
    if (
      typeof tokenVersion !== "number" ||
      !Number.isInteger(tokenVersion) ||
      tokenVersion < 0
    ) {
      throw new Error("Invalid token version");
    }

    const payload: AdminJwtPayload = {
      ...decoded,
      sub,
      isAdmin: decoded.isAdmin,
      tokenVersion
    };

    const currentVersion = await getUserTokenVersion(payload.sub);

    if (tokenVersion < currentVersion) {
      logger.warn("Token rejected - version mismatch (revoked)", undefined, {
        userId: payload.sub,
        tokenVersion,
        currentVersion
      });
      throw new Error("Token has been revoked");
    }

    return payload;
  }

  /**
   * Generates a JWT token for an authenticated admin user.
   * SEC-5: Includes token version for revocation support.
   *
   * @param userId - The unique identifier for the user
   * @param isAdmin - Whether the user has admin privileges
   * @param expiresIn - Token expiration time (e.g., '24h', '7d')
   * @returns The signed JWT token
   *
   * @example
   * ```typescript
   * const middleware = new JwtAuthMiddleware();
   * const token = await middleware.generateToken("user-123", true, "24h");
   * ```
   */
  async generateToken(userId: string, isAdmin: boolean, expiresIn: string = "24h"): Promise<string> {
    // SEC-5: Include current token version in the token
    const tokenVersion = await getUserTokenVersion(userId);
    const payload: AdminJwtPayload = {
      sub: userId,
      isAdmin,
      tokenVersion
    };

    logger.debug("Generating token", undefined, { userId, tokenVersion });
    return jwt.sign(payload, this.secret, { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] });
  }

  /**
   * Express middleware function for authenticating requests.
   *
   * Validates the JWT token from the Authorization header (Bearer scheme)
   * and attaches the decoded payload to `request.user`.
   *
   * Returns 401 Unauthorized for:
   * - Missing Authorization header
   * - Invalid or expired token
   * - SEC-5: Revoked token (version mismatch)
   * - User without admin privileges
   *
   * @param request - Express request object
   * @param response - Express response object
   * @param next - Express next function
   */
  async authenticate(
    request: AuthenticatedRequest,
    response: Response<AuthErrorResponse>,
    next: NextFunction
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    // Check for Authorization header
    if (!authHeader) {
      logger.warn("Authentication failed: Missing Authorization header", undefined, {
        path: request.path,
        ip: request.ip
      });
      response.status(401).json({
        error: "Authorization header is required.",
        code: "MISSING_TOKEN"
      });
      return;
    }

    // Validate Bearer scheme
    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      logger.warn("Authentication failed: Invalid Authorization header format", undefined, {
        path: request.path,
        ip: request.ip
      });
      response.status(401).json({
        error: "Invalid Authorization header format. Use: Bearer <token>",
        code: "INVALID_TOKEN"
      });
      return;
    }

    const token = parts[1];

    if (!token || token.trim() === "") {
      logger.warn("Authentication failed: Empty token", undefined, {
        path: request.path,
        ip: request.ip
      });
      response.status(401).json({
        error: "Token is required.",
        code: "MISSING_TOKEN"
      });
      return;
    }

    try {
      const payload = await this.verifyToken(token);

      // Validate admin privileges
      if (!payload.isAdmin) {
        logger.warn("Authentication failed: User lacks admin privileges", undefined, {
          userId: payload.sub,
          path: request.path
        });
        response.status(401).json({
          error: "Admin privileges required.",
          code: "INSUFFICIENT_PRIVILEGES"
        });
        return;
      }

      // Attach user to request for downstream handlers
      request.user = payload;
      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const isRevoked = errorMessage === "Token has been revoked";

      logger.warn("Authentication failed: Token verification error", undefined, {
        error: { name: "AuthError", message: errorMessage },
        path: request.path,
        ip: request.ip,
        revoked: isRevoked
      });

      response.status(401).json({
        error: isRevoked ? "Token has been revoked." : "Invalid or expired token.",
        code: isRevoked ? "TOKEN_REVOKED" : "INVALID_TOKEN"
      });
    }
  }

  /**
   * Optional authentication middleware that attaches user info if present
   * but doesn't reject requests without tokens.
   *
   * Useful for routes that behave differently for authenticated vs anonymous users.
   *
   * @param request - Express request object
   * @param _response - Express response object
   * @param next - Express next function
   */
  async optionalAuthenticate(
    request: AuthenticatedRequest,
    _response: Response,
    next: NextFunction
  ): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      next();
      return;
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      next();
      return;
    }

    const token = parts[1];

    if (!token || token.trim() === "") {
      next();
      return;
    }

    try {
      const payload = await this.verifyToken(token);
      request.user = payload;
    } catch {
      // Silently ignore token errors for optional auth
    }

    next();
  }
}

/**
 * Factory function to create a JWT auth middleware instance.
 * Convenience function for creating middleware with default configuration.
 *
 * @returns A new JwtAuthMiddleware instance
 *
 * @example
 * ```typescript
 * const authMiddleware = createJwtAuthMiddleware();
 * router.use(authMiddleware.authenticate.bind(authMiddleware));
 * ```
 */
export function createJwtAuthMiddleware(): JwtAuthMiddleware {
  return new JwtAuthMiddleware();
}
