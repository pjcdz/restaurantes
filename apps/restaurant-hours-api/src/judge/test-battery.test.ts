/**
 * Unit tests for the test battery definitions
 * 
 * These tests verify:
 * - All test cases have required fields
 * - Category groupings are correct
 * - Test IDs are unique
 */

import { describe, it, expect, beforeAll } from "vitest";
import { generateTestBattery } from "./test-battery.js";
import type { CatalogSnapshot, TestCategory, TestCase } from "./judge-types.js";

/**
 * Mock catalog for testing
 */
const mockCatalog: CatalogSnapshot = {
  menu: [
    { item: "Hamburguesa Clásica", descripcion: "Hamburguesa con carne, lechuga y tomate", categoria: "Hamburguesas", precio: 5000, disponible: true },
    { item: "Hamburguesa Doble", descripcion: "Hamburguesa con doble carne y queso", categoria: "Hamburguesas", precio: 7000, disponible: true },
    { item: "Papas Fritas", descripcion: "Papas fritas crujientes", categoria: "Acompañamientos", precio: 2000, disponible: true },
    { item: "Coca Cola", descripcion: "Bebida gaseosa 500ml", categoria: "Bebidas", precio: 1500, disponible: true },
    { item: "Ensalada César", descripcion: "Ensalada con pollo y aderezo césar", categoria: "Ensaladas", precio: 4500, disponible: false }
  ],
  faq: [
    { tema: "horario", pregunta: "¿Cuál es el horario?", respuesta: "Lunes a Viernes 11:00-22:00" },
    { tema: "ubicacion", pregunta: "¿Dónde están ubicados?", respuesta: "Av. Corrientes 1234, CABA" },
    { tema: "pago", pregunta: "¿Qué métodos de pago aceptan?", respuesta: "Aceptamos solo efectivo" },
    { tema: "delivery", pregunta: "¿Hacen delivery?", respuesta: "Hacemos delivery en un radio de 3km" }
  ],
  prices: [
    { producto: "Hamburguesa Clásica", precioUnitario: 5000, aliases: ["hamburguesa", "clasica"] },
    { producto: "Hamburguesa Doble", precioUnitario: 7000, aliases: ["doble"] },
    { producto: "Papas Fritas", precioUnitario: 2000, aliases: ["papas", "fritas"] },
    { producto: "Coca Cola", precioUnitario: 1500, aliases: ["coca", "cola"] },
    { producto: "Ensalada César", precioUnitario: 4500, aliases: ["ensalada", "cesar"] }
  ]
};

