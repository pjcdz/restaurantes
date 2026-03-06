/**
 * Order Formatter V2 - SRS v4
 *
 * Este módulo implementa el formateo de respuestas de pedidos
 * con mejoras del Sprint 1: resumen de carrito, acciones, y profesionalización.
 */

import type { ConversationOrderDraft } from "./conversation-assistant.js";

/**
 * SRS v4: Tipo extendido de order draft con soporte de carrito
 */
export type ConversationOrderDraftV2 = ConversationOrderDraft & {
  cartAction?: "add" | "remove" | "replace" | "clear";
  previousCart?: Array<any>;
};

/**
 * SRS v4: Genera un resumen del carrito con las mejoras del Sprint 1.
 * Muestra los items, subtotales, y el total acumulado de forma clara.
 */
export function generateCartSummary(orderDraft: ConversationOrderDraftV2): string {
  if (!orderDraft || orderDraft.items.length === 0) {
    return "Tu carrito está vacío. ¿Quieres agregar algo?";
  }

  const segments: string[] = [];

  // SRS v4: Título del resumen
  segments.push("🛒 **Resumen de tu pedido:**\n");

  // Mostrar acción aplicada (si corresponde)
  if (orderDraft.cartAction) {
    const actionMessages: Record<string, string> = {
      add: "➕ Agregado",
      remove: "➖ Quitado",
      replace: "🔄 Cambiado",
      clear: "🗑 Carrito vaciado"
    };

    segments.push(`${actionMessages[orderDraft.cartAction]}\n`);
  }

  // Lista de items
  segments.push("**Items:**\n");

  for (const [index, item] of orderDraft.items.entries()) {
    const subtotal = item.cantidad * item.precioUnitario;
    const itemString = `   ${index + 1}. ${item.cantidad} × ${item.producto} ($${subtotal})`;

    segments.push(itemString + "\n");
  }

  // SRS v4: Total
  segments.push(`\n💰 **Total:** $${orderDraft.total}\n`);

  // SRS v4: Mostrar acción para continuar o confirmar
  segments.push("¿Quieres agregar más, confirmar o realizar alguna otra acción?");

  return segments.join("");
}

/**
 * SRS v4: Genera respuesta cuando no hay items en el carrito
 */
export function generateEmptyCartResponse(): string {
  return "Tu carrito está vacío. ¿Quieres agregar algo del menú?\n\n" +
    "💵 Puedes ver el menú escribiendo 'menu' o 'qué tienen'.";
}

/**
 * SRS v4: Genera respuesta de confirmación profesional sin "Che"
 * Mejora el tono de las respuestas según Sprint 3.
 */
export function generateProfessionalConfirmation(orderDraft: ConversationOrderDraftV2): string {
  const segments: string[] = [];

  // SRS v4: Saludo profesional (sin "Che")
  segments.push("¡Listo! Tu pedido ha sido confirmado.\n");

  // Resumen de items
  const itemsSummary = orderDraft.items
    .map(item => `${item.cantidad} ${item.producto}`)
    .join(", ");

  segments.push(`📋 **Items:** ${itemsSummary}\n`);

  // Tipo de entrega
  if (orderDraft.tipoEntrega === "delivery") {
    segments.push(`🚚 **Delivery a:** ${orderDraft.direccion}\n`);
  } else if (orderDraft.tipoEntrega === "pickup") {
    segments.push(`🏃 **Retiro en sucursal**\n`);
  }

  // Total
  segments.push(`💰 **Total:** $${orderDraft.total}\n`);

  // Método de pago
  if (orderDraft.metodoPago) {
    const paymentMessages: Record<string, string> = {
      efectivo: "💵 Efectivo",
      transferencia: "📱 Transferencia",
      "mercado pago": "📲 MercadoPago"
    };

    segments.push(`${paymentMessages[orderDraft.metodoPago]} - Método de pago\n`);
  }

  // SRS v4: Despedida profesional
  segments.push("🙏 ¡Gracias por tu pedido! Tu pedido será procesado a la brevedad.\n");

  return segments.join("");
}

/**
 * SRS v4: Genera respuesta de error cuando el carrito tiene problemas
 */
export function generateCartErrorResponse(
  errorType: "empty" | "invalid_item" | "cannot_remove"
): string {
  switch (errorType) {
    case "empty":
      return "Lo siento, no hay items en tu carrito para realizar esa acción. ¿Quieres agregar algo del menú?";

    case "invalid_item":
      return "Lo siento, no pude identificar el producto que mencionas. ¿Podrías reformular tu pedido?";

    case "cannot_remove":
      return "Lo siento, no pude quitar ese item de tu carrito. ¿Podrías intentar de nuevo?";

    default:
      return "Lo siento, hubo un problema con tu pedido. ¿Podrías intentarlo de nuevo?";
  }
}

