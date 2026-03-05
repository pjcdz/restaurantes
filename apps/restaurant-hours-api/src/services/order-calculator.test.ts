import { describe, expect, it } from "vitest";

import {
  calculateOrderTotals,
  calculateLineSubtotal,
  calculateChange,
  InsufficientPaymentError
} from "./order-calculator";

describe("calculateLineSubtotal", () => {
  it("calculates subtotal for single item", () => {
    const subtotal = calculateLineSubtotal(1, 100);
    expect(subtotal).toBe(100);
  });

  it("calculates subtotal for multiple quantities", () => {
    const subtotal = calculateLineSubtotal(3, 100);
    expect(subtotal).toBe(300);
  });

  it("returns zero for zero quantity", () => {
    const subtotal = calculateLineSubtotal(0, 100);
    expect(subtotal).toBe(0);
  });

  it("handles decimal prices", () => {
    const subtotal = calculateLineSubtotal(2, 99.99);
    expect(subtotal).toBeCloseTo(199.98);
  });
});

describe("calculateOrderTotals", () => {
  it("returns the correct total for bacon king plus veggie power", () => {
    const result = calculateOrderTotals([
      {
        producto: "Bacon King",
        cantidad: 1,
        precioUnitario: 11200
      },
      {
        producto: "Veggie Power",
        cantidad: 1,
        precioUnitario: 9500
      }
    ]);

    expect(result.total).toBe(20700);
    expect(result.subtotals).toEqual({
      "Bacon King": 11200,
      "Veggie Power": 9500
    });
  });

  it("returns the correct total for duplicate quantities", () => {
    const result = calculateOrderTotals([
      {
        producto: "La Clásica Smash",
        cantidad: 2,
        precioUnitario: 8500
      }
    ]);

    expect(result.total).toBe(17000);
    expect(result.subtotals).toEqual({
      "La Clásica Smash": 17000
    });
  });

  it("returns zero total for empty order", () => {
    const result = calculateOrderTotals([]);
    expect(result.total).toBe(0);
    expect(result.subtotals).toEqual({});
  });

  it("aggregates subtotals for same product", () => {
    const result = calculateOrderTotals([
      {
        producto: "Hamburguesa",
        cantidad: 2,
        precioUnitario: 100
      },
      {
        producto: "Hamburguesa",
        cantidad: 1,
        precioUnitario: 100
      }
    ]);

    expect(result.total).toBe(300);
    expect(result.subtotals["Hamburguesa"]).toBe(300);
  });

  it("handles multiple different products", () => {
    const result = calculateOrderTotals([
      { producto: "Item A", cantidad: 1, precioUnitario: 100 },
      { producto: "Item B", cantidad: 2, precioUnitario: 200 },
      { producto: "Item C", cantidad: 3, precioUnitario: 300 }
    ]);

    expect(result.total).toBe(100 + 400 + 900);
    expect(result.subtotals).toEqual({
      "Item A": 100,
      "Item B": 400,
      "Item C": 900
    });
  });
});

describe("calculateChange", () => {
  describe("exact payment", () => {
    it("returns zero when payment equals order total", () => {
      const change = calculateChange(100, 100);
      expect(change).toBe(0);
    });

    it("returns zero for large exact payment", () => {
      const change = calculateChange(50000, 50000);
      expect(change).toBe(0);
    });
  });

  describe("overpayment", () => {
    it("calculates change for overpayment", () => {
      const change = calculateChange(100, 150);
      expect(change).toBe(50);
    });

    it("calculates change for large overpayment", () => {
      const change = calculateChange(10000, 20000);
      expect(change).toBe(10000);
    });

    it("handles small overpayment", () => {
      const change = calculateChange(100, 101);
      expect(change).toBe(1);
    });
  });

  describe("underpayment", () => {
    it("throws InsufficientPaymentError for underpayment", () => {
      expect(() => calculateChange(100, 50)).toThrow(InsufficientPaymentError);
    });

    it("includes order total in error", () => {
      try {
        calculateChange(100, 50);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientPaymentError);
        expect((error as InsufficientPaymentError).orderTotal).toBe(100);
      }
    });

    it("includes payment amount in error", () => {
      try {
        calculateChange(100, 50);
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(InsufficientPaymentError);
        expect((error as InsufficientPaymentError).paymentAmount).toBe(50);
      }
    });

    it("throws for zero payment on non-zero order", () => {
      expect(() => calculateChange(100, 0)).toThrow(InsufficientPaymentError);
    });
  });

  describe("zero order total", () => {
    it("returns payment amount when order total is zero", () => {
      const change = calculateChange(0, 100);
      expect(change).toBe(100);
    });

    it("returns zero when both are zero", () => {
      const change = calculateChange(0, 0);
      expect(change).toBe(0);
    });
  });

  describe("decimal amounts", () => {
    it("handles decimal order total", () => {
      const change = calculateChange(99.99, 100);
      expect(change).toBeCloseTo(0.01);
    });

    it("handles decimal payment", () => {
      const change = calculateChange(100, 150.50);
      expect(change).toBeCloseTo(50.50);
    });

    it("handles both decimal", () => {
      const change = calculateChange(99.50, 100.00);
      expect(change).toBeCloseTo(0.50);
    });
  });
});

describe("InsufficientPaymentError", () => {
  it("is an instance of Error", () => {
    const error = new InsufficientPaymentError(100, 50);
    expect(error).toBeInstanceOf(Error);
  });

  it("has correct name property", () => {
    const error = new InsufficientPaymentError(100, 50);
    expect(error.name).toBe("InsufficientPaymentError");
  });

  it("includes amounts in message", () => {
    const error = new InsufficientPaymentError(100, 50);
    expect(error.message).toContain("50");
    expect(error.message).toContain("100");
  });

  it("exposes orderTotal property", () => {
    const error = new InsufficientPaymentError(100, 50);
    expect(error.orderTotal).toBe(100);
  });

  it("exposes paymentAmount property", () => {
    const error = new InsufficientPaymentError(100, 50);
    expect(error.paymentAmount).toBe(50);
  });
});
