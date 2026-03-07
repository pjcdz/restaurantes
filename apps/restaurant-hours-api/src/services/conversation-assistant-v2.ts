/**
 * Conversation Assistant V2 - SRS v4
 *
 * Este módulo extiende el conversation-assistant original con mejoras
 * del Sprint 1: Payment Handler, Order Handler V2, Checkpointer V2.
 */

import { Annotation, Command, END, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";

import { calculateChange } from "./order-calculator.js";
import {
  detectPaymentIntent,
  extractPaymentAmount,
  generatePaymentMethodsResponse,
  generatePaymentAmountRequestResponse,
  generateChangeResponse,
  generateOrderConfirmationResponse as generateOrderConfirmationPayment,
  validatePaymentAmount,
  isConfirmationResponse,
  generateInsufficientAmountResponse
} from "./payment-handler.js";
import {
  CartAction,
  ExtractedOrderLineV2,
  OrderExtractionResultV2,
  detectCartAction,
  detectOrderCancellation,
  applyCartAction,
  validateCartActionForState,
  normalizeOrderText as normalizeOrderTextV2
} from "./order-schema-v2.js";
import type {
  ConversationIntent,
  ConversationOrderDraft,
  ConversationOrderItem
} from "./conversation-assistant.js";

/**
 * Logger instance for conversation assistant v2.
 */
import { Logger } from "../utils/logger.js";
const logger = new Logger({ service: "conversation-assistant-v2" });

/**
 * SRS v4: Intención de pago extendida
 */
type ConversationIntentV2 = ConversationIntent | "payment";

/**
 * SRS v4: Estado extendido del asistente con pago
 */
type ConversationGraphStateV2 = {
  chatId: string;
  messageText: string;
  session: any;
  catalog: any;
  intent: ConversationIntentV2 | null;
  requestedActions: Array<any>;
  wantsMenu: boolean;
  extractedOrderLines: Array<ExtractedOrderLineV2>;
  validatedOrderLines: Array<any>;
  invalidOrderLines: Array<any>;
  orderDraft: ConversationOrderDraft | null;
  isDuplicate: boolean;
  isHandedOff: boolean;
  duplicateResponseText: string;
  lastHandledMessage: string | null;
  lastHandledAt: number | null;
  lastResponseText: string;
  draftReply: string;
  responseText: string;
  threadId: string;
  traceContext: any;
  // SRS v4: Campos nuevos para Payment Handler
  paymentIntent: "payment_methods" | "payment_amount" | "payment_confirmation" | "payment_question" | null;
  paymentAmount?: number;
  paymentConfig?: any;
  paymentConfirmed: boolean;
};

/**
 * SRS v4: Estado del asistente extendido con soporte para carrito acumulativo
 */
type ConversationOrderDraftV2 = ConversationOrderDraft & {
  cartAction?: CartAction;
  previousCart?: Array<ConversationOrderItem>;
};

/**
 * Genera respuesta profesional (SRS v4 - Sprint 3, pero implementado ahora)
 * Elimina saludos informales como "Che"
 */
export function generateProfessionalGreeting(): string {
  return "¡Hola! Bienvenido a RestauLang. Puedo ayudarte con el menú, horarios o tomar tu pedido.";
}

/**
 * SRS v4: Payment Handler Node
 *
 * Detecta intenciones de pago y genera respuestas apropiadas.
 * - Informa métodos de pago disponibles
 * - Calcula vuelto para pagos en efectivo
 * - Valida montos de pago
 * - Genera confirmaciones de pedido con detalles de pago
 */
export function createPaymentHandlerNodeV2(
  getPaymentConfig: () => Promise<any | null>
) {
  return async (state: ConversationGraphStateV2) => {
    const normalizedText = state.messageText.toLowerCase().trim();

    // Detectar intención de pago
    const paymentIntent = detectPaymentIntent(normalizedText);

    if (paymentIntent === null) {
      // No es un mensaje sobre pagos
      return {};
    }

    // Obtener configuración de pagos
    const paymentConfig = await getPaymentConfig();

    switch (paymentIntent) {
      case "payment_methods": {
        // Informar métodos de pago disponibles
        const response = paymentConfig
          ? generatePaymentMethodsResponse(paymentConfig)
          : "Lo siento, no tenemos configuración de pagos disponible.";

        return {
          draftReply: response,
          paymentIntent: "payment_methods" as const,
          paymentConfig
        };
      }

      case "payment_amount": {
        // Cliente está proporcionando monto de pago
        const orderDraft = state.orderDraft as ConversationOrderDraftV2;

        if (!orderDraft || orderDraft.items.length === 0) {
          return {
            draftReply: "Necesito tener un pedido activo para procesar el pago. ¿Quieres hacer un pedido?",
            paymentIntent: "payment_amount" as const
          };
        }

        const extractedAmount = extractPaymentAmount(normalizedText);

        if (extractedAmount === null) {
          return {
            draftReply: "No pude extraer el monto de pago. ¿Podrías indicarlo nuevamente?",
            paymentIntent: "payment_amount" as const
          };
        }

        // Validar monto de pago
        const validation = validatePaymentAmount(extractedAmount, orderDraft.total);

        if (!validation.valid) {
          return {
            draftReply: generateInsufficientAmountResponse(orderDraft.total, extractedAmount),
            paymentIntent: "payment_amount" as const
          };
        }

        // Actualizar monto de pago en el orderDraft
        return {
          orderDraft: {
            ...orderDraft,
            montoAbono: extractedAmount
          } as ConversationOrderDraft,
          paymentIntent: "payment_amount" as const,
          paymentAmount: extractedAmount
        };
      }

      case "payment_confirmation": {
        // Cliente confirma el pedido/pago
        const orderDraft = state.orderDraft as ConversationOrderDraftV2;

        if (!orderDraft || orderDraft.items.length === 0) {
          return {
            draftReply: "No tienes un pedido activo para confirmar. ¿Quieres hacer un pedido?",
            paymentIntent: "payment_confirmation" as const
          };
        }

        // Validar que el pedido esté completo
        if (orderDraft.estado !== "completo") {
          return {
            draftReply: `Tu pedido aún no está completo. Falta: ${getMissingFields(orderDraft)}`,
            paymentIntent: "payment_confirmation" as const
          };
        }

        // Validar que el monto de pago sea suficiente
        if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono !== null) {
          const validation = validatePaymentAmount(orderDraft.montoAbono, orderDraft.total);

          if (!validation.valid) {
            return {
              draftReply: generateInsufficientAmountResponse(orderDraft.total, orderDraft.montoAbono),
              paymentIntent: "payment_confirmation" as const
            };
          }
        }

        // Generar respuesta de confirmación con detalles de pago
        const response = paymentConfig
          ? generateOrderConfirmationPayment(orderDraft, paymentConfig)
          : generateBasicOrderConfirmation(orderDraft);

        // Marcar el pedido como confirmado (esto podría requerir lógica adicional)
        return {
          draftReply: response,
          paymentIntent: "payment_confirmation" as const,
          paymentConfirmed: true
        };
      }

      case "payment_question": {
        // Cliente pregunta sobre pagos
        const orderDraft = state.orderDraft as ConversationOrderDraftV2;

        if (orderDraft && orderDraft.items.length > 0) {
          // Pedido activo: preguntar monto si es efectivo
          if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
            return {
              draftReply: generatePaymentAmountRequestResponse(orderDraft.total),
              paymentIntent: "payment_question" as const
            };
          }
        }

        // Sin pedido activo: informar métodos de pago
        const response = paymentConfig
          ? generatePaymentMethodsResponse(paymentConfig)
          : "Lo siento, no tenemos configuración de pagos disponible.";

        return {
          draftReply: response,
          paymentIntent: "payment_question" as const
        };
      }

      default:
        return {};
    }
  };
}

