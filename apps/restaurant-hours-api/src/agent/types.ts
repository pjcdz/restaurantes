/**
 * Agent State type definition for LangGraph
 */
export interface AgentState {
  // Conversation messages
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
  }>;

  // Classified intent
  intent: "faq" | "order" | "complaint" | "saludo" | "unknown" | null;

  // Cart/order state
  cart: {
    items: Array<{
      producto: string;
      cantidad: number;
      precioUnitario: number;
    }>;
    telefono: string | null;
    direccion: string | null;
    tipoEntrega: "delivery" | "pickup" | null;
    metodoPago: string | null;
    nombreCliente: string | null;
  };

  // Session info
  sessionId: string | null;
  chatId: string | null;

  // FAQ lookup result
  faqResult: {
    found: boolean;
    respuesta: string | null;
    tema: string | null;
  } | null;

  // Order validation result
  orderValidation: {
    isValid: boolean;
    missingFields: string[];
    estado: "incompleto" | "completo" | "error_producto" | null;
  } | null;

  // Final response
  response: string | null;

  // Error tracking
  error: string | null;
}

/**
 * Default initial state
 */
export const createInitialState = (): AgentState => ({
  messages: [],
  intent: null,
  cart: {
    items: [],
    telefono: null,
    direccion: null,
    tipoEntrega: null,
    metodoPago: null,
    nombreCliente: null,
  },
  sessionId: null,
  chatId: null,
  faqResult: null,
  orderValidation: null,
  response: null,
  error: null,
});

/**
 * Intent types for classification
 */
export type Intent = "faq" | "order" | "complaint" | "saludo" | "unknown";

/**
 * Order status types
 */
export type OrderStatus = "incompleto" | "completo" | "confirmado" | "error_producto";
