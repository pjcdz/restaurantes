import type { AgentState } from "../types.js";

/**
 * Format Response node - transforms technical output into user-friendly response
 */
export async function formatResponseNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  // If there's already a response from a previous node, use it
  if (state.response) {
    return { response: state.response };
  }

  // Handle based on intent
  switch (state.intent) {
    case "saludo":
      return {
        response: "¡Hola! Bienvenido a nuestro restaurante. ¿En qué puedo ayudarte? Puedo tomar tu pedido o responder preguntas sobre nuestro menú, horarios y más.",
      };

    case "complaint":
      return {
        response: "Lamento que tengas ese inconveniente. Un momento que te conecto con un operador para ayudarte mejor.",
      };

    case "unknown":
      return {
        response: "No estoy seguro de entender. ¿Podrías reformular tu mensaje? Puedo ayudarte con:\n- Información sobre nuestro menú y precios\n- Tomar tu pedido\n- Horarios y ubicación",
      };

    default:
      return {
        response: "¿En qué más puedo ayudarte?",
      };
  }
}
