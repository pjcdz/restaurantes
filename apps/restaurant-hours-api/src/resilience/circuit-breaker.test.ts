import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import {
  CircuitBreaker,
  CircuitOpenError,
  GeminiCircuitBreaker,
  ConvexCircuitBreaker
} from "./circuit-breaker.js";

describe("CircuitBreaker", () => {
  let breaker: CircuitBreaker;

  describe("initial state", () => {
    it("starts in CLOSED state", () => {
      breaker = new CircuitBreaker({ name: "test-breaker" });
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("starts with zero failure count", () => {
      breaker = new CircuitBreaker({ name: "test-breaker" });
      expect(breaker.getFailureCount()).toBe(0);
    });

    it("uses default configuration when not specified", () => {
      breaker = new CircuitBreaker({ name: "test-breaker" });
      expect(breaker.getName()).toBe("test-breaker");
    });

    it("accepts custom configuration", () => {
      breaker = new CircuitBreaker({
        name: "custom-breaker",
        failureThreshold: 3,
        resetTimeoutMs: 5000,
        halfOpenMaxCalls: 2
      });
      expect(breaker.getName()).toBe("custom-breaker");
    });
  });

  describe("CLOSED state behavior", () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 3,
        resetTimeoutMs: 1000
      });
    });

    it("executes successful functions and returns result", async () => {
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });

    it("remains CLOSED after successful execution", async () => {
      await breaker.execute(async () => "success");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("increments failure count on failure", async () => {
      try {
        await breaker.execute(async () => {
          throw new Error("test error");
        });
      } catch {
        // Expected
      }
      expect(breaker.getFailureCount()).toBe(1);
    });

    it("normalizes non-Error throw values to Error instances", async () => {
      await expect(
        breaker.execute(async () => {
          throw "plain string failure";
        })
      ).rejects.toBeInstanceOf(Error);
      expect(breaker.getFailureCount()).toBe(1);
    });

    it("remains CLOSED below failure threshold", async () => {
      try {
        await breaker.execute(async () => {
          throw new Error("test error");
        });
      } catch {
        // Expected
      }
      expect(breaker.getState()).toBe("CLOSED");
    });
  });

  describe("transition to OPEN state", () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 2,
        resetTimeoutMs: 1000
      });
    });

    it("transitions to OPEN after reaching failure threshold", async () => {
      // First failure
      try {
        await breaker.execute(async () => {
          throw new Error("failure 1");
        });
      } catch {
        // Expected
      }

      // Second failure - should trigger OPEN
      try {
        await breaker.execute(async () => {
          throw new Error("failure 2");
        });
      } catch {
        // Expected
      }

      expect(breaker.getState()).toBe("OPEN");
    });

    it("rejects immediately when OPEN with CircuitOpenError", async () => {
      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      // Should reject immediately
      await expect(breaker.execute(async () => "should not run")).rejects.toThrow(
        CircuitOpenError
      );
    });

    it("includes breaker name in CircuitOpenError message", async () => {
      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      try {
        await breaker.execute(async () => "test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(CircuitOpenError);
        expect((error as CircuitOpenError).message).toContain("test-breaker");
      }
    });
  });

  describe("transition to HALF_OPEN state", () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 2,
        resetTimeoutMs: 50 // Short timeout for testing
      });
    });

    it("transitions to HALF_OPEN after reset timeout", async () => {
      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe("OPEN");

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Next call should transition to HALF_OPEN
      try {
        await breaker.execute(async () => {
          throw new Error("still failing");
        });
      } catch {
        // Expected
      }

      // Should be OPEN again after failure in HALF_OPEN
      expect(breaker.getState()).toBe("OPEN");
    });

    it("allows limited calls in HALF_OPEN state", async () => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 2,
        resetTimeoutMs: 50,
        halfOpenMaxCalls: 1
      });

      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      // First call should be allowed (HALF_OPEN)
      const result = await breaker.execute(async () => "success");
      expect(result).toBe("success");
    });
  });

  describe("return to CLOSED from HALF_OPEN", () => {
    beforeEach(() => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 2,
        resetTimeoutMs: 50
      });
    });

    it("returns to CLOSED on success in HALF_OPEN", async () => {
      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Successful call should return to CLOSED
      await breaker.execute(async () => "success");
      expect(breaker.getState()).toBe("CLOSED");
    });

    it("resets failure count on success in HALF_OPEN", async () => {
      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      // Successful call should reset failure count
      await breaker.execute(async () => "success");
      expect(breaker.getFailureCount()).toBe(0);
    });
  });

  describe("event handlers", () => {
    it("fires onStateChange event when state changes", async () => {
      const onStateChange = vi.fn();
      breaker = new CircuitBreaker(
        {
          name: "test-breaker",
          failureThreshold: 2,
          resetTimeoutMs: 50
        },
        { onStateChange }
      );

      // Trigger state change to OPEN
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      expect(onStateChange).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "test-breaker",
          previousState: "CLOSED",
          newState: "OPEN"
        })
      );
    });

    it("fires onFailure event on each failure", async () => {
      const onFailure = vi.fn();
      breaker = new CircuitBreaker(
        {
          name: "test-breaker",
          failureThreshold: 5
        },
        { onFailure }
      );

      const testError = new Error("test failure");
      try {
        await breaker.execute(async () => {
          throw testError;
        });
      } catch {
        // Expected
      }

      expect(onFailure).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "test-breaker",
          error: testError,
          failureCount: 1
        })
      );
    });

    it("fires onReset event when manually reset", async () => {
      const onReset = vi.fn();
      breaker = new CircuitBreaker(
        {
          name: "test-breaker",
          failureThreshold: 2
        },
        { onReset }
      );

      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      // Manual reset
      breaker.reset();

      expect(onReset).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "test-breaker"
        })
      );
    });
  });

  describe("manual operations", () => {
    it("reset() returns to CLOSED state", async () => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 2
      });

      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      expect(breaker.getState()).toBe("OPEN");

      breaker.reset();

      expect(breaker.getState()).toBe("CLOSED");
      expect(breaker.getFailureCount()).toBe(0);
    });

    it("forceOpen() forces OPEN state", () => {
      breaker = new CircuitBreaker({ name: "test-breaker" });

      expect(breaker.getState()).toBe("CLOSED");

      breaker.forceOpen();

      expect(breaker.getState()).toBe("OPEN");
    });
  });

  describe("HALF_OPEN max calls limit", () => {
    it("rejects when HALF_OPEN max calls exceeded", async () => {
      breaker = new CircuitBreaker({
        name: "test-breaker",
        failureThreshold: 2,
        resetTimeoutMs: 50,
        halfOpenMaxCalls: 1
      });

      // Trigger OPEN state
      for (let i = 0; i < 2; i++) {
        try {
          await breaker.execute(async () => {
            throw new Error("failure");
          });
        } catch {
          // Expected
        }
      }

      // Wait for reset timeout
      await new Promise((resolve) => setTimeout(resolve, 60));

      // First call uses the one allowed call
      try {
        await breaker.execute(async () => {
          throw new Error("failure");
        });
      } catch {
        // Expected
      }

      // Should be OPEN again, rejecting immediately
      await expect(breaker.execute(async () => "test")).rejects.toThrow(
        CircuitOpenError
      );
    });
  });
});

describe("CircuitOpenError", () => {
  it("is an instance of Error", () => {
    const error = new CircuitOpenError("test message");
    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name property", () => {
    const error = new CircuitOpenError("test message");
    expect(error.name).toBe("CircuitOpenError");
  });

  it("preserves message", () => {
    const error = new CircuitOpenError("circuit breaker is open");
    expect(error.message).toBe("circuit breaker is open");
  });
});

describe("GeminiCircuitBreaker singleton", () => {
  it("is defined", () => {
    expect(GeminiCircuitBreaker).toBeDefined();
  });

  it("has correct name", () => {
    expect(GeminiCircuitBreaker.getName()).toBe("gemini-api");
  });

  it("starts in CLOSED state", () => {
    expect(GeminiCircuitBreaker.getState()).toBe("CLOSED");
  });
});

describe("ConvexCircuitBreaker singleton", () => {
  it("is defined", () => {
    expect(ConvexCircuitBreaker).toBeDefined();
  });

  it("has correct name", () => {
    expect(ConvexCircuitBreaker.getName()).toBe("convex-api");
  });

  it("starts in CLOSED state", () => {
    expect(ConvexCircuitBreaker.getState()).toBe("CLOSED");
  });
});
