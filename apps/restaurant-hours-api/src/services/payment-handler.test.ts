/**
 * Tests for Payment Handler - SRS v4
 */

import { describe, it, expect } from "vitest";
import {
  detectPaymentIntent,
  generatePaymentMethodsResponse,
  generateChangeResponse,
  generatePaymentAmountRequestResponse,
  generateOrderConfirmationResponse,
  validatePaymentAmount,
  extractPaymentAmount,
  isConfirmationResponse,
  generatePaymentErrorResponse,
  generateInsufficientAmountResponse
} from "./payment-handler.js";
import type { ConversationOrderDraft } from "./conversation-assistant.js";

describe("Payment Handler - detectPaymentIntent", () => {
  it("should detect payment_methods intent", () => {
    expect(detectPaymentIntent("como pago")).toBe("payment_methods");
    expect(detectPaymentIntent("formas de pago")).toBe("payment_methods");
    expect(detectPaymentIntent("qué aceptan")).toBe("payment_methods");
    expect(detectPaymentIntent("mercado pago")).toBe("payment_methods");
  });

  it("should detect payment_amount intent with numbers", () => {
    expect(detectPaymentIntent("$1000")).toBe("payment_amount");
    expect(detectPaymentIntent("1000")).toBe("payment_amount");
    expect(detectPaymentIntent("1000 pesos")).toBe("payment_amount");
  });

  it("should detect payment_confirmation intent", () => {
    expect(detectPaymentIntent("sí")).toBe("payment_confirmation");
    expect(detectPaymentIntent("confirmo")).toBe("payment_confirmation");
    expect(detectPaymentIntent("ok")).toBe("payment_confirmation");
    expect(detectPaymentIntent("listo")).toBe("payment_confirmation");
  });

  it("should detect payment_question intent", () => {
    expect(detectPaymentIntent("cuánto")).toBe("payment_question");
    expect(detectPaymentIntent("con cuánto")).toBe("payment_question");
    expect(detectPaymentIntent("tengo")).toBe("payment_question");
  });

  it("should return null for non-payment messages", () => {
    expect(detectPaymentIntent("hamburguesas")).toBeNull();
    expect(detectPaymentIntent("hola")).toBeNull();
    expect(detectPaymentIntent("agregame otra clasica")).toBeNull();
    expect(detectPaymentIntent("quiero una clasica")).toBeNull();
  });
});

describe("Payment Handler - extractPaymentAmount", () => {
  it("should extract amount with 'con' prefix", () => {
    expect(extractPaymentAmount("con 1000")).toBe(1000);
    expect(extractPaymentAmount("pago con 500")).toBe(500);
  });

  it("should extract amount with 'pago' prefix", () => {
    expect(extractPaymentAmount("pago 1500")).toBe(1500);
  });

  it("should extract amount with 'tengo' prefix", () => {
    expect(extractPaymentAmount("tengo 2000")).toBe(2000);
  });

  it("should extract amount with 'son' prefix", () => {
    expect(extractPaymentAmount("son 3000")).toBe(3000);
  });

  it("should extract standalone number", () => {
    expect(extractPaymentAmount("1000")).toBe(1000);
    expect(extractPaymentAmount("$1000")).toBe(1000);
  });

  it("should return null for non-payment messages", () => {
    expect(extractPaymentAmount("hamburguesas")).toBeNull();
    expect(extractPaymentAmount("hola")).toBeNull();
  });
});