/**
 * SRS v4: Order Handler Node V2
 *
 * Implementa lógica acumulativa de carrito con soporte para
 * acciones add/remove/replace/clear y manejo mejorado de pagos.
 */
export function createOrderHandlerNodeV2(
  repository: any
) {
  return async (state: ConversationGraphStateV2) => {
    const session = state.session;
    const orderDraft = cloneOrderDraftV2(state.orderDraft, state.chatId);
    const normalizedText = normalizeOrderTextV2(state.messageText);
    const hasIncomingLines = state.extractedOrderLines.length > 0;

    // SRS v4: Detectar acción global del carrito
    const cartAction = detectCartAction(normalizedText);

    // SRS v4: Detectar cancelación de pedido
    const cancellation = detectOrderCancellation(normalizedText);

    if (cancellation.isCancellation) {
      // Manejar cancelación de pedido
      if (orderDraft.items.length > 0) {
        logger.info("Order cancelled by user", undefined, {
          sessionId: session?.id,
          chatId: state.chatId
        });

        orderDraft.items = [];
        orderDraft.total = 0;
        orderDraft.estado = "incompleto" as const;
        orderDraft.cartAction = "clear" as const;
        orderDraft.previousCart = [];

        return {
          draftReply: "Tu pedido ha sido cancelado. ¿Quieres comenzar de nuevo?",
          orderDraft: orderDraft as ConversationOrderDraftV2
        };
      }

      return {
        draftReply: "No tienes un pedido activo para cancelar. ¿Quieres hacer un pedido?",
        orderDraft: orderDraft as ConversationOrderDraftV2
      };
    }

    // SRS v4: Aplicar acción de carrito (add/remove/replace/clear)
    if (hasIncomingLines) {
      // Validar acción para el estado actual
      const actionValidation = validateCartActionForState(
        cartAction,
        orderDraft.items
      );

      if (!actionValidation.valid) {
        return {
          draftReply: actionValidation.reason!,
          orderDraft: orderDraft as ConversationOrderDraftV2
        };
      }

      // Aplicar acción al carrito
      const newCart = applyCartAction(
        orderDraft.items,
        // Crear items extraídos
        state.extractedOrderLines.map(line => ({
          producto: line.productText,
          cantidad: line.quantity,
          precioUnitario: 0 // Se actualizará tras validación
        })),
        cartAction
      );

      orderDraft.items = newCart;
      orderDraft.cartAction = cartAction;
      orderDraft.previousCart = [...orderDraft.items]; // Guardar estado anterior para referencia
    }

    if (orderDraft.items.length === 0 && !hasIncomingLines) {
      return {
        draftReply: "Decime qué producto queres pedir y lo preparo.",
        orderDraft: orderDraft as ConversationOrderDraftV2
      };
    }

    // Actualizar orderDraft con el mensaje actual
    updateOrderDraftWithMessageV2(orderDraft, normalizedText);

    // Recalcular totales
    recalculateOrderToolV2(orderDraft);

    // Actualizar estado del pedido
    orderDraft.estado = determineOrderStatusV2(orderDraft);

    // Persistir en Convex
    if (orderDraft.items.length > 0) {
      await repository.upsertOrderForSession({
        telefono: orderDraft.telefono,
        items: orderDraft.items,
        direccion: orderDraft.direccion,
        tipoEntrega: orderDraft.tipoEntrega,
        metodoPago: orderDraft.metodoPago,
        nombreCliente: orderDraft.nombreCliente,
        total: orderDraft.total,
        estado: orderDraft.estado,
        montoAbono: orderDraft.montoAbono,
        sessionId: session?.id
      });
    }

    return {
      draftReply: buildOrderReplyV2({
        invalidOrderLines: state.invalidOrderLines,
        orderDraft: orderDraft as ConversationOrderDraftV2,
        validatedOrderLines: state.validatedOrderLines,
        cartAction
      }),
      orderDraft: orderDraft as ConversationOrderDraftV2
    };
  };
}

