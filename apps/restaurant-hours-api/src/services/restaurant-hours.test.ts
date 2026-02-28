import { describe, expect, it } from "vitest";

import { getRestaurantAvailability } from "./restaurant-hours";

describe("getRestaurantAvailability", () => {
  it("returns open during business hours", () => {
    const result = getRestaurantAvailability(new Date("2026-02-28T15:00:00.000Z"));

    expect(result).toEqual({
      open: true,
      status: "open",
      message: "El restaurante esta abierto."
    });
  });

  it("returns closed before opening time", () => {
    const result = getRestaurantAvailability(new Date("2026-02-28T11:59:00.000Z"));

    expect(result).toEqual({
      open: false,
      status: "closed",
      message: "El restaurante esta cerrado."
    });
  });

  it("treats exactly 09:00 as open", () => {
    const result = getRestaurantAvailability(new Date("2026-02-28T12:00:00.000Z"));

    expect(result.status).toBe("open");
  });

  it("treats exactly 23:00 as closed", () => {
    const result = getRestaurantAvailability(new Date("2026-03-01T02:00:00.000Z"));

    expect(result.status).toBe("closed");
  });
});
