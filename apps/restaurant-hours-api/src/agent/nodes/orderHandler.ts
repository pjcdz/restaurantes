import { getLLM, getLangfuseCallbackHandler } from "../llm.js";
import type { AgentState, OrderStatus } from "../types.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const ORDER_EXTRACTION_PROMPT = `Eres un asistente que ayuda a procesar pedidos de un restaurante.
Extrae la información del pedido del mensaje del usuario.

Estado actual del carrito:
{cartState}

Mensaje del usuario: {message}

Extrae cualquier información nueva sobre el pedido y responde en formato JSON:
{{
  "items": [
    {{ "producto": "nombre del producto", "cantidad": 1 }}
  ],
  "telefono": "número de teléfono o null",
  "direccion": "dirección de entrega o null",
  "tipoEntrega": "delivery o pickup o null",
  "metodoPago": "efectivo o tarjeta o null",
  "nombreCliente": "nombre del cliente o null"
}}

IMPORTANTE:
- Si el usuario menciona un producto, agrégalo a los items existentes
- Si el usuario corrige un dato, actualiza ese campo
- Si no se menciona algo, déjalo como null
- Si no se especifica cantidad, asume 1
- Responde SOLO con el JSON, sin explicaciones adicionales`;

const ORDER_VALIDATION_PROMPT = `Eres un validador de pedidos de restaurante.
Determina si el pedido está completo y qué campos faltan.

Estado del carrito:
{cartState}

Un pedido está COMPLETO si tiene:
- Al menos 1 item con producto y cantidad
- Teléfono de contacto
- Tipo de entrega (delivery/pickup)
- Si es delivery: dirección de entrega
- Método de pago
- Nombre del cliente

