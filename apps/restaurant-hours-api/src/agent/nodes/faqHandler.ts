import { getLLM, getLangfuseCallbackHandler } from "../llm.js";
import type { AgentState } from "../types.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const FAQ_RESPONSE_PROMPT = `Eres un asistente de un restaurante de comida rápida.
Tu tarea es responder preguntas basándote EXCLUSIVAMENTE en la información proporcionada.

IMPORTANTE:
- Si la información no está en los datos proporcionados, responde: "Lo siento, no tengo esa información en este momento. ¿Puedo ayudarte con algo más?"
- NO inventes productos, precios ni información.
- Sé amable y conciso.

Datos disponibles:
{contextData}

Pregunta del usuario: {question}

Respuesta:`;

/**
 * FAQ Handler node - handles questions about menu, prices, hours, etc.
 * This node queries Convex for FAQ data and generates a response
 */
export async function faqHandlerNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage) {
    return {
      faqResult: { found: false, respuesta: null, tema: null },
      response: "No entendí tu pregunta. ¿Podrías reformularla?",
    };
  }

  try {
    const llm = getLLM();
    const callbackHandler = getLangfuseCallbackHandler(
      "faq-handler",
      state.sessionId ?? undefined,
      state.chatId ?? undefined,
    );

    // Build context data from available information
    // In a real implementation, this would query Convex for FAQ and menu data
    // For now, we'll use a placeholder that will be replaced with actual Convex queries
    const contextData = await buildFAQContext(state);

    const prompt = ChatPromptTemplate.fromTemplate(FAQ_RESPONSE_PROMPT);
    const chain = prompt.pipe(llm);

    const response = await chain.invoke(
      {
        contextData,
        question: lastMessage.content,
      },
      {
        callbacks: [callbackHandler],
      },
    );

    const respuesta = response.content.toString();

    return {
      faqResult: {
        found: true,
        respuesta,
        tema: detectTopic(lastMessage.content),
      },
      response: respuesta,
    };
  } catch (error) {
    console.error("Error in FAQ handler:", error);
    return {
      faqResult: { found: false, respuesta: null, tema: null },
      error: error instanceof Error ? error.message : "Failed to process FAQ",
      response: "Lo siento, hubo un error al procesar tu pregunta. Por favor intenta de nuevo.",
    };
  }
}

/**
 * Build context data for FAQ responses
 * This would normally query Convex for menu items, prices, and FAQ entries
 */
async function buildFAQContext(state: AgentState): Promise<string> {
  // This is a placeholder - in production, this would query Convex
  // using the internal queries for menu, precios, and faq tables
  
  const contextParts: string[] = [];
  
  // Add placeholder menu data
  contextParts.push(`
MENÚ DISPONIBLE:
- Hamburguesa Clásica: $2500
- Hamburguesa Doble: $3500
- Papas Fritas: $1200
- Papas con Queso: $1500
- Bebidas (Coca, Sprite, Fanta): $800
- Combo Hamburguesa + Papas + Bebida: $4000

HORARIOS:
- Lunes a Viernes: 11:00 - 23:00
- Sábados y Domingos: 12:00 - 00:00

UBICACIÓN:
- Dirección: Av. Principal 123
- Teléfono: 11-1234-5678
- Delivery disponible en un radio de 3km

MÉTODOS DE PAGO:
- Efectivo
- Tarjeta de crédito/débito
- MercadoPago
`);

  return contextParts.join("\n");
}

/**
 * Detect the topic of a question
 */
function detectTopic(question: string): string {
  const questionLower = question.toLowerCase();
  
  if (questionLower.includes("menu") || questionLower.includes("menú") || 
      questionLower.includes("tienen") || questionLower.includes("productos")) {
    return "menu";
  }
  if (questionLower.includes("precio") || questionLower.includes("cuánto") || 
      questionLower.includes("cuesta") || questionLower.includes("cost")) {
    return "precios";
  }
  if (questionLower.includes("hora") || questionLower.includes("cuando") || 
      questionLower.includes("abierto") || questionLower.includes("atienden")) {
    return "horarios";
  }
  if (questionLower.includes("dirección") || questionLower.includes("ubicación") || 
      questionLower.includes("donde") || questionLower.includes("dónde")) {
    return "ubicacion";
  }
  if (questionLower.includes("delivery") || questionLower.includes("envío") || 
      questionLower.includes("entrega")) {
    return "delivery";
  }
  if (questionLower.includes("pago") || questionLower.includes("tarjeta") || 
      questionLower.includes("efectivo")) {
    return "pagos";
  }
  
  return "general";
}
