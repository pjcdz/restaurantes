/**
 * Order Formatter V2 - SRS v4
 *
 * Helpers para formatear respuestas transaccionales de pedidos.
 */

import type { ConversationOrderDraft } from "./conversation-assistant.js";

export type ConversationOrderDraftV2 = ConversationOrderDraft & {
  cartAction?: "add" | "remove" | "replace" | "clear";
  previousCart?: Array<unknown>;
};

type PaymentConfigLite = {
  metodos: string[];
  efectivoMinimo?: number;
  transferenciaBanco?: string;
  transferenciaAlias?: string;
  transferenciaCBU?: string;
  transferenciaCUIT?: string;
  entregaPago?: "con_entrega" | "adelantado";
};

export function generateCartSummary(orderDraft: ConversationOrderDraftV2): string {
  if (!orderDraft || orderDraft.items.length === 0) {
    return "Tu carrito esta vacio. Queres agregar algo?";
  }

  const lines = orderDraft.items.map((item, index) => {
    const subtotal = item.cantidad * item.precioUnitario;
    return `${index + 1}. ${item.cantidad} x ${item.producto} ($${subtotal})`;
  });

  return [
    "Resumen de tu pedido:",
    ...lines,
    `Total: $${orderDraft.total}`,
    "Queres agregar mas, confirmar o modificar algo?"
  ].join("\n");
}

export function generateEmptyCartResponse(): string {
  return "Tu carrito esta vacio. Queres agregar algo del menu?";
}

export function generateProfessionalConfirmation(orderDraft: ConversationOrderDraftV2): string {
  const itemsSummary = orderDraft.items
    .map((item) => `${item.cantidad} ${item.producto}`)
    .join(", ");
  const deliveryLine =
    orderDraft.tipoEntrega === "delivery"
      ? `Delivery a: ${orderDraft.direccion}`
      : "Retiro en sucursal";

  return [
    "Listo! Tu pedido fue confirmado.",
    `Items: ${itemsSummary}`,
    deliveryLine,
    `Total: $${orderDraft.total}`,
    "Gracias por tu pedido."
  ].join("\n");
}

export function generateCartErrorResponse(
  errorType: "empty" | "invalid_item" | "cannot_remove"
): string {
  if (errorType === "empty") {
    return "No hay items en tu carrito para realizar esa accion.";
  }

  if (errorType === "invalid_item") {
    return "No pude identificar el producto. Podes reformular tu pedido?";
  }

  if (errorType === "cannot_remove") {
    return "No pude quitar ese item del carrito. Intenta nuevamente.";
  }

  return "Hubo un problema con tu pedido. Intenta nuevamente.";
}

export function generateCartActionResponse(
  action: "add" | "remove" | "replace" | "clear",
  item?: string,
  newTotal?: number
): string {
  if (action === "clear") {
    return "Carrito vaciado. Queres empezar un nuevo pedido?";
  }

  const labelByAction: Record<"add" | "remove" | "replace", string> = {
    add: "Agregado",
    remove: "Quitado",
    replace: "Pedido actualizado"
  };

  const lines = [`${labelByAction[action]}: ${item ?? "item(s)"}`];

  if (typeof newTotal === "number") {
    lines.push(`Nuevo total: $${newTotal}`);
  }

  lines.push("Queres agregar algo mas?");

  return lines.join("\n");
}

export function generateProfessionalGreeting(): string {
  return "Hola! Bienvenido a RestauLang. Puedo ayudarte con el menu, horarios o tomar tu pedido.";
}

export function generateProfessionalErrorResponse(context: string): string {
  const responses: Record<string, string> = {
    general: "No entendi tu mensaje. Podes reformularlo?",
    order: "Hubo un problema con tu pedido. Intenta nuevamente.",
    payment: "Hubo un problema con el pago. Verifica los datos.",
    menu: "No tengo esa informacion. Queres ver el menu?",
    technical: "Estamos con una dificultad tecnica. Intenta de nuevo en unos minutos."
  };

  return responses[context] ?? responses.general;
}

