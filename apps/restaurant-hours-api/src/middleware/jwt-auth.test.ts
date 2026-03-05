import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

import {
  JwtAuthMiddleware,
  createJwtAuthMiddleware,
  type AuthenticatedRequest,
  type AdminJwtPayload
} from "./jwt-auth.js";

// Mock the config module
vi.mock("../config.js", () => ({
  getJwtSecret: () => "test-jwt-secret-min-32-characters-long"
}));

describe("JwtAuthMiddleware", () => {
  let middleware: JwtAuthMiddleware;
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    middleware = new JwtAuthMiddleware();
    mockRequest = {
      headers: {},
      path: "/test",
      ip: "127.0.0.1"
    };
    mockResponse = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis()
    };
    mockNext = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("generateToken", () => {
    it("generates a valid JWT token", async () => {
      const token = await middleware.generateToken("user-123", true);
      
      expect(typeof token).toBe("string");
      expect(token.split(".")).toHaveLength(3); // JWT has 3 parts
    });

    it("includes user ID in token payload", async () => {
      const token = await middleware.generateToken("user-123", true);
      const decoded = jwt.decode(token) as AdminJwtPayload;
      
      expect(decoded.sub).toBe("user-123");
    });

    it("includes isAdmin flag in token payload", async () => {
      const token = await middleware.generateToken("user-123", true);
      const decoded = jwt.decode(token) as AdminJwtPayload;
      
      expect(decoded.isAdmin).toBe(true);
    });

    it("sets isAdmin to false for non-admin users", async () => {
      const token = await middleware.generateToken("user-456", false);
      const decoded = jwt.decode(token) as AdminJwtPayload;
      
      expect(decoded.isAdmin).toBe(false);
    });

    it("uses default expiration of 24h", async () => {
      const token = await middleware.generateToken("user-123", true);
      const decoded = jwt.decode(token) as AdminJwtPayload;
      
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + 24 * 60 * 60; // 24 hours in seconds
      
      // Allow 10 second tolerance for test execution time
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 10);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 10);
    });

    it("accepts custom expiration time", async () => {
      const token = await middleware.generateToken("user-123", true, "1h");
      const decoded = jwt.decode(token) as AdminJwtPayload;
      
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + 60 * 60; // 1 hour in seconds
      
      expect(decoded.exp).toBeGreaterThanOrEqual(expectedExp - 10);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp + 10);
    });
  });

  describe("verifyToken", () => {
    it("verifies and decodes a valid token", async () => {
      const token = await middleware.generateToken("user-123", true);
      const decoded = await middleware.verifyToken(token);
      
      expect(decoded.sub).toBe("user-123");
      expect(decoded.isAdmin).toBe(true);
    });

    it("throws error for invalid token", async () => {
      await expect(middleware.verifyToken("invalid-token")).rejects.toThrow();
    });

    it("throws error for expired token", async () => {
      // Create an expired token (expired 1 hour ago)
      const expiredToken = jwt.sign(
        { sub: "user-123", isAdmin: true },
        "test-jwt-secret-min-32-characters-long",
        { expiresIn: "-1h" }
      );
      
      await expect(middleware.verifyToken(expiredToken)).rejects.toThrow();
    });

    it("throws error for token with wrong secret", async () => {
      const wrongSecretToken = jwt.sign(
        { sub: "user-123", isAdmin: true },
        "wrong-secret",
        { expiresIn: "1h" }
      );
      
      await expect(middleware.verifyToken(wrongSecretToken)).rejects.toThrow();
    });

    it("throws error for malformed token", async () => {
      await expect(middleware.verifyToken("not.a.valid.jwt")).rejects.toThrow();
    });

    it("throws error when isAdmin claim is missing", async () => {
      const tokenWithoutAdmin = jwt.sign(
        { sub: "user-123" },
        "test-jwt-secret-min-32-characters-long",
        { expiresIn: "1h" }
      );

      await expect(middleware.verifyToken(tokenWithoutAdmin)).rejects.toThrow(
        "Invalid admin flag"
      );
    });

    it("throws error when tokenVersion is invalid", async () => {
      const tokenWithInvalidVersion = jwt.sign(
        { sub: "user-123", isAdmin: true, tokenVersion: "x" },
        "test-jwt-secret-min-32-characters-long",
        { expiresIn: "1h" }
      );

      await expect(middleware.verifyToken(tokenWithInvalidVersion)).rejects.toThrow(
        "Invalid token version"
      );
    });
  });

  describe("authenticate middleware", () => {
    it("calls next() for valid admin token", async () => {
      const token = await middleware.generateToken("admin-123", true);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.sub).toBe("admin-123");
      expect(mockRequest.user?.isAdmin).toBe(true);
    });

    it("returns 401 for missing Authorization header", async () => {
      mockRequest.headers = {};
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Authorization header is required.",
        code: "MISSING_TOKEN"
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("returns 401 for invalid Authorization header format", async () => {
      mockRequest.headers = { authorization: "InvalidFormat token" };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid Authorization header format. Use: Bearer <token>",
        code: "INVALID_TOKEN"
      });
    });

    it("returns 401 for Bearer without token", async () => {
      mockRequest.headers = { authorization: "Bearer " };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Token is required.",
        code: "MISSING_TOKEN"
      });
    });

    it("returns 401 for invalid token", async () => {
      mockRequest.headers = { authorization: "Bearer invalid-token" };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid or expired token.",
        code: "INVALID_TOKEN"
      });
    });

    it("returns 401 for expired token", async () => {
      const expiredToken = jwt.sign(
        { sub: "user-123", isAdmin: true },
        "test-jwt-secret-min-32-characters-long",
        { expiresIn: "-1h" }
      );
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Invalid or expired token.",
        code: "INVALID_TOKEN"
      });
    });

    it("returns 401 for non-admin user (isAdmin: false)", async () => {
      const token = await middleware.generateToken("user-123", false);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: "Admin privileges required.",
        code: "INSUFFICIENT_PRIVILEGES"
      });
    });

    it("attaches user payload to request object", async () => {
      const token = await middleware.generateToken("admin-456", true);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockRequest.user).toEqual({
        sub: "admin-456",
        isAdmin: true,
        tokenVersion: 0,
        iat: expect.any(Number),
        exp: expect.any(Number)
      });
    });

    it("handles case-insensitive Bearer prefix", async () => {
      const token = await middleware.generateToken("admin-123", true);
      mockRequest.headers = { authorization: `bearer ${token}` }; // lowercase
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe("optionalAuthenticate middleware", () => {
    it("calls next() without token", async () => {
      mockRequest.headers = {};
      
      await middleware.optionalAuthenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it("attaches user when valid token is present", async () => {
      const token = await middleware.generateToken("user-789", true);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.optionalAuthenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeDefined();
      expect(mockRequest.user?.sub).toBe("user-789");
    });

    it("calls next() for invalid token without attaching user", async () => {
      mockRequest.headers = { authorization: "Bearer invalid-token" };
      
      await middleware.optionalAuthenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it("calls next() for expired token without attaching user", async () => {
      const expiredToken = jwt.sign(
        { sub: "user-123", isAdmin: true },
        "test-jwt-secret-min-32-characters-long",
        { expiresIn: "-1h" }
      );
      mockRequest.headers = { authorization: `Bearer ${expiredToken}` };
      
      await middleware.optionalAuthenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it("calls next() for malformed Authorization header", async () => {
      mockRequest.headers = { authorization: "Malformed" };
      
      await middleware.optionalAuthenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user).toBeUndefined();
    });

    it("attaches user for non-admin tokens", async () => {
      const token = await middleware.generateToken("regular-user", false);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.optionalAuthenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.isAdmin).toBe(false);
    });
  });

  describe("isAdmin validation (via authenticate)", () => {
    it("allows admin users through authenticate", async () => {
      const token = await middleware.generateToken("admin-user", true);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockNext).toHaveBeenCalled();
      expect(mockRequest.user?.isAdmin).toBe(true);
    });

    it("blocks non-admin users from authenticate", async () => {
      const token = await middleware.generateToken("regular-user", false);
      mockRequest.headers = { authorization: `Bearer ${token}` };
      
      await middleware.authenticate(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response,
        mockNext
      );
      
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({ code: "INSUFFICIENT_PRIVILEGES" })
      );
    });
  });
});

describe("createJwtAuthMiddleware", () => {
  it("creates a JwtAuthMiddleware instance", () => {
    const middleware = createJwtAuthMiddleware();
    expect(middleware).toBeInstanceOf(JwtAuthMiddleware);
  });

  it("returns a working middleware", async () => {
    const middleware = createJwtAuthMiddleware();
    const token = await middleware.generateToken("test-user", true);
    
    const decoded = await middleware.verifyToken(token);
    expect(decoded.sub).toBe("test-user");
  });
});
