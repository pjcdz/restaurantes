/**
 * Payment Handler - SRS v4
 *
 * Este módulo implementa el manejo de pagos del sistema,
 * incluyendo detección de intenciones de pago, cálculo de vuelto,
 * y gestión de métodos de pago (efectivo, transferencia).
 */

import type { ConversationOrderDraft } from "./conversation-assistant.js";

/**
 * Tipos de intención de pago detectados
 */
export type PaymentIntent = "payment_methods" | "payment_amount" | "payment_confirmation" | "payment_question" | null;

/**
 * Estado del Payment Handler
 */
export interface PaymentHandlerState {
  intent: PaymentIntent;
  paymentAmount?: number;
  paymentConfirmed: boolean;
}

/**
 * Detecta si el mensaje del usuario es sobre pagos
 */
export function detectPaymentIntent(messageText: string): PaymentIntent {
  const normalizedText = messageText.toLowerCase().trim();

  // Detección de consultas sobre métodos de pago
  const paymentMethodsKeywords = [
    "como pago",
    "formas de pago",
    "métodos de pago",
    "qué aceptan",
    "pago",
    "pagar",
    "mercado pago",
    "mercadopago",
    "transferencia",
    "efectivo",
    "tarjeta",
    "dinero",
    "dinero en efectivo"
  ];

  if (paymentMethodsKeywords.some(keyword => normalizedText.includes(keyword))) {
    return "payment_methods";
  }

  // Detección de monto de pago
  if (/^\s*\$?\s*(\d+(?:\.\d+)?)(?:\s*(?:pesos|ars)?\s*$/.test(normalizedText)) {
    return "payment_amount";
  }

  // Detección de palabras clave que indican confirmación de pago
  const confirmationKeywords = [
    "confirmo",
    "confirmar",
    "ok",
    "dale",
    "listo",
    "perfecto",
    "sí",
    "si",
    "adelante"
  ];

  if (confirmationKeywords.some(keyword => normalizedText.includes(keyword))) {
    return "payment_confirmation";
  }

  // Detección de preguntas sobre pago
  const questionKeywords = [
    "cuánto",
    "cuanto",
    "con cuánto",
    "qué billete",
    "con qué",
    "tengo",
    "pago con"
  ];

  if (questionKeywords.some(keyword => normalizedText.includes(keyword))) {
    return "payment_question";
  }

  return null;
}

/**
 * Genera la respuesta de métodos de pago disponibles
 */
export function generatePaymentMethodsResponse(config: {
  metodos: string[];
  efectivoMinimo: number;
  transferenciaBanco: string;
  transferenciaAlias: v.string();
  transferenciaCBU: string;
  transferenciaCUIT?: string;
  entregaPago: string;
}): string {
  const segments: string[] = [];

  // Encabezado de métodos de pago
  segments.push("Aceptamos los siguientes métodos de pago:\n");

  // Efectivo
  if (config.metodos.includes("efectivo")) {
    segments.push("💵 **Efectivo**\n");
    segments.push(`   • Contra entrega o al retirar\n`);
    if (config.efectivoMinimo > 0) {
      segments.push(`   • Mínimo: $${config.efectivoMinimo}\n`);
    }
  }

  // Transferencia
  if (config.metodos.includes("transferencia")) {
    segments.push("📱 **Transferencia bancaria**\n");
    segments.push(`   • Banco: ${config.transferenciaBanco}\n`);
    segments.push(`   • Alias: ${config.transferenciaAlias}\n`);
    if (config.transferenciaCUIT) {
      segments.push(`   • CUIT/CUIL: ${config.transferenciaCUIT}\n`);
    }
    if (config.metodos.includes("mercado pago") || config.metodos.includes("mercadopago")) {
      segments.push(`   • También puedes usar MercadoPago con el alias\n`);
    }
  }

  // Información de entrega de pago
  if (config.entregaPago === "adelantado") {
    segments.push("\n⚠️ Para transferencia, el pago debe ser adelantado.\n");
  }

  return segments.join("");
}

/**
 * Genera la respuesta de cálculo de vuelto
 */
export function generateChangeResponse(
  orderTotal: number,
  paymentAmount: number,
  paymentConfig?: {
    metodos: string[];
    entregaPago: string;
  }
): string {
  const segments: string[] = [];

  const change = paymentAmount - orderTotal;

  if (change > 0) {
    segments.push(`✅ Perfecto. Tu pedido es $${orderTotal}.\n`);
    segments.push(`Pagando $${paymentAmount}, tu vuelto será: **$${change}**\n`);
  } else if (change === 0) {
    segments.push(`✅ Perfecto. Tu pedido es $${orderTotal}.\n`);
    segments.push(`Pagando el monto exacto: $${paymentAmount}\n`);
  } else {
    segments.push(`❌ Lo siento, el monto ingresado ($${paymentAmount}) es insuficiente.\n`);
    segments.push(`El total de tu pedido es $${orderTotal}.\n`);
    segments.push(`Por favor, ingresa un monto mayor o igual al total.\n`);
    return segments.join("");
  }

  if (paymentConfig?.entregaPago === "adelantado" && paymentConfig.metodos.includes("transferencia")) {
    segments.push("\n📱 Recuerda que la transferencia debe ser enviada antes de la entrega del pedido.");
  }

  segments.push("\n¿Confirmas el pedido?");
  return segments.join("");
}

/**
 * Genera la respuesta de solicitud de monto de pago
 */
export function generatePaymentAmountRequestResponse(orderTotal: number): string {
  const segments: string[] = [];

  segments.push(`El total de tu pedido es: **$${orderTotal}**\n`);
  segments.push("¿Con cuánto vas a pagar?\n");
  segments.push("💵 Si pagas en efectivo, te calculo el vuelto.");

  return segments.join("");
}

/**
 * Genera la respuesta de confirmación de pedido con datos de pago
 */
export function generateOrderConfirmationResponse(
  orderDraft: ConversationOrderDraft,
  paymentConfig?: {
    metodos: string[];
    entregaPago: string;
  }
): string {
  const segments: string[] = [];

  // Resumen del pedido
  const itemsSummary = orderDraft.items
    .map(item => `${item.cantidad} ${item.producto}`)
    .join(", ");

  segments.push("📋 **Resumen de tu pedido:**\n");
  segments.push(`   Items: ${itemsSummary}\n`);
  segments.push(`   Total: $${orderDraft.total}\n`);

  // Tipo de entrega
  if (orderDraft.tipoEntrega === "delivery") {
    segments.push(`🚚 Delivery a: ${orderDraft.direccion}\n`);
  } else {
    segments.push("🏃 Retiro en sucursal\n");
  }

  // Método de pago
  if (orderDraft.metodoPago === "efectivo") {
    segments.push(`💵 Pagando en efectivo\n`);
    if (orderDraft.montoAbono && orderDraft.montoAbono >= orderDraft.total) {
      const change = orderDraft.montoAbono - orderDraft.total;
      if (change > 0) {
        segments.push(`   Monto: $${orderDraft.montoAbono} (Vuelto: $${change})\n`);
      } else {
        segments.push(`   Monto exacto: $${orderDraft.montoAbono}\n`);
      }
    }
  } else if (orderDraft.metodoPago === "transferencia") {
    segments.push(`📱 Pagando por transferencia\n`);
    segments.push("   Debes enviar la transferencia antes de la entrega del pedido.\n");
  }

  segments.push("\n✅ **¿Confirmas el pedido?**\n");
  segments.push("Responde 'Sí, confirmo' para proceder.");

  return segments.join("");
}

/**
 * Valida que el monto de pago sea suficiente
 */
export function validatePaymentAmount(
  paymentAmount: number,
  orderTotal: number
): { valid: boolean; error?: string } {
  if (paymentAmount < orderTotal) {
    return {
      valid: false,
      error: `El monto ingresado ($${paymentAmount}) es menor al total del pedido ($${orderTotal}).`
    };
  }

  if (paymentAmount === orderTotal) {
    return { valid: true };
  }

  const change = paymentAmount - orderTotal;
  return {
    valid: true,
    error: undefined
  };
}

/**
 * Extrae el monto de pago del mensaje del usuario
 */
export function extractPaymentAmount(messageText: string): number | null {
  const normalizedText = messageText.toLowerCase().trim();

  // Patrón: "con X", "pago X", "tengo X", "son X", "abono X"
  const withPrefixMatch = normalizedText.match(
    /(?:con|pago|tengo|son|abono|vengo)\s+(\d+(?:\.\d+)?)/
  );

  if (withPrefixMatch?.[1]) {
    return parseFloat(withPrefixMatch[1]);
  }

  // Patrón: Just a number (si el mensaje es lo suficientemente simple)
  const simpleNumberMatch = normalizedText.match(
    /^\s*\$?\s*(\d+(?:\.\d+)?)(?:\s*(?:pesos|ars|\$)?)?\s*$/
  );

  if (simpleNumberMatch?.[1]) {
    return parseFloat(simpleNumberMatch[1]);
  }

  return null;
}

/**
 * Detecta si el mensaje es una respuesta de confirmación
 */
export function isConfirmationResponse(messageText: string): boolean {
  const normalizedText = messageText.toLowerCase().trim();
  const confirmationKeywords = [
    "sí", "si", "ok", "dale", "listo", "perfecto", "confirmo", "confirmar", "adelante"
  ];

  return confirmationKeywords.some(keyword => normalizedText.includes(keyword));
}

/**
 * Genera una respuesta de error cuando no se detecta una intención clara
 */
export function generatePaymentErrorResponse(): string {
  return "Lo siento, no entendí tu mensaje sobre el pago. " +
    "¿Quieres conocer nuestros métodos de pago, " +
    "confirmar el monto con el que vas a pagar, " +
    "o tienes alguna otra consulta?";
}

/**
 * Genera una respuesta de error cuando el monto de pago es insuficiente
 */
export function generateInsufficientAmountResponse(orderTotal: number, paymentAmount: number): string {
  return `❌ Lo siento, el monto ingresado ($${paymentAmount}) es insuficiente.\n\n` +
    `El total de tu pedido es $${orderTotal}.\n\n` +
    `Por favor, ingresa un monto mayor o igual al total.`;
}