describe("Test Battery", () => {
  describe("generateTestBattery", () => {
    it("should generate test cases from catalog", () => {
      const tests = generateTestBattery(mockCatalog);
      
      expect(tests).toBeInstanceOf(Array);
      expect(tests.length).toBeGreaterThan(0);
    });

    it("should generate tests for all categories", () => {
      const tests = generateTestBattery(mockCatalog);
      const categories = new Set(tests.map((t) => t.category));

      // Core categories that should always be present
      expect(categories.has("greeting")).toBe(true);
      expect(categories.has("faq")).toBe(true);
      expect(categories.has("menu")).toBe(true);
      expect(categories.has("single_order")).toBe(true);
      expect(categories.has("multi_order")).toBe(true);
      expect(categories.has("workflow")).toBe(true);
      expect(categories.has("edge_case")).toBe(true);
      
      // New categories from JDG-01 to JDG-04
      expect(categories.has("payment")).toBe(true);
      expect(categories.has("handoff")).toBe(true);
      expect(categories.has("security")).toBe(true);
      expect(categories.has("resilience")).toBe(true);
    });

    it("should have unique test IDs", () => {
      const tests = generateTestBattery(mockCatalog);
      const ids = tests.map((t) => t.id);
      const uniqueIds = new Set(ids);

      expect(uniqueIds.size).toBe(ids.length);
    });
  });

  describe("TestCase structure", () => {
    let tests: Array<TestCase>;

    beforeAll(() => {
      tests = generateTestBattery(mockCatalog);
    });

    it("should have all required fields for each test case", () => {
      for (const test of tests) {
        expect(test.id).toBeDefined();
        expect(test.id).toBeTruthy();
        expect(typeof test.id).toBe("string");

        expect(test.category).toBeDefined();
        expect(typeof test.category).toBe("string");

        expect(test.description).toBeDefined();
        expect(test.description).toBeTruthy();
        expect(typeof test.description).toBe("string");

        expect(test.messages).toBeDefined();
        expect(Array.isArray(test.messages)).toBe(true);
        expect(test.messages.length).toBeGreaterThan(0);

        expect(test.expectedBehavior).toBeDefined();
        expect(test.expectedBehavior).toBeTruthy();
        expect(typeof test.expectedBehavior).toBe("string");
      }
    });

    it("should have valid category values", () => {
      const validCategories: Array<TestCategory> = [
        "edge_case",
        "faq",
        "greeting",
        "handoff",
        "menu",
        "multi_order",
        "payment",
        "resilience",
        "security",
        "single_order",
        "workflow"
      ];

      for (const test of tests) {
        expect(validCategories).toContain(test.category);
      }
    });

    it("should have non-empty messages array", () => {
      for (const test of tests) {
        expect(test.messages.length).toBeGreaterThan(0);
        
        for (const message of test.messages) {
          expect(typeof message).toBe("string");
        }
      }
    });
  });

  describe("Category-specific tests", () => {
    let tests: Array<TestCase>;

    beforeAll(() => {
      tests = generateTestBattery(mockCatalog);
    });

    describe("Greeting tests", () => {
      it("should have at least 3 greeting tests", () => {
        const greetingTests = tests.filter((t) => t.category === "greeting");
        expect(greetingTests.length).toBeGreaterThanOrEqual(3);
      });

      it("should test different greeting variations", () => {
        const greetingTests = tests.filter((t) => t.category === "greeting");
        const greetings = greetingTests.map((t) => t.messages[0].toLowerCase());
        
        expect(greetings.some((g) => g.includes("hola"))).toBe(true);
      });
    });

    describe("FAQ tests", () => {
      it("should have FAQ tests for catalog topics", () => {
        const faqTests = tests.filter((t) => t.category === "faq");
        expect(faqTests.length).toBeGreaterThan(0);
      });

      it("should include a combined FAQ and menu scenario", () => {
        const faqTests = tests.filter((t) => t.category === "faq");
        expect(faqTests.some((t) => t.id === "F6")).toBe(true);
      });
    });

    describe("Menu tests", () => {
      it("should have menu tests", () => {
        const menuTests = tests.filter((t) => t.category === "menu");
        expect(menuTests.length).toBeGreaterThan(0);
      });
    });

    describe("Single order tests", () => {
      it("should use actual product names from catalog", () => {
        const orderTests = tests.filter((t) => t.category === "single_order");
        const productNames = mockCatalog.menu.map((p) => p.item.toLowerCase());
        
        // At least one test should reference a product from the catalog
        const hasProductReference = orderTests.some((t) =>
          productNames.some((name) =>
            t.messages.some((m) => m.toLowerCase().includes(name.split(" ")[0]))
          )
        );
        
        expect(hasProductReference).toBe(true);
      });
    });

    describe("Multi-order tests", () => {
      it("should have multi-item order scenarios", () => {
        const multiOrderTests = tests.filter((t) => t.category === "multi_order");
        expect(multiOrderTests.length).toBeGreaterThan(0);
      });

      it("should include remove and replace cart scenarios", () => {
        const multiOrderTests = tests.filter((t) => t.category === "multi_order");
        expect(multiOrderTests.some((t) => t.id === "MO4")).toBe(true);
        expect(multiOrderTests.some((t) => t.id === "MO5")).toBe(true);
      });
    });

    describe("Workflow tests", () => {
      it("should have multi-message workflow tests", () => {
        const workflowTests = tests.filter((t) => t.category === "workflow");
        
        for (const test of workflowTests) {
          expect(test.messages.length).toBeGreaterThan(1);
        }
      });
    });

    describe("Edge case tests", () => {
      it("should test non-existent product handling", () => {
        const edgeTests = tests.filter((t) => t.category === "edge_case");
        const hasNonExistentTest = edgeTests.some((t) =>
          t.description.toLowerCase().includes("non-existent") ||
          t.description.toLowerCase().includes("no existe") ||
          t.expectedBehavior.toLowerCase().includes("not available") ||
          t.expectedBehavior.toLowerCase().includes("no disponible") ||
          t.expectedBehavior.toLowerCase().includes("alternatives")
        );
        
        expect(hasNonExistentTest).toBe(true);
      });

      it("should test cancellation handling", () => {
        const edgeTests = tests.filter((t) => t.category === "edge_case");
        const hasCancelTest = edgeTests.some((t) =>
          t.messages.some((m) => m.toLowerCase().includes("cancel"))
        );

        expect(hasCancelTest).toBe(true);
      });

      it("should include topic switch and active-order cancellation scenarios", () => {
        const edgeTests = tests.filter((t) => t.category === "edge_case");
        expect(edgeTests.some((t) => t.id === "E6")).toBe(true);
        expect(edgeTests.some((t) => t.id === "E7")).toBe(true);
      });
    });

    describe("Payment tests (JDG-01)", () => {
      it("should have payment test cases", () => {
        const paymentTests = tests.filter((t) => t.category === "payment");
        expect(paymentTests.length).toBeGreaterThan(0);
      });

      it("should test exact payment", () => {
        const paymentTests = tests.filter((t) => t.category === "payment");
        const hasExactPaymentTest = paymentTests.some((t) =>
          t.id === "PAY-01" || t.description.toLowerCase().includes("exacto")
        );
        
        expect(hasExactPaymentTest).toBe(true);
      });

      it("should test change calculation", () => {
        const paymentTests = tests.filter((t) => t.category === "payment");
        const hasChangeTest = paymentTests.some((t) =>
          t.id === "PAY-02" || t.description.toLowerCase().includes("cambio")
        );
        
        expect(hasChangeTest).toBe(true);
      });

      it("should test insufficient payment", () => {
        const paymentTests = tests.filter((t) => t.category === "payment");
        const hasInsufficientTest = paymentTests.some((t) =>
          t.id === "PAY-03" || t.description.toLowerCase().includes("insuficiente")
        );
        
        expect(hasInsufficientTest).toBe(true);
      });
    });

    describe("Handoff tests (JDG-02)", () => {
      it("should have handoff test cases", () => {
        const handoffTests = tests.filter((t) => t.category === "handoff");
        expect(handoffTests.length).toBeGreaterThan(0);
      });

      it("should test complaint-triggered handoff", () => {
        const handoffTests = tests.filter((t) => t.category === "handoff");
        const hasComplaintTest = handoffTests.some((t) =>
          t.id === "HANDOFF-01" || t.description.toLowerCase().includes("queja")
        );
        
        expect(hasComplaintTest).toBe(true);
      });

      it("should test supervisor request", () => {
        const handoffTests = tests.filter((t) => t.category === "handoff");
        const hasSupervisorTest = handoffTests.some((t) =>
          t.messages.some((m) => m.toLowerCase().includes("supervisor"))
        );

        expect(hasSupervisorTest).toBe(true);
      });

      it("should include automatic handoff after repeated errors", () => {
        const handoffTests = tests.filter((t) => t.category === "handoff");
        expect(handoffTests.some((t) => t.id === "HANDOFF-05")).toBe(true);
      });
    });

    describe("Security tests (JDG-03)", () => {
      it("should have security test cases", () => {
        const securityTests = tests.filter((t) => t.category === "security");
        expect(securityTests.length).toBeGreaterThan(0);
      });

      it("should test XSS prevention", () => {
        const securityTests = tests.filter((t) => t.category === "security");
        const hasXssTest = securityTests.some((t) =>
          t.id === "SEC-03" || t.description.toLowerCase().includes("xss")
        );
        
        expect(hasXssTest).toBe(true);
      });

      it("should test SQL injection prevention", () => {
        const securityTests = tests.filter((t) => t.category === "security");
        const hasSqlTest = securityTests.some((t) =>
          t.id === "SEC-04" || t.description.toLowerCase().includes("sql")
        );
        
        expect(hasSqlTest).toBe(true);
      });
    });

    describe("Resilience tests (JDG-04)", () => {
      it("should have resilience test cases", () => {
        const resilienceTests = tests.filter((t) => t.category === "resilience");
        expect(resilienceTests.length).toBeGreaterThan(0);
      });

      it("should test circuit breaker behavior", () => {
        const resilienceTests = tests.filter((t) => t.category === "resilience");
        const hasCircuitBreakerTest = resilienceTests.some((t) =>
          t.id === "RES-01" || t.description.toLowerCase().includes("circuit")
        );
        
        expect(hasCircuitBreakerTest).toBe(true);
      });

      it("should test graceful degradation", () => {
        const resilienceTests = tests.filter((t) => t.category === "resilience");
        const hasDegradationTest = resilienceTests.some((t) =>
          t.id === "RES-02" || t.description.toLowerCase().includes("degrad")
        );
        
        expect(hasDegradationTest).toBe(true);
      });
    });
  });

  describe("Empty catalog handling", () => {
    it("should handle empty menu gracefully", () => {
      const emptyCatalog: CatalogSnapshot = {
        menu: [],
        faq: mockCatalog.faq
      };

      const tests = generateTestBattery(emptyCatalog);
      
      // Should still generate greeting, FAQ, edge case, handoff, security, and resilience tests
      // Note: payment tests require product names from menu, so they won't be generated
      const categories = new Set(tests.map((t) => t.category));
      expect(categories.has("greeting")).toBe(true);
      expect(categories.has("faq")).toBe(true);
      expect(categories.has("edge_case")).toBe(true);
      expect(categories.has("handoff")).toBe(true);
      expect(categories.has("security")).toBe(true);
      expect(categories.has("resilience")).toBe(true);
    });

    it("should handle empty FAQ gracefully", () => {
      const emptyFaqCatalog: CatalogSnapshot = {
        menu: mockCatalog.menu,
        faq: []
      };

      const tests = generateTestBattery(emptyFaqCatalog);
      
      // Should still generate other tests
      expect(tests.length).toBeGreaterThan(0);
      
      // Menu and order tests should still work
      const categories = new Set(tests.map((t) => t.category));
      expect(categories.has("menu")).toBe(true);
      expect(categories.has("single_order")).toBe(true);
    });
  });

  describe("Test ID format", () => {
    it("should use consistent ID format", () => {
      const tests = generateTestBattery(mockCatalog);
      
      for (const test of tests) {
        // IDs should be alphanumeric with possible dashes
        expect(test.id).toMatch(/^[A-Z0-9-]+$/);
      }
    });

    it("should prefix IDs by category", () => {
      const tests = generateTestBattery(mockCatalog);
      
      const categoryPrefixes: Record<string, string[]> = {
        greeting: ["G"],
        faq: ["F"],
        menu: ["M"],
        single_order: ["O"],
        multi_order: ["MO"],
        workflow: ["W"],
        edge_case: ["E"],
        payment: ["PAY"],
        handoff: ["HANDOFF"],
        security: ["SEC"],
        resilience: ["RES"]
      };

      for (const test of tests) {
        const prefixes = categoryPrefixes[test.category];
        if (prefixes) {
          const hasValidPrefix = prefixes.some((prefix) => test.id.startsWith(prefix));
          expect(hasValidPrefix).toBe(true);
        }
      }
    });
  });
});