describe("Payment Handler - validatePaymentAmount", () => {
  it("should accept exact payment", () => {
    const result = validatePaymentAmount(1000, 1000);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should accept payment greater than total", () => {
    const result = validatePaymentAmount(1500, 1000);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it("should reject payment less than total", () => {
    const result = validatePaymentAmount(800, 1000);
    expect(result.valid).toBe(false);
    expect(result.error).toBe("El monto ingresado (800) es menor al total del pedido (1000).");
  });
});

describe("Payment Handler - isConfirmationResponse", () => {
  it("should detect positive confirmation", () => {
    expect(isConfirmationResponse("sí")).toBe(true);
    expect(isConfirmationResponse("si")).toBe(true);
    expect(isConfirmationResponse("ok")).toBe(true);
    expect(isConfirmationResponse("confirmo")).toBe(true);
  });

  it("should detect non-confirmation messages", () => {
    expect(isConfirmationResponse("no")).toBe(false);
    expect(isConfirmationResponse("cancelar")).toBe(false);
    expect(isConfirmationResponse("hamburguesas")).toBe(false);
  });
});

describe("Payment Handler - generatePaymentMethodsResponse", () => {
  it("should generate response for cash only", () => {
    const config = {
      metodos: ["efectivo"],
      efectivoMinimo: 0,
      transferenciaBanco: "Banco Nación",
      transferenciaAlias: "RESTAULANG.ALIAS",
      transferenciaCBU: "0000003100012345678",
      entregaPago: "con_entrega",
    };

    const response = generatePaymentMethodsResponse(config);

    expect(response).toContain("Aceptamos los siguientes métodos de pago");
    expect(response).toContain("**Efectivo**");
    expect(response).not.toContain("Transferencia");
  });

  it("still exposes only cash in pre-MVP even if future methods exist in config", () => {
    const config = {
      metodos: ["efectivo", "transferencia"],
      efectivoMinimo: 1000,
      transferenciaBanco: "Banco Nación",
      transferenciaAlias: "RESTAULANG.ALIAS",
      transferenciaCBU: "0000003100012345678",
      transferenciaCUIT: "20-12345678-9",
      entregaPago: "adelantado",
    };

    const response = generatePaymentMethodsResponse(config);

    expect(response).toContain("**Efectivo**");
    expect(response).not.toContain("Transferencia");
    expect(response).not.toContain("Banco Nación");
  });
});

describe("Payment Handler - generateChangeResponse", () => {
  it("should calculate change for overpayment", () => {
    const response = generateChangeResponse(1000, 1500);

    expect(response).toContain("Tu pedido es $1000");
    expect(response).toContain("Pagando $1500, tu vuelto será: **$500**");
    expect(response).toContain("✅ Perfecto");
  });

  it("should handle exact payment", () => {
    const response = generateChangeResponse(1000, 1000);

    expect(response).toContain("Tu pedido es $1000");
    expect(response).toContain("Pagando el monto exacto: $1000");
    expect(response).toContain("✅ Perfecto");
  });

  it("should handle insufficient payment", () => {
    const response = generateChangeResponse(1000, 800);

    expect(response).toContain("monto ingresado ($800) es insuficiente");
    expect(response).toContain("total de tu pedido es $1000");
    expect(response).toContain("❌ Lo siento");
  });
});

describe("Payment Handler - generatePaymentAmountRequestResponse", () => {
  it("should generate request for payment amount", () => {
    const response = generatePaymentAmountRequestResponse(1000);

    expect(response).toContain("El total de tu pedido es: **$1000**");
    expect(response).toContain("¿Con cuánto vas a pagar?");
    expect(response).toContain("Si pagas en efectivo, te calculo el vuelto");
  });
});

describe("Payment Handler - generateOrderConfirmationResponse", () => {
  it("should generate confirmation for cash payment with change", () => {
    const orderDraft: ConversationOrderDraft = {
      telefono: "123456",
      items: [
        { producto: "Hamburguesa", cantidad: 2, precioUnitario: 7000 }
      ],
      direccion: "Calle Falsa 123",
      tipoEntrega: "delivery",
      metodoPago: "efectivo",
      nombreCliente: "Juan Pérez",
      total: 14000,
      montoAbono: 15000,
      estado: "completo"
    };

    const config = {
      metodos: ["efectivo", "transferencia"],
      efectivoMinimo: 0,
      transferenciaBanco: "Banco Nación",
      transferenciaAlias: "RESTAULANG.ALIAS",
      transferenciaCBU: "0000003100012345678",
      entregaPago: "con_entrega"
    };

    const response = generateOrderConfirmationResponse(orderDraft, config);

    expect(response).toContain("📋 Resumen de tu pedido:");
    expect(response).toContain("Items: 2 Hamburguesa");
    expect(response).toContain("Total: $14000");
    expect(response).toContain("🚚 Delivery a: Calle Falsa 123");
    expect(response).toContain("💵 Pagando en efectivo");
    expect(response).toContain("Monto: $15000 (Vuelto: $1000)");
    expect(response).toContain("✅ ¿Confirmas el pedido?");
  });

  it("does not mention transfer instructions even if metodoPago was set externally", () => {
    const orderDraft: ConversationOrderDraft = {
      telefono: "123456",
      items: [
        { producto: "Hamburguesa", cantidad: 1, precioUnitario: 7000 }
      ],
      direccion: "Calle Falsa 123",
      tipoEntrega: "delivery",
      metodoPago: "transferencia",
      nombreCliente: "Juan Pérez",
      total: 7000,
      montoAbono: null,
      estado: "completo"
    };

    const config = {
      metodos: ["efectivo", "transferencia"],
      efectivoMinimo: 0,
      transferenciaBanco: "Banco Nación",
      transferenciaAlias: "RESTAULANG.ALIAS",
      transferenciaCBU: "0000003100012345678",
      entregaPago: "adelantado"
    };

    const response = generateOrderConfirmationResponse(orderDraft, config);

    expect(response).toContain("✅ ¿Confirmas el pedido?");
    expect(response).not.toContain("transferencia");
  });
});

describe("Payment Handler - generatePaymentErrorResponse", () => {
  it("should generate error response for unclear intent", () => {
    const response = generatePaymentErrorResponse();

    expect(response).toContain("Lo siento, no entendí tu mensaje sobre el pago");
    expect(response).toContain("¿Quieres conocer nuestros métodos de pago");
    expect(response).toContain("confirmar el monto con el que vas a pagar");
  });
});

describe("Payment Handler - generateInsufficientAmountResponse", () => {
  it("should generate insufficient amount response", () => {
    const response = generateInsufficientAmountResponse(1000, 800);

    expect(response).toContain("monto ingresado ($800) es insuficiente");
    expect(response).toContain("total de tu pedido es $1000");
    expect(response).toContain("❌ Lo siento");
    expect(response).toContain("Por favor, ingresa un monto mayor o igual al total");
  });
});