/**
 * SRS v4: Genera respuesta de acción de carrito
 * Proporciona feedback claro sobre la acción realizada (add/remove/replace/clear).
 */
export function generateCartActionResponse(
  action: "add" | "remove" | "replace" | "clear",
  item?: string,
  newTotal?: number
): string {
  const segments: string[] = [];

  switch (action) {
    case "add":
      segments.push(`✅ **Agregado:** ${item || "item(s)"}\n`);
      if (newTotal !== undefined) {
        segments.push(`💰 Nuevo total: $${newTotal}\n`);
      }
      segments.push("¿Quieres agregar algo más?");
      break;

    case "remove":
      segments.push(`✅ **Quitado:** ${item}\n`);
      if (newTotal !== undefined) {
        segments.push(`💰 Nuevo total: $${newTotal}\n`);
      }
      segments.push("¿Quieres agregar algo más?");
      break;

    case "replace":
      segments.push(`🔄 **Carrito actualizado:**\n`);
      segments.push(`Nuevo pedido: ${item}\n`);
      segments.push(`💰 Total: $${newTotal}\n`);
      segments.push("¿Quieres agregar algo más?");
      break;

    case "clear":
      segments.push(`🗑 **Carrito vaciado**\n`);
      segments.push("¿Quieres comenzar un nuevo pedido?");
      break;
  }

  return segments.join("");
}

/**
 * SRS v4: Genera respuesta profesional de saludo
 * Reemplaza el saludo informal "Che" con una versión más profesional.
 */
export function generateProfessionalGreeting(): string {
  return "¡Hola! Bienvenido a RestauLang. Puedo ayudarte con el menú, horarios o tomar tu pedido.";
}

/**
 * SRS v4: Genera respuesta de error genérica profesional
 */
export function generateProfessionalErrorResponse(context: string): string {
  const responses: Record<string, string> = {
    general: "Lo siento, no entendí tu mensaje. ¿Podrías reformularlo?",
    order: "Lo siento, hubo un problema con tu pedido. ¿Podrías intentarlo de nuevo?",
    payment: "Lo siento, hubo un problema con el pago. ¿Podrías verificar los datos?",
    menu: "Lo siento, no tengo información sobre eso. ¿Quieres ver el menú?",
    technical: "Lo siento, estamos experimentando dificultades técnicas. Por favor, intenta nuevamente en unos momentos."
  };

  return responses[context] || responses.general;
}

/**
 * SRS v4: Valida y corrige el nombre del cliente
 * Asegura que el nombre sea válido (sin números ni caracteres especiales).
 */
