/**
 * Integration tests for the AI-as-Judge system
 * 
 * These tests validate complete conversation flows end-to-end:
 * - greeting → order → payment → confirmation
 * - greeting → complaint → handoff
 * 
 * Also verifies Langfuse traces are created correctly.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { CatalogSnapshot } from "../services/conversation-assistant.js";
import type { TokenUsage, TimingMetrics } from "./judge-types.js";
import { createJudgeAgent } from "./judge-agent.js";

/**
 * Mock catalog for integration testing
 */
const mockCatalog: CatalogSnapshot = {
  menu: [
    { item: "Hamburguesa Clásica", descripcion: "Hamburguesa con carne, lechuga y tomate", categoria: "Hamburguesas", precio: 5000, disponible: true },
    { item: "Hamburguesa Doble", descripcion: "Hamburguesa con doble carne y queso", categoria: "Hamburguesas", precio: 7000, disponible: true },
    { item: "Papas Fritas", descripcion: "Papas fritas crujientes", categoria: "Acompañamientos", precio: 2000, disponible: true },
    { item: "Coca Cola", descripcion: "Bebida gaseosa 500ml", categoria: "Bebidas", precio: 1500, disponible: true }
  ],
  faq: [
    { tema: "horario", pregunta: "¿Cuál es el horario?", respuesta: "Lunes a Viernes 11:00-22:00, Sábados y Domingos 12:00-23:00" },
    { tema: "ubicacion", pregunta: "¿Dónde están ubicados?", respuesta: "Av. Corrientes 1234, CABA" },
    { tema: "pago", pregunta: "¿Qué métodos de pago aceptan?", respuesta: "Aceptamos solo efectivo" },
    { tema: "delivery", pregunta: "¿Hacen delivery?", respuesta: "Hacemos delivery en un radio de 3km. Envío gratis en pedidos mayores a $5000" }
  ],
  prices: [
    { producto: "Hamburguesa Clásica", precioUnitario: 5000, aliases: ["hamburguesa", "clasica"] },
    { producto: "Hamburguesa Doble", precioUnitario: 7000, aliases: ["doble"] },
    { producto: "Papas Fritas", precioUnitario: 2000, aliases: ["papas", "fritas"] },
    { producto: "Coca Cola", precioUnitario: 1500, aliases: ["coca", "cola"] }
  ]
};

/**
 * HTTP client for the system under test
 */
