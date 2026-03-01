import { describe, expect, it } from "vitest";

import { calculateOrderTotals } from "./order-calculator";

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
});