/**
 * SRS v4: Clona el orderDraft con soporte para carrito V2
 */
function cloneOrderDraftV2(
  currentOrderDraft: ConversationOrderDraft | null,
  chatId: string
): ConversationOrderDraftV2 {
  if (currentOrderDraft) {
    const draftV2 = currentOrderDraft as ConversationOrderDraftV2;

    return {
      ...currentOrderDraft,
      items: currentOrderDraft.items.map((item) => ({
        ...item
      })),
      cartAction: draftV2.cartAction || "add",
      previousCart: draftV2.previousCart || []
    } as ConversationOrderDraftV2;
  }

  return {
    telefono: chatId,
    items: [],
    direccion: null,
    tipoEntrega: null,
    metodoPago: null,
    nombreCliente: null,
    montoAbono: null,
    total: 0,
    estado: "incompleto",
    cartAction: "add" as const,
    previousCart: []
  } as ConversationOrderDraftV2;
}

/**
 * SRS v4: Actualiza el orderDraft con el mensaje actual
 */
function updateOrderDraftWithMessageV2(
  orderDraft: ConversationOrderDraftV2,
  normalizedText: string
): void {
  if (normalizedText.includes("delivery") || normalizedText.includes("envio")) {
    orderDraft.tipoEntrega = "delivery";
  }

  if (normalizedText.includes("retiro") || normalizedText.includes("pickup") || normalizedText.includes("paso a buscar")) {
    orderDraft.tipoEntrega = "pickup";
  }

  if (orderDraft.tipoEntrega === "delivery") {
    const explicitAddress = normalizedText.match(/(?:mi direccion es|direccion|es en)\s+(.+)/);

    if (explicitAddress?.[1]) {
      orderDraft.direccion = explicitAddress[1].trim();
    } else if (/\d/.test(normalizedText)) {
      orderDraft.direccion = normalizedText;
    }
  }

  const paymentKeywords = ["efectivo", "tarjeta", "transferencia", "mercado pago", "mercadopago", "alias"];

  if (paymentKeywords.some(keyword => normalizedText.includes(keyword))) {
    if (normalizedText.includes("mercado pago") || normalizedText.includes("mercadopago")) {
      orderDraft.metodoPago = "mercado pago";
    } else if (normalizedText.includes("tarjeta")) {
      orderDraft.metodoPago = "tarjeta";
    } else if (
      normalizedText.includes("transferencia") ||
      normalizedText.includes("alias")
    ) {
      orderDraft.metodoPago = "transferencia";
    } else {
      orderDraft.metodoPago = "efectivo";
    }
  }

  const explicitName = normalizedText.match(/(?:me llamo|soy)\s+([a-z\s]+)/);

  if (explicitName?.[1]) {
    orderDraft.nombreCliente = explicitName[1].trim();
  } else if (!orderDraft.nombreCliente && looksLikeNameOnlyMessageV2(normalizedText)) {
    orderDraft.nombreCliente = normalizedText;
  }

  // SRS v4: Extraer monto de pago para pagos en efectivo
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    const extractedAmount = extractPaymentAmount(normalizedText);
    if (extractedAmount !== null) {
      orderDraft.montoAbono = extractedAmount;
    }
  }
}