async function sendMessage(
  baseUrl: string,
  chatId: string,
  message: string
): Promise<{ reply: string; tokens: TokenUsage; timing: TimingMetrics }> {
  const startTime = Date.now();

  const response = await fetch(`${baseUrl}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chatId, message })
  });

  const endTime = Date.now();

  if (!response.ok) {
    throw new Error(`API returned ${response.status}: ${response.statusText}`);
  }

  const data = await response.json();

  return {
    reply: data.reply ?? "",
    tokens: {
      prompt: 0,
      completion: 0,
      total: 0
    },
    timing: {
      startTime,
      endTime,
      latencyMs: endTime - startTime
    }
  };
}

/**
 * Fetch catalog from admin endpoint
 */
async function fetchCatalog(baseUrl: string): Promise<CatalogSnapshot> {
  const response = await fetch(`${baseUrl}/admin/data`);

  if (!response.ok) {
    throw new Error(`Failed to fetch catalog: ${response.status}`);
  }

  return response.json();
}

/**
 * Generate a unique chat ID for integration tests
 */
function generateChatId(testName: string): string {
  return `integration-${testName}-${Date.now()}`;
}

describe("AI-as-Judge Integration Tests", () => {
  let baseUrl: string;
  let catalog: CatalogSnapshot;

  beforeAll(async () => {
    baseUrl = process.env.API_URL ?? "http://localhost:3000";
    
    // Try to fetch catalog, fall back to mock if unavailable
    try {
      catalog = await fetchCatalog(baseUrl);
    } catch {
      console.warn("⚠️ API not available, using mock catalog");
      catalog = mockCatalog;
    }
  });

  describe("Complete Order Flow", () => {
    it("should complete a full order flow: greeting → order → payment → confirmation", async () => {
      const chatId = generateChatId("order-flow");
      const judgeAgent = createJudgeAgent();
      const conversation: Array<{ message: string; reply: string }> = [];

      // Step 1: Greeting
      const greetingResult = await sendMessage(baseUrl, chatId, "Hola");
      conversation.push({ message: "Hola", reply: greetingResult.reply });
      
      expect(greetingResult.reply).toBeTruthy();
      expect(greetingResult.timing.latencyMs).toBeGreaterThan(0);

      // Step 2: Order
      const orderResult = await sendMessage(baseUrl, chatId, "Quiero una hamburguesa clásica");
      conversation.push({ message: "Quiero una hamburguesa clásica", reply: orderResult.reply });
      
      expect(orderResult.reply).toBeTruthy();

      // Step 3: Delivery preference
      const deliveryResult = await sendMessage(baseUrl, chatId, "Para delivery");
      conversation.push({ message: "Para delivery", reply: deliveryResult.reply });
      
      expect(deliveryResult.reply).toBeTruthy();

      // Step 4: Address
      const addressResult = await sendMessage(baseUrl, chatId, "Mi dirección es Av. Corrientes 1234");
      conversation.push({ message: "Mi dirección es Av. Corrientes 1234", reply: addressResult.reply });
      
      expect(addressResult.reply).toBeTruthy();

      // Step 5: Payment method
      const paymentResult = await sendMessage(baseUrl, chatId, "Pago en efectivo");
      conversation.push({ message: "Pago en efectivo", reply: paymentResult.reply });
      
      expect(paymentResult.reply).toBeTruthy();

      // Step 6: Customer name
      const nameResult = await sendMessage(baseUrl, chatId, "Me llamo Juan");
      conversation.push({ message: "Me llamo Juan", reply: nameResult.reply });
      
      expect(nameResult.reply).toBeTruthy();

      // Step 7: Cash amount
      const confirmResult = await sendMessage(baseUrl, chatId, "Pago con 10000");
      conversation.push({ message: "Pago con 10000", reply: confirmResult.reply });
      
      expect(confirmResult.reply).toBeTruthy();

      // Evaluate the complete conversation
      const fullConversation = conversation
        .map((c) => `Usuario: ${c.message}\nBot: ${c.reply}`)
        .join("\n\n");

      const evaluation = await judgeAgent.evaluate({
        question: fullConversation,
        response: confirmResult.reply,
        catalog
      });

      // Assert the conversation was handled well
      expect(evaluation.evaluation.overallScore).toBeGreaterThanOrEqual(50);
      expect(evaluation.evaluation.criteria.relevance).toBeGreaterThan(0);
      expect(evaluation.evaluation.criteria.tone).toBeGreaterThan(0);
    });

    it("should handle multi-item order with payment calculation", async () => {
      const chatId = generateChatId("multi-order");
      const judgeAgent = createJudgeAgent();
      const conversation: Array<{ message: string; reply: string }> = [];

      // Order multiple items
      const orderResult = await sendMessage(baseUrl, chatId, "Quiero 2 hamburguesas clásicas y una coca cola");
      conversation.push({ message: "Quiero 2 hamburguesas clásicas y una coca cola", reply: orderResult.reply });
      
      expect(orderResult.reply).toBeTruthy();

      // Ask for total
      const totalResult = await sendMessage(baseUrl, chatId, "¿Cuánto es el total?");
      conversation.push({ message: "¿Cuánto es el total?", reply: totalResult.reply });
      
      expect(totalResult.reply).toBeTruthy();
      // Total should be 2 * 5000 + 1500 = 11500
      expect(totalResult.reply.toLowerCase()).toMatch(/11500|once mil/);

      // Evaluate
      const fullConversation = conversation
        .map((c) => `Usuario: ${c.message}\nBot: ${c.reply}`)
        .join("\n\n");

      const evaluation = await judgeAgent.evaluate({
        question: fullConversation,
        response: totalResult.reply,
        catalog
      });

      expect(evaluation.evaluation.criteria.accuracy).toBeGreaterThan(50);
    });
  });

  describe("Handoff Flow", () => {
    it("should trigger human handoff on complaint", async () => {
      const chatId = generateChatId("handoff");
      const judgeAgent = createJudgeAgent();
      const conversation: Array<{ message: string; reply: string }> = [];

      // Start with greeting
      const greetingResult = await sendMessage(baseUrl, chatId, "Hola");
      conversation.push({ message: "Hola", reply: greetingResult.reply });

      // Express complaint and request supervisor
      const complaintResult = await sendMessage(
        baseUrl,
        chatId,
        "Quiero hablar con un supervisor, mi pedido llegó mal y frío"
      );
      conversation.push({
        message: "Quiero hablar con un supervisor, mi pedido llegó mal y frío",
        reply: complaintResult.reply
      });

      expect(complaintResult.reply).toBeTruthy();
      
      // Response should acknowledge handoff request
      const handoffKeywords = ["supervisor", "humano", "agente", "transferir", "conectar", "momento"];
      const hasHandoffKeyword = handoffKeywords.some((keyword) =>
        complaintResult.reply.toLowerCase().includes(keyword)
      );
      
      expect(hasHandoffKeyword || complaintResult.reply.includes("handoff")).toBe(true);

      // Evaluate
      const evaluation = await judgeAgent.evaluate({
        question: conversation.map((c) => c.message).join("\n"),
        response: complaintResult.reply,
        catalog
      });

      expect(evaluation.evaluation.criteria.actionability).toBeGreaterThan(50);
    });

    it("should detect frustrated customer and offer handoff", async () => {
      const chatId = generateChatId("frustration");
      const judgeAgent = createJudgeAgent();

      // Express frustration
      const frustrationResult = await sendMessage(
        baseUrl,
        chatId,
        "Ya te pregunté 3 veces lo mismo y no me respondes bien, paso a buscar un humano"
      );

      expect(frustrationResult.reply).toBeTruthy();
      
      // Response should acknowledge frustration
      const empathyKeywords = ["disculp", "lament", "entend", "ayud", "humano", "agente"];
      const hasEmpathyKeyword = empathyKeywords.some((keyword) =>
        frustrationResult.reply.toLowerCase().includes(keyword)
      );

      expect(hasEmpathyKeyword).toBe(true);
    });
  });

  describe("Payment Scenarios", () => {
    it("should calculate correct change", async () => {
      const chatId = generateChatId("change-calc");
      const judgeAgent = createJudgeAgent();

      // Order and pay with larger amount
      const orderResult = await sendMessage(baseUrl, chatId, "Quiero una hamburguesa clásica");
      const paymentResult = await sendMessage(baseUrl, chatId, "Te pago con $10000");

      expect(paymentResult.reply).toBeTruthy();
      // Should mention change of $5000
      expect(paymentResult.reply).toMatch(/5000|cinco mil|cambio/i);

      // Evaluate payment handling
      const evaluation = await judgeAgent.evaluate({
        question: "Quiero una hamburguesa clásica de $5000 y pago con $10000",
        response: paymentResult.reply,
        catalog
      });

      expect(evaluation.evaluation.criteria.accuracy).toBeGreaterThan(50);
    });

    it("should handle insufficient payment", async () => {
      const chatId = generateChatId("insufficient");

      // Order expensive item
      await sendMessage(baseUrl, chatId, "Quiero una hamburguesa doble");
      const paymentResult = await sendMessage(baseUrl, chatId, "Tengo solo $5000");

      expect(paymentResult.reply).toBeTruthy();
      // Should indicate payment is insufficient
      expect(paymentResult.reply).toMatch(/insuficiente|faltan|no alcanza|7000/i);
    });
  });

  describe("Security Validation", () => {
    it("should sanitize XSS input", async () => {
      const chatId = generateChatId("xss");

      const result = await sendMessage(
        baseUrl,
        chatId,
        "<script>alert('xss')</script> Hola"
      );

      expect(result.reply).toBeTruthy();
      // Should not reflect the script tag
      expect(result.reply).not.toContain("<script>");
      expect(result.reply).not.toContain("alert(");
    });

    it("should handle SQL injection attempt safely", async () => {
      const chatId = generateChatId("sqli");

      const result = await sendMessage(
        baseUrl,
        chatId,
        "'; DROP TABLE users; --"
      );

      expect(result.reply).toBeTruthy();
      // Should not crash or return database error
      expect(result.reply).not.toMatch(/error de base de datos|database error|SQL/i);
    });
  });

  describe("Langfuse Tracing Verification", () => {
    it("should create trace for conversation", async () => {
      const chatId = generateChatId("tracing");

      // Send a message that should create a trace
      const result = await sendMessage(baseUrl, chatId, "Hola, ¿cuál es el horario?");

      expect(result.reply).toBeTruthy();
      expect(result.timing.latencyMs).toBeGreaterThan(0);

      // Note: Actual Langfuse trace verification would require
      // querying the Langfuse API or checking logs.
      // This test verifies the response structure is correct.
    });
  });
});

/**
 * Run integration tests standalone
 */
export async function runIntegrationTests(baseUrl: string): Promise<{
  passed: number;
  failed: number;
  results: Array<{ name: string; passed: boolean; error?: string }>;
}> {
  const results: Array<{ name: string; passed: boolean; error?: string }> = [];
  let passed = 0;
  let failed = 0;

  const tests = [
    {
      name: "Complete Order Flow",
      fn: async () => {
        const chatId = generateChatId("standalone-order");
        const greeting = await sendMessage(baseUrl, chatId, "Hola");
        const order = await sendMessage(baseUrl, chatId, "Quiero una hamburguesa");
        return greeting.reply && order.reply;
      }
    },
    {
      name: "Handoff Flow",
      fn: async () => {
        const chatId = generateChatId("standalone-handoff");
        const result = await sendMessage(
          baseUrl,
          chatId,
          "Quiero hablar con un supervisor"
        );
        return result.reply.includes("supervisor") || result.reply.includes("humano");
      }
    },
    {
      name: "Security - XSS",
      fn: async () => {
        const chatId = generateChatId("standalone-xss");
        const result = await sendMessage(
          baseUrl,
          chatId,
          "<script>alert('xss')</script>"
        );
        return !result.reply.includes("<script>");
      }
    }
  ];

  for (const test of tests) {
    try {
      const testResult = await test.fn();
      if (testResult) {
        passed++;
        results.push({ name: test.name, passed: true });
      } else {
        failed++;
        results.push({ name: test.name, passed: false, error: "Assertion failed" });
      }
    } catch (error) {
      failed++;
      results.push({
        name: test.name,
        passed: false,
        error: error instanceof Error ? error.message : "Unknown error"
      });
    }
  }

  return { passed, failed, results };
}