Responde en formato JSON:
{{
  "isValid": true/false,
  "missingFields": ["campo1", "campo2"],
  "estado": "incompleto o completo o error_producto"
}}`;

/**
 * Order Handler node - manages the order taking process
 */
export async function orderHandlerNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage) {
    return {
      orderValidation: {
        isValid: false,
        missingFields: ["items"],
        estado: "incompleto",
      },
      response: "¿Qué te gustaría ordenar?",
    };
  }

  try {
    const llm = getLLM();
    const callbackHandler = getLangfuseCallbackHandler(
      "order-handler",
      state.sessionId ?? undefined,
      state.chatId ?? undefined,
    );

    // Extract order information from the message
    const extractedInfo = await extractOrderInfo(
      llm,
      state.cart,
      lastMessage.content,
      callbackHandler,
    );

    // Merge extracted info with existing cart state
    const updatedCart = mergeCartState(state.cart, extractedInfo);

    // Validate the order
    const validation = await validateOrder(llm, updatedCart, callbackHandler);

    // Generate appropriate response
    const response = generateOrderResponse(updatedCart, validation);

    return {
      cart: updatedCart,
      orderValidation: validation,
      response,
    };
  } catch (error) {
    console.error("Error in order handler:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to process order",
      response: "Lo siento, hubo un error al procesar tu pedido. Por favor intenta de nuevo.",
    };
  }
}

/**
 * Extract order information from user message using LLM
 */
async function extractOrderInfo(
  llm: ReturnType<typeof getLLM>,
  currentCart: AgentState["cart"],
  message: string,
  callbackHandler: ReturnType<typeof getLangfuseCallbackHandler>,
): Promise<Partial<AgentState["cart"]>> {
  const prompt = ChatPromptTemplate.fromTemplate(ORDER_EXTRACTION_PROMPT);
  const chain = prompt.pipe(llm);

  const cartState = JSON.stringify(currentCart, null, 2);

  try {
    const response = await chain.invoke(
      {
        cartState,
        message,
      },
      {
        callbacks: [callbackHandler],
      },
    );

    const content = response.content.toString();
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return {};
  } catch (error) {
    console.error("Error extracting order info:", error);
    return {};
  }
}

/**
 * Merge extracted info with existing cart state
 */
function mergeCartState(
  currentCart: AgentState["cart"],
  extractedInfo: Partial<AgentState["cart"]>,
): AgentState["cart"] {
  const newCart = { ...currentCart };

  // Merge items (add new items to existing)
  if (extractedInfo.items && extractedInfo.items.length > 0) {
    for (const newItem of extractedInfo.items) {
      const existingIndex = newCart.items.findIndex(
        (item) => item.producto.toLowerCase() === newItem.producto.toLowerCase(),
      );
      if (existingIndex >= 0) {
        newCart.items[existingIndex].cantidad += newItem.cantidad;
      } else {
        // Add price from prices table (placeholder - would query Convex)
        newCart.items.push({
          producto: newItem.producto,
          cantidad: newItem.cantidad,
          precioUnitario: getProductPrice(newItem.producto),
        });
      }
    }
  }

  // Update other fields if provided
  if (extractedInfo.telefono) newCart.telefono = extractedInfo.telefono;
  if (extractedInfo.direccion) newCart.direccion = extractedInfo.direccion;
  if (extractedInfo.tipoEntrega) newCart.tipoEntrega = extractedInfo.tipoEntrega;
  if (extractedInfo.metodoPago) newCart.metodoPago = extractedInfo.metodoPago;
  if (extractedInfo.nombreCliente) newCart.nombreCliente = extractedInfo.nombreCliente;

  return newCart;
}

/**
 * Validate the current order state
 */
async function validateOrder(
  llm: ReturnType<typeof getLLM>,
  cart: AgentState["cart"],
  callbackHandler: ReturnType<typeof getLangfuseCallbackHandler>,
): Promise<{ isValid: boolean; missingFields: string[]; estado: "incompleto" | "completo" | "error_producto" | null }> {
  const prompt = ChatPromptTemplate.fromTemplate(ORDER_VALIDATION_PROMPT);
  const chain = prompt.pipe(llm);

  const cartState = JSON.stringify(cart, null, 2);

  try {
    const response = await chain.invoke(
      {
        cartState,
      },
      {
        callbacks: [callbackHandler],
      },
    );

    const content = response.content.toString();
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      // Ensure estado is a valid value
      const validEstados = ["incompleto", "completo", "error_producto"];
      if (validEstados.includes(parsed.estado)) {
        return parsed;
      }
    }
  } catch (error) {
    console.error("Error validating order:", error);
  }

  // Fallback validation logic
  const missingFields: string[] = [];
  
  if (cart.items.length === 0) missingFields.push("items");
  if (!cart.telefono) missingFields.push("telefono");
  if (!cart.tipoEntrega) missingFields.push("tipoEntrega");
  if (cart.tipoEntrega === "delivery" && !cart.direccion) missingFields.push("direccion");
  if (!cart.metodoPago) missingFields.push("metodoPago");
  if (!cart.nombreCliente) missingFields.push("nombreCliente");

  return {
    isValid: missingFields.length === 0,
    missingFields,
    estado: missingFields.length === 0 ? "completo" : "incompleto",
  };
}

/**
 * Generate response based on cart state and validation
 */
function generateOrderResponse(
  cart: AgentState["cart"],
  validation: { isValid: boolean; missingFields: string[]; estado: OrderStatus | null },
): string {
  if (validation.isValid) {
    const total = cart.items.reduce(
      (sum, item) => sum + item.precioUnitario * item.cantidad,
      0,
    );
    
    const itemsList = cart.items
      .map((item) => `${item.cantidad}x ${item.producto} ($${item.precioUnitario * item.cantidad})`)
      .join(", ");

    return `¡Perfecto! Tu pedido está completo:\n\n` +
      `📦 ${itemsList}\n` +
      `📍 ${cart.tipoEntrega === "delivery" ? `Delivery a: ${cart.direccion}` : "Retiro en sucursal"}\n` +
      `💳 Pago: ${cart.metodoPago}\n` +
      `📞 Teléfono: ${cart.telefono}\n` +
      `👤 Nombre: ${cart.nombreCliente}\n\n` +
      `💰 Total: $${total}\n\n` +
      `¿Confirmás el pedido?`;
  }

  // Ask for missing information
  const fieldPrompts: Record<string, string> = {
    items: "¿Qué te gustaría ordenar?",
    telefono: "¿Cuál es tu número de teléfono?",
    tipoEntrega: "¿Preferís delivery o retiro en sucursal?",
    direccion: "¿Cuál es tu dirección de entrega?",
    metodoPago: "¿Cómo vas a pagar? (efectivo/tarjeta)",
    nombreCliente: "¿A nombre de quién está el pedido?",
  };

  const nextField = validation.missingFields[0];
  const prompt = fieldPrompts[nextField] || "¿Podrías proporcionar más información?";

  // Include current cart status if there are items
  if (cart.items.length > 0) {
    const itemsList = cart.items
      .map((item) => `${item.cantidad}x ${item.producto}`)
      .join(", ");
    const total = cart.items.reduce(
      (sum, item) => sum + item.precioUnitario * item.cantidad,
      0,
    );
    
    return `Tu carrito actual: ${itemsList} - Total: $${total}\n\n${prompt}`;
  }

  return prompt;
}

/**
 * Get product price from prices table (placeholder)
 * In production, this would query Convex precios table
 */
function getProductPrice(producto: string): number {
  // Placeholder prices - would be replaced with Convex query
  const prices: Record<string, number> = {
    "hamburguesa": 2500,
    "hamburguesa clasica": 2500,
    "hamburguesa doble": 3500,
    "papas fritas": 1200,
    "papas": 1200,
    "papas con queso": 1500,
    "bebida": 800,
    "gaseosa": 800,
    "coca": 800,
    "combo": 4000,
  };

  const productLower = producto.toLowerCase();
  for (const [key, price] of Object.entries(prices)) {
    if (productLower.includes(key)) {
      return price;
    }
  }

  return 0; // Unknown product - should trigger error_producto
}
