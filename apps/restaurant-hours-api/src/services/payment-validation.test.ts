import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  paymentMethodSchema,
  paymentInfoSchema,
  validatePaymentInfo,
  safeParsePaymentInfo,
  type PaymentMethod,
  type PaymentInfo
} from "./order-extraction.js";

describe("paymentMethodSchema", () => {
  describe("valid payment methods", () => {
    it("accepts 'cash' as valid", () => {
      const result = paymentMethodSchema.parse("cash");
      expect(result).toBe("cash");
    });

    it("accepts 'card' as valid", () => {
      const result = paymentMethodSchema.parse("card");
      expect(result).toBe("card");
    });

    it("accepts 'transfer' as valid", () => {
      const result = paymentMethodSchema.parse("transfer");
      expect(result).toBe("transfer");
    });
  });

  describe("invalid payment methods", () => {
    it("rejects invalid string", () => {
      const result = paymentMethodSchema.safeParse("bitcoin");
      expect(result.success).toBe(false);
    });

    it("rejects empty string", () => {
      const result = paymentMethodSchema.safeParse("");
      expect(result.success).toBe(false);
    });

    it("rejects number", () => {
      const result = paymentMethodSchema.safeParse(123);
      expect(result.success).toBe(false);
    });

    it("rejects null", () => {
      const result = paymentMethodSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("rejects undefined", () => {
      const result = paymentMethodSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });

    it("rejects case-sensitive input (uppercase)", () => {
      const result = paymentMethodSchema.safeParse("CASH");
      expect(result.success).toBe(false);
    });
  });
});

describe("paymentInfoSchema", () => {
  describe("valid payment info", () => {
    it("accepts valid cash payment", () => {
      const input = { amount: 100, method: "cash" };
      const result = paymentInfoSchema.parse(input);
      expect(result).toEqual(input);
    });

    it("accepts valid card payment", () => {
      const input = { amount: 250.50, method: "card" };
      const result = paymentInfoSchema.parse(input);
      expect(result).toEqual(input);
    });

    it("accepts valid transfer payment", () => {
      const input = { amount: 1000, method: "transfer" };
      const result = paymentInfoSchema.parse(input);
      expect(result).toEqual(input);
    });

    // EDGE-2: Zero amount is now rejected (must be positive, not just non-negative)
    it("rejects zero amount", () => {
      const input = { amount: 0, method: "cash" };
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive");
      }
    });

    it("accepts large amounts", () => {
      const input = { amount: 1000000, method: "transfer" };
      const result = paymentInfoSchema.parse(input);
      expect(result).toEqual(input);
    });

    it("accepts decimal amounts", () => {
      const input = { amount: 99.99, method: "card" };
      const result = paymentInfoSchema.parse(input);
      expect(result).toEqual(input);
    });
  });

  describe("invalid payment info", () => {
    // EDGE-2: Error message now says "positive" instead of "non-negative"
    it("rejects negative amount", () => {
      const input = { amount: -10, method: "cash" };
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain("positive");
      }
    });

    it("rejects invalid method", () => {
      const input = { amount: 100, method: "check" };
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects missing amount", () => {
      const input = { method: "cash" };
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects missing method", () => {
      const input = { amount: 100 };
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects string amount", () => {
      const input = { amount: "100", method: "cash" };
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects empty object", () => {
      const input = {};
      const result = paymentInfoSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it("rejects null", () => {
      const result = paymentInfoSchema.safeParse(null);
      expect(result.success).toBe(false);
    });

    it("rejects undefined", () => {
      const result = paymentInfoSchema.safeParse(undefined);
      expect(result.success).toBe(false);
    });
  });
});

describe("validatePaymentInfo", () => {
  describe("valid inputs", () => {
    it("returns parsed data for valid cash payment", () => {
      const input = { amount: 100, method: "cash" };
      const result = validatePaymentInfo(input);
      expect(result).toEqual(input);
    });

    it("returns parsed data for valid card payment", () => {
      const input = { amount: 500, method: "card" };
      const result = validatePaymentInfo(input);
      expect(result).toEqual(input);
    });

    it("returns parsed data for valid transfer payment", () => {
      const input = { amount: 1000, method: "transfer" };
      const result = validatePaymentInfo(input);
      expect(result).toEqual(input);
    });
  });

  describe("invalid inputs", () => {
    it("throws ZodError for negative amount", () => {
      const input = { amount: -50, method: "cash" };
      expect(() => validatePaymentInfo(input)).toThrow(z.ZodError);
    });

    it("throws ZodError for invalid method", () => {
      const input = { amount: 100, method: "invalid" };
      expect(() => validatePaymentInfo(input)).toThrow(z.ZodError);
    });

    it("throws ZodError for missing fields", () => {
      expect(() => validatePaymentInfo({})).toThrow(z.ZodError);
    });

    it("throws ZodError for null input", () => {
      expect(() => validatePaymentInfo(null)).toThrow(z.ZodError);
    });

    it("throws ZodError for string input", () => {
      expect(() => validatePaymentInfo("not an object")).toThrow(z.ZodError);
    });
  });
});

describe("safeParsePaymentInfo", () => {
  describe("valid inputs", () => {
    it("returns success with data for valid input", () => {
      const input = { amount: 100, method: "cash" };
      const result = safeParsePaymentInfo(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual(input);
      }
    });

    it("returns PaymentInfo type on success", () => {
      const input = { amount: 250, method: "card" };
      const result = safeParsePaymentInfo(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        const paymentInfo: PaymentInfo = result.data;
        expect(paymentInfo.amount).toBe(250);
        expect(paymentInfo.method).toBe("card");
      }
    });
  });

  describe("invalid inputs", () => {
    it("returns failure with ZodError for negative amount", () => {
      const input = { amount: -50, method: "cash" };
      const result = safeParsePaymentInfo(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(z.ZodError);
      }
    });

    it("returns failure with ZodError for invalid method", () => {
      const input = { amount: 100, method: "paypal" };
      const result = safeParsePaymentInfo(input);
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(z.ZodError);
      }
    });

    it("returns failure with ZodError for missing fields", () => {
      const result = safeParsePaymentInfo({});
      
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(z.ZodError);
        // Should have errors for both missing fields
        expect(result.error.issues.length).toBeGreaterThanOrEqual(2);
      }
    });

    it("returns failure for null input", () => {
      const result = safeParsePaymentInfo(null);
      
      expect(result.success).toBe(false);
    });

    it("returns failure for undefined input", () => {
      const result = safeParsePaymentInfo(undefined);
      
      expect(result.success).toBe(false);
    });

    it("does not throw for invalid input", () => {
      expect(() => safeParsePaymentInfo({ invalid: "data" })).not.toThrow();
    });
  });
});

describe("Type exports", () => {
  it("PaymentMethod type allows valid values", () => {
    const cash: PaymentMethod = "cash";
    const card: PaymentMethod = "card";
    const transfer: PaymentMethod = "transfer";
    
    expect(cash).toBe("cash");
    expect(card).toBe("card");
    expect(transfer).toBe("transfer");
  });

  it("PaymentInfo type has correct structure", () => {
    const payment: PaymentInfo = {
      amount: 100,
      method: "cash"
    };
    
    expect(payment.amount).toBe(100);
    expect(payment.method).toBe("cash");
  });
});