export function validateAndCleanCustomerName(name: string): {
  cleaned: string;
  valid: boolean;

  // Remover números y caracteres especiales
  cleaned = name
    .replace(/[0-9]/g, "")
    .replace(/[!@#$%^&*()_+=|{}[\]\\:;"'<>,.?/]/g, "")
    .trim();

  valid = cleaned.length >= 2 && cleaned.length <= 50;

  return {
    cleaned,
    valid,
    error: !valid ? "Por favor, proporciona un nombre válido (sin números ni caracteres especiales)." : undefined
  };
}

/**
 * SRS v4: Genera solicitud de información faltante
 * De manera clara y profesional, solicita los campos necesarios.
 */
export function generateMissingFieldsRequest(missingFields: string[]): string {
  const segments: string[] = [];

  segments.push("Para completar tu pedido, necesito la siguiente información:\n");

  for (const field of missingFields) {
    segments.push(`  • ${field}\n`);
  }

  segments.push("\n¿Podrías proporcionarla?");

  return segments.join("");
}

/**
 * SRS v4: Genera respuesta de seguimiento del pedido
 * Informa sobre el estado del pedido y próximos pasos.
 */
export function generateOrderFollowUp(orderDraft: ConversationOrderDraftV2): string {
  if (!orderDraft || orderDraft.items.length === 0) {
    return "¿Quieres comenzar un nuevo pedido?";
  }

  const segments: string[] = [];

  if (orderDraft.estado === "incompleto") {
    const missingFields = getMissingFields(orderDraft);

    if (missingFields.length > 0) {
      segments.push(generateMissingFieldsRequest(missingFields));
    } else {
      segments.push("¿Hay algo más que quieras agregar o modificar?");
    }
  } else if (orderDraft.estado === "completo") {
    segments.push("✅ Tu pedido está completo y listo para confirmar.");
    segments.push("¿Confirmas para proceder?");
  }

  return segments.join("");
}

/**
 * SRS v4: Obtiene los campos faltantes del pedido
 */
function getMissingFields(orderDraft: ConversationOrderDraft): string[] {
  const missing: string[] = [];

  if (!orderDraft.tipoEntrega) {
    missing.push("Tipo de entrega (delivery o retiro en sucursal)");
  }

  if (orderDraft.tipoEntrega === "delivery" && !orderDraft.direccion) {
    missing.push("Dirección de entrega");
  }

  if (!orderDraft.metodoPago) {
    missing.push("Método de pago (efectivo, transferencia, MercadoPago)");
  }

  if (!orderDraft.nombreCliente) {
    missing.push("Nombre del cliente");
  }

  // SRS v4: Validar monto de pago si es efectivo
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    missing.push("Monto con el que vas a pagar (para calcular el vuelto)");
  }

  return missing;
}

/**
 * SRS v4: Genera respuesta de confirmación de pedido con método de pago
 */
export function generatePaymentConfirmationMessage(
  orderDraft: ConversationOrderDraftV2,
  paymentConfig?: {
    metodos: string[];
    efectivoMinimo?: number;
    transferenciaBanco?: string;
    transferenciaAlias?: string;
    entregaPago?: string;
  }
): string {
  const segments: string[] = [];

  // Resumen del pedido
  const itemsSummary = orderDraft.items
    .map(item => `${item.cantidad} ${item.producto}`)
    .join(", ");

  segments.push("📋 **Resumen de tu pedido:**\n");
  segments.push(`   Items: ${itemsSummary}\n`);

  // Tipo de entrega
  if (orderDraft.tipoEntrega === "delivery") {
    segments.push(`   🚚 Delivery a: ${orderDraft.direccion}\n`);
  } else {
    segments.push(`   🏃 Retiro en sucursal\n`);
  }

  // Total
  segments.push(`   💰 Total: $${orderDraft.total}\n`);

  // Método de pago y monto
  if (orderDraft.metodoPago === "efectivo") {
    segments.push(`   💵 Pagando en efectivo\n`);

    if (orderDraft.montoAbono !== null) {
      const vuelto = orderDraft.montoAbono - orderDraft.total;
      if (vuelto > 0) {
        segments.push(`   Monto: $${orderDraft.montoAbono} (Vuelto: $${vuelto})\n`);
      } else {
        segments.push(`   Monto exacto: $${orderDraft.montoAbono}\n`);
      }
    }

    // SRS v4: Información de pago si está configurada
    if (paymentConfig && paymentConfig.efectivoMinimo > 0) {
      segments.push(`   💵 Mínimo de efectivo: $${paymentConfig.efectivoMinimo}\n`);
    }
  } else if (orderDraft.metodoPago === "transferencia") {
    segments.push(`   📱 Pagando por transferencia\n`);

    if (paymentConfig && paymentConfig.transferenciaBanco) {
      segments.push(`   🏦 Banco: ${paymentConfig.transferenciaBanco}\n`);
    }
    if (paymentConfig && paymentConfig.transferenciaAlias) {
      segments.push(`   📲 Alias: ${paymentConfig.transferenciaAlias}\n`);
    }
    if (paymentConfig && paymentConfig.transferenciaCBU) {
      segments.push(`   📟 CBU: ${paymentConfig.transferenciaCBU}\n`);
    }
    if (paymentConfig && paymentConfig.transferenciaCUIT) {
      segments.push(`   🆔 CUIT/CUIL: ${paymentConfig.transferenciaCUIT}\n`);
    }
  }

  // SRS v4: Información de entrega de pago
  if (paymentConfig && paymentConfig.entregaPago === "adelantado") {
    segments.push(`   ⚠️  Importante: La transferencia debe ser enviada antes de la entrega del pedido.\n`);
  }

  segments.push("\n✅ **¿Confirmas el pedido?**\n");

  return segments.join("");
}

/**
 * SRS v4: Genera respuesta para pedido con monto insuficiente
 */
export function generateInsufficientPaymentResponse(orderTotal: number, providedAmount: number): string {
  const faltante = orderTotal - providedAmount;

  return `❌ Lo siento, el monto ingresado ($${providedAmount}) es insuficiente.\n\n` +
    `El total de tu pedido es $${orderTotal} y faltan $${faltante}.\n\n` +
    `💵 Por favor, ingresa un monto mayor o igual al total.`;
}

/**
 * SRS v4: Genera respuesta de confirmación simple (sin detalles de pago)
 */
export function generateSimpleConfirmation(orderDraft: ConversationOrderDraftV2): string {
  const segments: string[] = [];

  segments.push("✅ **Tu pedido ha sido confirmado:**\n");

  const itemsSummary = orderDraft.items
    .map(item => `${item.cantidad} ${item.producto}`)
    .join(", ");

  segments.push(`📋 Items: ${itemsSummary}\n`);

  if (orderDraft.tipoEntrega === "delivery") {
    segments.push(`🚚 Delivery a: ${orderDraft.direccion}\n`);
  } else {
    segments.push(`🏃 Retiro en sucursal\n`);
  }

  segments.push(`💰 Total: $${orderDraft.total}\n`);
  segments.push("\n🙏 ¡Gracias por tu pedido!");

  return segments.join("");
}
