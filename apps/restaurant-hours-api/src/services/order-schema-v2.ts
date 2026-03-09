/**
 * Order Schema V2 - SRS v4
 *
 * Este módulo define el esquema mejorado para la extracción de pedidos,
 * soportando acciones add/remove/replace/clear en el carrito.
 */

import { z } from "zod";

/**
 * Tipos de acciones de carrito soportadas
 */
export type CartAction = "add" | "remove" | "replace" | "clear";

/**
 * Línea de pedido extraída con acción
 */
export type ExtractedOrderLineV2 = {
  rawText: string;
  productText: string;
  quantity: number;
  action?: CartAction; // Nuevo: acción a aplicar en el carrito
};

/**
 * Resultado de extracción de pedido V2
 */
export type OrderExtractionResultV2 = {
  wantsMenu: boolean;
  orderLines: Array<ExtractedOrderLineV2>;
  action: CartAction; // Nuevo: acción global del mensaje
  confirmation: boolean; // Nuevo: si es una confirmación de pedido
  cancellation: boolean; // Nuevo: si es una cancelación de pedido
};

/**
 * Zod schema para validar acción de carrito
 */
export const cartActionSchema = z.union([
  z.literal("add"),
  z.literal("remove"),
  z.literal("replace"),
  z.literal("clear"),
]);

/**
 * Zod schema para validar cantidad (debe ser >= 1)
 */
export const quantitySchema = z.number().int().min(1, {
  message: "La cantidad debe ser al menos 1"
});

/**
 * Zod schema para validar una línea de pedido extraída
 */
export const orderLineSchemaV2 = z.object({
  rawText: z.string().min(1),
  productText: z.string().min(1),
  quantity: quantitySchema,
  action: cartActionSchema.optional(),
});

/**
 * Zod schema para validar el resultado de extracción de pedido V2
 */
export const orderExtractionSchemaV2 = z.object({
  wantsMenu: z.boolean(),
  orderLines: z.array(orderLineSchemaV2).min(0).max(10),
  action: cartActionSchema.default("add"), // Por defecto, es "add"
  confirmation: z.boolean().default(false),
  cancellation: z.boolean().default(false),
});

/**
 * Zod schema para validar mensaje de cancelación de pedido
 */
export const orderCancellationSchema = z.object({
  cancelled: z.boolean(),
  reason: z.enum(["user_requested", "mistake", "change_mind"]).optional(),
});

/**
 * Zod schema para validar mensaje de confirmación de pedido
 */
export const orderConfirmationSchema = z.object({
  confirmed: z.boolean(),
  orderId: z.string().optional(),
});

/**
 * Valida el resultado de extracción de pedido V2
 */
export function validateOrderExtractionV2(input: unknown): OrderExtractionResultV2 {
  return orderExtractionSchemaV2.parse(input);
}

/**
 * Normaliza el texto para análisis
 */
export function normalizeOrderText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

/**
 * Detecta la acción de carrito a partir del mensaje
 */
export function detectCartAction(normalizedText: string): CartAction {
  // Palabras clave para cada acción
  const removeKeywords = [
    "quitar", "sacar", "sacame", "eliminar", "remover", "borrar", "no quiero", "no me gustas",
    "no quiero eso", "me equivoco", "olvid", "no lo quiero"
  ];

  const replaceKeywords = [
    "cambiar", "cambiame", "reemplazar", "en su lugar", "en lugar", "cambio",
    "revisar", "corregir", "modificar", "editar"
  ];

  const clearKeywords = [
    "cancelar todo", "empezar de nuevo", "nuevo pedido", "borrar todo",
    "limpiar", "vaciar", "olvidar todo", "no quiero nada"
  ];

  if (clearKeywords.some(keyword => normalizedText.includes(keyword))) {
    return "clear";
  }

  if (removeKeywords.some(keyword => normalizedText.includes(keyword))) {
    return "remove";
  }

  if (replaceKeywords.some(keyword => normalizedText.includes(keyword))) {
    return "replace";
  }

  return "add"; // Por defecto, es "add"
}

/**
 * Detecta si el mensaje es una cancelación de pedido
 */
