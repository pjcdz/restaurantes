import type { ConversationOrderItem } from "./conversation-assistant.js";

/**
 * EDGE-1: Error thrown when negative quantity or price is provided.
 */
export class InvalidOrderValueError extends Error {
  /**
   * Creates a new InvalidOrderValueError.
   * @param field - The field that has an invalid value ("quantity" or "price")
   * @param value - The invalid value
   */
  constructor(
    public readonly field: "quantity" | "price",
    public readonly value: number
  ) {
    super(`Invalid ${field}: ${value}. ${field} must be non-negative.`);
    this.name = "InvalidOrderValueError";
  }
}

/**
 * EDGE-1: Validates that quantity and price are non-negative.
 * @param quantity - The quantity to validate
 * @param unitPrice - The price to validate
 * @throws {InvalidOrderValueError} When quantity or price is negative
 */
export function validateOrderLineValues(
  quantity: number,
  unitPrice: number
): void {
  if (quantity < 0) {
    throw new InvalidOrderValueError("quantity", quantity);
  }
  if (unitPrice < 0) {
    throw new InvalidOrderValueError("price", unitPrice);
  }
}

/**
 * Calculates the subtotal for a single order line item.
 * EDGE-1: Validates that quantity and price are non-negative before calculation.
 * @param quantity - The number of units ordered (must be non-negative)
 * @param unitPrice - The price per unit (must be non-negative)
 * @returns The subtotal (quantity × unitPrice)
 * @throws {InvalidOrderValueError} When quantity or price is negative
 */
export function calculateLineSubtotal(
  quantity: number,
  unitPrice: number
): number {
  validateOrderLineValues(quantity, unitPrice);
  return quantity * unitPrice;
}

/**
 * Calculates the total and per-product subtotals for an order.
 * @param items - Array of order items with producto, cantidad, and precioUnitario
 * @returns An object containing the total and a record of subtotals by product name
 */
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

/**
 * InsufficientPaymentError is thrown when the payment amount is less than the order total.
 */
export class InsufficientPaymentError extends Error {
  /**
   * Creates a new InsufficientPaymentError.
   * @param orderTotal - The total amount due
   * @param paymentAmount - The amount provided by the customer
   */
  constructor(
    public readonly orderTotal: number,
    public readonly paymentAmount: number
  ) {
    super(
      `Payment amount (${paymentAmount}) is less than order total (${orderTotal})`
    );
    this.name = "InsufficientPaymentError";
  }
}

/**
 * Calculates the change (vuelto) to return to the customer.
 * @param orderTotal - The total amount due for the order
 * @param paymentAmount - The amount provided by the customer
 * @returns The change to return (0 for exact payment)
 * @throws {InsufficientPaymentError} When paymentAmount is less than orderTotal
 * @example
 * ```typescript
 * calculateChange(100, 150); // Returns 50
 * calculateChange(100, 100); // Returns 0 (exact payment)
 * calculateChange(100, 50);  // Throws InsufficientPaymentError
 * ```
 */
export function calculateChange(
  orderTotal: number,
  paymentAmount: number
): number {
  if (paymentAmount < orderTotal) {
    throw new InsufficientPaymentError(orderTotal, paymentAmount);
  }

  return paymentAmount - orderTotal;
}