/**
 * SRS v4: Recalcula totales del pedido V2
 */
function recalculateOrderToolV2(orderDraft: ConversationOrderDraftV2): void {
  let total = 0;

  for (const item of orderDraft.items) {
    total += item.cantidad * item.precioUnitario;
  }

  orderDraft.total = total;
}

/**
 * SRS v4: Determina el estado del pedido V2
 */
function determineOrderStatusV2(
  orderDraft: ConversationOrderDraftV2
): "completo" | "error_producto" | "incompleto" {
  if (orderDraft.items.length === 0) {
    return "incompleto";
  }

  if (orderDraft.tipoEntrega === "delivery" && !orderDraft.direccion) {
    return "incompleto";
  }

  if (!orderDraft.tipoEntrega || !orderDraft.metodoPago || !orderDraft.nombreCliente) {
    return "incompleto";
  }

  // SRS v4: Requerir montoAbono para pagos en efectivo
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    return "incompleto";
  }

  // SRS v4: Validar que el monto de pago sea suficiente
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono !== null) {
    if (orderDraft.montoAbono < orderDraft.total) {
      return "incompleto"; // Monto insuficiente
    }
  }

  return "completo";
}

/**
 * SRS v4: Genera la respuesta del pedido V2 con soporte de carrito
 */
function buildOrderReplyV2(input: {
  validatedOrderLines: Array<any>;
  invalidOrderLines: Array<any>;
  orderDraft: ConversationOrderDraftV2;
  cartAction?: CartAction;
}): string {
  const segments: Array<string> = [];

  // Mostrar acción de carrito aplicada
  if (input.cartAction) {
    const actionMessages: Record<CartAction, string> = {
      add: "Agregado:",
      remove: "Quitado:",
      replace: "Cambiado:",
      clear: "Carrito vaciado"
    };

    segments.push(`🛒 ${actionMessages[input.cartAction]}\n`);
  }

  if (input.validatedOrderLines.length === 1 && input.invalidOrderLines.length === 0) {
    const line = input.validatedOrderLines[0];
    const updatedItem = input.orderDraft.items.find(
      (item: any) => item.producto === line.matchedProduct
    );

    const shouldShowAccumulatedTotal =
      input.orderDraft.items.length > 1 ||
      (updatedItem?.cantidad ?? line.quantity) > line.quantity;

    if (shouldShowAccumulatedTotal) {
      segments.push(
        `${line.quantity} ${line.matchedProduct} ($${line.subtotal}). Total parcial: $${input.orderDraft.total}.`
      );
    } else {
      segments.push(
        `${line.quantity} ${line.requestedProduct} ($${line.precioUnitario} c/u = $${line.subtotal}).`
      );
    }
  } else if (input.validatedOrderLines.length === 1) {
    const line = input.validatedOrderLines[0];
    segments.push(`${line.quantity} ${line.matchedProduct} ($${line.subtotal}).`);
  } else if (input.validatedOrderLines.length > 1) {
    const addedItems = input.validatedOrderLines
      .map((line: any) => `${line.quantity} ${line.matchedProduct} ($${line.subtotal})`)
      .join(", ");

    segments.push(`${addedItems}. Total parcial: $${input.orderDraft.total}.`);
  }

  if (input.invalidOrderLines.length > 0) {
    const missingItems = input.invalidOrderLines
      .map((line: any) => line.requestedProduct)
      .join(", ");

    segments.push(
      `❌ No pude identificar: ${missingItems}. Decime a qué producto te referis y lo sumo.`
    );
  }

  if (input.orderDraft.items.length === 0) {
    return (
      segments.join(" ").trim() ||
      "No encontre ese producto en la lista de precios. Decime otro item del menu y lo reviso."
    );
  }

  segments.push(buildOrderFollowUpV2(input.orderDraft));

  return segments.join(" ").trim();
}

