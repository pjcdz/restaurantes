/**
 * Tests for Order Schema V2 - SRS v4
 */

import { describe, it, expect } from "vitest";
import {
  CartAction,
  detectCartAction,
  detectOrderCancellation,
  detectOrderConfirmation,
  extractQuantityV2,
  cleanProductName,
  validateCartActionForState,
  applyCartAction,
  normalizeOrderText
} from "./order-schema-v2.js";

describe("Order Schema V2 - normalizeOrderText", () => {
  it("should normalize text with diacritics", () => {
    expect(normalizeOrderText("HamburguéSas")).toBe("hamburguesas");
    expect(normalizeOrderText("Papás")).toBe("papas");
  });

  it("should convert to lowercase", () => {
    expect(normalizeOrderText("HAMBURGUESAS")).toBe("hamburguesas");
  });

  it("should trim whitespace", () => {
    expect(normalizeOrderText("  hamburguesas  ")).toBe("hamburguesas");
  });
});

describe("Order Schema V2 - detectCartAction", () => {
  it("should detect 'add' action for order messages", () => {
    expect(detectCartAction("quiero hamburguesas")).toBe("add");
    expect(detectCartAction("quisiera papas")).toBe("add");
    expect(detectCartAction("pedir 2 hamburguesas")).toBe("add");
  });

  it("should detect 'remove' action", () => {
    expect(detectCartAction("no quiero papas")).toBe("remove");
    expect(detectCartAction("sacar hamburguesas")).toBe("remove");
    expect(detectCartAction("quitar las papas")).toBe("remove");
    expect(detectCartAction("olvidé, no quiero eso")).toBe("remove");
  });

  it("should detect 'replace' action", () => {
    expect(detectCartAction("cambiar por papas")).toBe("replace");
    expect(detectCartAction("en su lugar quiero gaseosa")).toBe("replace");
    expect(detectCartAction("corregir, ahora quiero papas")).toBe("replace");
  });

  it("should detect 'clear' action", () => {
    expect(detectCartAction("cancelar todo")).toBe("clear");
    expect(detectCartAction("empezar de nuevo")).toBe("clear");
    expect(detectCartAction("borrar todo")).toBe("clear");
    expect(detectCartAction("olvidar todo")).toBe("clear");
  });
});

describe("Order Schema V2 - detectOrderCancellation", () => {
  it("should detect order cancellation", () => {
    const result = detectOrderCancellation("cancelar todo");
    expect(result.isCancellation).toBe(true);
    expect(result.reason).toBe("user_requested");
  });

  it("should detect clear as cancellation", () => {
    const result = detectOrderCancellation("limpiar carrito");
    expect(result.isCancellation).toBe(true);
  });

  it("should not detect cancellation in order messages", () => {
    const result = detectOrderCancellation("quiero 2 hamburguesas");
    expect(result.isCancellation).toBe(false);
  });
});

describe("Order Schema V2 - detectOrderConfirmation", () => {
  it("should detect order confirmation", () => {
    expect(detectOrderConfirmation("sí")).toBe(true);
    expect(detectOrderConfirmation("si, confirmo")).toBe(true);
    expect(detectOrderConfirmation("ok, adelante")).toBe(true);
  });

  it("should not detect confirmation in order messages", () => {
    expect(detectOrderConfirmation("quiero 2 hamburguesas")).toBe(false);
  });
});

describe("Order Schema V2 - extractQuantityV2", () => {
  it("should extract numeric quantity", () => {
    expect(extractQuantityV2("2 hamburguesas")).toBe(2);
    expect(extractQuantityV2("hamburguesas 3")).toBe(3);
    expect(extractQuantityV2("5 papas")).toBe(5);
  });

  it("should extract Spanish number words", () => {
    expect(extractQuantityV2("dos hamburguesas")).toBe(2);
    expect(extractQuantityV2("tres papas")).toBe(3);
    expect(extractQuantityV2("una hamburguesa")).toBe(1);
    expect(extractQuantityV2("una hamburguesa")).toBe(1); // un(a)?
  });

  it("should default to 1 for missing quantity", () => {
    expect(extractQuantityV2("hamburguesas")).toBe(1);
    expect(extractQuantityV2("papas")).toBe(1);
  });
});