export function validateAndCleanCustomerName(name: string): {
  cleaned: string;
  valid: boolean;
  error?: string;
} {
  const cleaned = name
    .replace(/[0-9]/gu, "")
    .replace(/[!@#$%^&*()_+=|{}[\]\\:;"'<>,.?/]/gu, "")
    .trim();

  const valid = cleaned.length >= 2 && cleaned.length <= 50;

  return {
    cleaned,
    valid,
    error: valid
      ? undefined
      : "Por favor, proporciona un nombre valido (sin numeros ni caracteres especiales)."
  };
}

export function generateMissingFieldsRequest(missingFields: string[]): string {
  if (missingFields.length === 0) {
    return "";
  }

  const list = missingFields.map((field) => `- ${field}`).join("\n");
  return `Para completar tu pedido, necesito:\n${list}`;
}

export function generateOrderFollowUp(orderDraft: ConversationOrderDraftV2): string {
  if (!orderDraft || orderDraft.items.length === 0) {
    return "Queres comenzar un nuevo pedido?";
  }

  if (orderDraft.estado === "completo") {
    return "Tu pedido esta completo. Confirmas para proceder?";
  }

  const missingFields = getMissingFields(orderDraft);

  if (missingFields.length === 0) {
    return "Hay algo mas que quieras agregar o modificar?";
  }

  return generateMissingFieldsRequest(missingFields);
}

function getMissingFields(orderDraft: ConversationOrderDraft): string[] {
  const missing: string[] = [];

  if (!orderDraft.tipoEntrega) {
    missing.push("Tipo de entrega (delivery o retiro)");
  }

  if (orderDraft.tipoEntrega === "delivery" && !orderDraft.direccion) {
    missing.push("Direccion de entrega");
  }

  if (!orderDraft.metodoPago) {
    missing.push("Metodo de pago");
  }

  if (!orderDraft.nombreCliente) {
    missing.push("Nombre del cliente");
  }

  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    missing.push("Monto con el que vas a pagar");
  }

  return missing;
}

export function generatePaymentConfirmationMessage(
  orderDraft: ConversationOrderDraftV2,
  paymentConfig?: PaymentConfigLite
): string {
  const itemsSummary = orderDraft.items
    .map((item) => `${item.cantidad} ${item.producto}`)
    .join(", ");
  const lines = [
    "Resumen de tu pedido:",
    `Items: ${itemsSummary}`,
    `Total: $${orderDraft.total}`
  ];

  if (orderDraft.tipoEntrega === "delivery") {
    lines.push(`Delivery a: ${orderDraft.direccion}`);
  } else {
    lines.push("Retiro en sucursal");
  }

  if (orderDraft.metodoPago === "efectivo") {
    lines.push("Pago en efectivo");
    if (typeof orderDraft.montoAbono === "number") {
      const change = orderDraft.montoAbono - orderDraft.total;
      if (change > 0) {
        lines.push(`Abonas $${orderDraft.montoAbono} (vuelto: $${change})`);
      } else {
        lines.push(`Abonas $${orderDraft.montoAbono}`);
      }
    }

    if ((paymentConfig?.efectivoMinimo ?? 0) > 0) {
      lines.push(`Minimo en efectivo: $${paymentConfig?.efectivoMinimo}`);
    }
  }

  if (orderDraft.metodoPago === "transferencia") {
    lines.push("Pago por transferencia");
    if (paymentConfig?.transferenciaBanco) {
      lines.push(`Banco: ${paymentConfig.transferenciaBanco}`);
    }
    if (paymentConfig?.transferenciaAlias) {
      lines.push(`Alias: ${paymentConfig.transferenciaAlias}`);
    }
    if (paymentConfig?.transferenciaCBU) {
      lines.push(`CBU: ${paymentConfig.transferenciaCBU}`);
    }
    if (paymentConfig?.transferenciaCUIT) {
      lines.push(`CUIT/CUIL: ${paymentConfig.transferenciaCUIT}`);
    }
    if (paymentConfig?.entregaPago === "adelantado") {
      lines.push("Importante: la transferencia debe enviarse antes de la entrega.");
    }
  }

  lines.push("Confirmas el pedido?");
  return lines.join("\n");
}

export function generateInsufficientPaymentResponse(
  orderTotal: number,
  providedAmount: number
): string {
  const missing = orderTotal - providedAmount;

  return [
    `El monto ingresado ($${providedAmount}) es insuficiente.`,
    `Total del pedido: $${orderTotal}. Faltan $${missing}.`,
    "Ingresa un monto mayor o igual al total."
  ].join("\n");
}

export function generateSimpleConfirmation(orderDraft: ConversationOrderDraftV2): string {
  const itemsSummary = orderDraft.items
    .map((item) => `${item.cantidad} ${item.producto}`)
    .join(", ");

  return [
    "Tu pedido fue confirmado:",
    `Items: ${itemsSummary}`,
    orderDraft.tipoEntrega === "delivery"
      ? `Delivery a: ${orderDraft.direccion}`
      : "Retiro en sucursal",
    `Total: $${orderDraft.total}`,
    "Gracias por tu pedido."
  ].join("\n");
}