/**
 * SRS v4: Genera el follow-up del pedido con mejor manejo de pagos
 */
function buildOrderFollowUpV2(orderDraft: ConversationOrderDraftV2): string {
  if (!orderDraft.tipoEntrega) {
    return "¿Es para delivery o retiro?";
  }

  if (orderDraft.tipoEntrega === "delivery" && !orderDraft.direccion) {
    return "Perfecto. ¿Cual es la direccion de entrega?";
  }

  if (!orderDraft.metodoPago) {
    return "¿Como queres pagar? (efectivo/tarjeta/transferencia/mercado pago)";
  }

  if (!orderDraft.nombreCliente) {
    return "¿A nombre de quien dejamos el pedido?";
  }

  // SRS v4: Solicitar monto de pago para efectivo
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    return `El total es $${orderDraft.total}. ¿Con cuanto vas a pagar?`;
  }

  const itemsSummary = orderDraft.items
    .map((item: any) => `${item.cantidad} ${item.producto}`)
    .join(", ");
  const deliverySummary =
    orderDraft.tipoEntrega === "delivery"
      ? `delivery a ${orderDraft.direccion}`
      : "retiro en sucursal";

  // SRS v4: Mostrar vuelto si hay pago en efectivo
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono !== null) {
    try {
      const vuelto = calculateChange(orderDraft.total, orderDraft.montoAbono);
      if (vuelto > 0) {
        return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}. Abonas $${orderDraft.montoAbono}, tu vuelto es $${vuelto}.`;
      }
      // Pago exacto
      return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}. Abonas con el monto exacto.`;
    } catch {
      // Error de cálculo (monto insuficiente)
      return `El monto ($${orderDraft.montoAbono}) es insuficiente. El total es $${orderDraft.total}. ¿Con cuanto vas a pagar?`;
    }
  }

  return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}.`;
}

/**
 * SRS v4: Genera confirmación básica sin configuración de pago
 */
function generateBasicOrderConfirmation(orderDraft: ConversationOrderDraftV2): string {
  const itemsSummary = orderDraft.items
    .map((item: any) => `${item.cantidad} ${item.producto}`)
    .join(", ");
  const deliverySummary =
    orderDraft.tipoEntrega === "delivery"
      ? `delivery a ${orderDraft.direccion}`
      : "retiro en sucursal";

  return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}.`;
}

/**
 * SRS v4: Genera lista de campos faltantes
 */
function getMissingFields(orderDraft: ConversationOrderDraftV2): string {
  const missing: Array<string> = [];

  if (!orderDraft.tipoEntrega) {
    missing.push("tipo de entrega (delivery/retiro)");
  }

  if (orderDraft.tipoEntrega === "delivery" && !orderDraft.direccion) {
    missing.push("dirección de entrega");
  }

  if (!orderDraft.metodoPago) {
    missing.push("método de pago");
  }

  if (!orderDraft.nombreCliente) {
    missing.push("nombre del cliente");
  }

  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    missing.push("monto de pago");
  }

  return missing.join(", ");
}

/**
 * SRS v4: Detecta si el mensaje es solo un nombre
 */
function looksLikeNameOnlyMessageV2(normalizedText: string): boolean {
  if (!/^[a-z]+(?:\s+[a-z]+){0,3}$/u.test(normalizedText)) {
    return false;
  }

  const forbidden = [
    "menu", "carta", "que tienen", "que venden",
    "recomend", "suger", "horario", "hora",
    "abierto", "cierran", "donde", "direccion",
    "delivery", "envio", "retiro", "pickup", "paso a buscar",
    "efectivo", "tarjeta", "transferencia", "mercado pago", "alias",
    "quiero", "quisiera", "pedido", "pedir", "agrega", "agregame",
    "suma", "sumame", "mandame", "manda", "traeme", "trae",
    "dame", "poneme", "pagar", "tengo", "abono"
  ];

  if (forbidden.some(word => normalizedText.includes(word))) {
    return false;
  }

  return true;
}

/**
 * Exporta el tipo de intención extendido para uso externo
 */
export type { ConversationIntentV2 };