describe("Order Schema V2 - cleanProductName", () => {
  it("should remove stopwords from product name", () => {
    expect(cleanProductName("quiero 2 hamburguesas")).toBe("2 hamburguesas");
    expect(cleanProductName("dame una hamburguesa")).toBe("hamburguesa");
    expect(cleanProductName("por favor, 3 papas")).toBe("3 papas");
  });

  it("should preserve product name with numbers", () => {
    expect(cleanProductName("cocacola")).toBe("cocacola");
    expect(cleanProductName("papas 300")).toBe("papas 300");
  });
});

describe("Order Schema V2 - validateCartActionForState", () => {
  it("should allow remove action when cart has items", () => {
    const currentCart = [
      { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 }
    ];

    const result = validateCartActionForState("remove", currentCart);

    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("should reject remove action when cart is empty", () => {
    const result = validateCartActionForState("remove", []);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("No hay items en el carrito para quitar.");
  });

  it("should allow clear action when cart has items", () => {
    const currentCart = [
      { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 }
    ];

    const result = validateCartActionForState("clear", currentCart);

    expect(result.valid).toBe(true);
  });

  it("should reject clear action when cart is empty", () => {
    const result = validateCartActionForState("clear", []);

    expect(result.valid).toBe(false);
    expect(result.reason).toBe("El carrito ya está vacío.");
  });
});

describe("Order Schema V2 - applyCartAction", () => {
  const baseItem = { producto: "Hamburguesa", cantidad: 1, precioUnitario: 7000 };

  it("should add new item to empty cart", () => {
    const result = applyCartAction([], baseItem, "add");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(baseItem);
  });

  it("should add new item to existing cart with different product", () => {
    const cart = [{ producto: "Papas", cantidad: 2, precioUnitario: 3000 }];
    const newItem = { producto: "Gaseosa", cantidad: 1, precioUnitario: 1500 };

    const result = applyCartAction(cart, newItem, "add");

    expect(result).toHaveLength(2);
    expect(result[0].producto).toBe("Papas");
    expect(result[1].producto).toBe("Gaseosa");
  });

  it("should accumulate quantity when adding same product", () => {
    const cart = [baseItem];
    const newItem = { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 };

    const result = applyCartAction(cart, newItem, "add");

    expect(result).toHaveLength(1);
    expect(result[0].cantidad).toBe(3); // 1 + 2
  });

  it("should remove item from cart", () => {
    const cart = [
      { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 },
      { producto: "Papas", cantidad: 1, precioUnitario: 3000 }
    ];

    const result = applyCartAction(cart, { producto: "Papas" }, "remove");

    expect(result).toHaveLength(1);
    expect(result[0].producto).toBe("Hamburguesa");
  });

  it("should replace entire cart", () => {
    const cart = [
      { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 },
      { producto: "Papas", cantidad: 1, precioUnitario: 3000 }
    ];

    const newItem = { producto: "Gaseosa", cantidad: 1, precioUnitario: 1500 };

    const result = applyCartAction(cart, newItem, "replace");

    expect(result).toHaveLength(1);
    expect(result[0].producto).toBe("Gaseosa");
  });

  it("should clear cart", () => {
    const cart = [
      { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 },
      { producto: "Papas", cantidad: 1, precioUnitario: 3000 }
    ];

    const result = applyCartAction(cart, {}, "clear");

    expect(result).toHaveLength(0);
  });
});

describe("Order Schema V2 - CartAction type", () => {
  it("should accept valid cart actions", () => {
    const actions: CartAction[] = ["add", "remove", "replace", "clear"];

    actions.forEach(action => {
      expect(action).toBe(action);
    });
  });
});
