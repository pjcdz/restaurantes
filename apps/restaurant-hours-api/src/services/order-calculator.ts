import type { ConversationOrderItem } from "./conversation-assistant.js";

export function calculateLineSubtotal(
  quantity: number,
  unitPrice: number
): number {
  return quantity * unitPrice;
}

export function calculateOrderTotals(items: Array<ConversationOrderItem>): {
  total: number;
  subtotals: Record<string, number>;
} {
  const subtotals: Record<string, number> = {};
  let total = 0;

  for (const item of items) {
    const subtotal = calculateLineSubtotal(item.cantidad, item.precioUnitario);

    subtotals[item.producto] = (subtotals[item.producto] || 0) + subtotal;
    total += subtotal;
  }

  return {
    total,
    subtotals
  };
}