export function detectOrderCancellation(normalizedText: string): { isCancellation: boolean; reason?: string } {
  const cancellationKeywords = [
    "cancelar", "cancelar pedido", "no quiero nada", "borrar todo",
    "empezar de nuevo", "olvidar todo", "limpiar"
  ];

  if (cancellationKeywords.some(keyword => normalizedText.includes(keyword))) {
    return {
      isCancellation: true,
      reason: "user_requested"
    };
  }

  return { isCancellation: false };
}

/**
 * Detecta si el mensaje es una confirmación de pedido
 */
export function detectOrderConfirmation(normalizedText: string): boolean {
  const confirmationKeywords = [
    "sí", "si", "ok", "dale", "listo", "perfecto", "adelante",
    "confirmo", "confirmar", "aprobado", "eso es", "así está bien"
  ];

  return confirmationKeywords.some(keyword => normalizedText.includes(keyword));
}

/**
 * Extrae la cantidad del texto de un producto
 */
export function extractQuantityV2(text: string): number {
  const numericMatch = text.match(/\b(\d+)\b/);

  if (numericMatch) {
    return Math.max(1, parseInt(numericMatch[1], 10));
  }

  // Palabras de cantidad en español
  if (text.includes("uno") || text.includes("un(a)?")) return 1;
  if (text.includes("dos")) return 2;
  if (text.includes("tres")) return 3;
  if (text.includes("cuatro")) return 4;
  if (text.includes("cinco")) return 5;
  if (text.includes("seis")) return 6;
  if (text.includes("siete")) return 7;
  if (text.includes("ocho")) return 8;
  if (text.includes("nueve")) return 9;
  if (text.includes("diez")) return 10;

  return 1; // Por defecto, es 1
}

/**
 * Limpia el nombre del producto de palabras vacías
 */
export function cleanProductName(text: string): string {
  const stopwords = [
    "quiero", "quisiera", "pedir", "un", "una", "el", "la",
    "los", "las", "me", "dame", "da", "traeme", "trae",
    "mandame", "manda", "por", "favor", "porfa"
  ];

  return text
    .toLowerCase()
    .replace(/[.,!?;:]/gu, " ")
    .split(/\s+/)
    .filter(word => !stopwords.includes(word))
    .join(" ")
    .trim();
}

/**
 * Valida que una acción sea válida para el estado actual del pedido
 */
export function validateCartActionForState(
  action: CartAction,
  currentOrderItems: Array<any>
): { valid: boolean; reason?: string } {
  if (action === "remove" && currentOrderItems.length === 0) {
    return {
      valid: false,
      reason: "No hay items en el carrito para quitar."
    };
  }

  if (action === "clear" && currentOrderItems.length === 0) {
    return {
      valid: false,
      reason: "El carrito ya está vacío."
    };
  }

  return { valid: true };
}

/**
 * Aplica una acción al carrito
 */
export function applyCartAction(
  currentCart: Array<any>,
  newItem: any | Array<any>,
  action: CartAction
): Array<any> {
  const incomingItems = Array.isArray(newItem) ? newItem : [newItem];

  switch (action) {
    case "add": {
      const updated = [...currentCart];

      for (const item of incomingItems) {
        if (!item?.producto) {
          continue;
        }

        const existingIndex = updated.findIndex(
          (currentItem) => currentItem.producto === item.producto
        );

        if (existingIndex >= 0) {
          updated[existingIndex] = {
            ...updated[existingIndex],
            cantidad: updated[existingIndex].cantidad + (item.cantidad ?? 1),
            precioUnitario: item.precioUnitario ?? updated[existingIndex].precioUnitario
          };
          continue;
        }

        updated.push({
          ...item,
          cantidad: item.cantidad ?? 1
        });
      }

      return updated;
    }

    case "remove":
      // Quitar producto del carrito
      return currentCart.filter(
        (item) =>
          !incomingItems.some((incoming) => incoming?.producto === item.producto)
      );

    case "replace":
      // Reemplazar todo el carrito
      return incomingItems.filter((item) => Boolean(item?.producto));

    case "clear":
      // Vaciar el carrito
      return [];

    default:
      return currentCart;
  }
}
