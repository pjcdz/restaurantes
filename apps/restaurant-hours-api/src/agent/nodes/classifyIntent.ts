import { getLLM, getLangfuseCallbackHandler } from "../llm.js";
import type { AgentState, Intent } from "../types.js";
import { ChatPromptTemplate } from "@langchain/core/prompts";

const INTENT_CLASSIFICATION_PROMPT = `Eres un clasificador de intenciones para un chatbot de restaurante.
Tu tarea es clasificar el mensaje del usuario en una de las siguientes categorías:

1. **saludo** - El usuario está saludando o iniciando una conversación (ej: "hola", "buenas", "qué tal")
2. **faq** - El usuario hace una pregunta sobre el menú, precios, horarios, ubicación, o información general (ej: "qué tienen", "cuánto cuesta", "horarios")
3. **order** - El usuario quiere hacer un pedido o está proporcionando datos para un pedido (ej: "quiero 2 hamburguesas", "delivery", "mi dirección es")
4. **complaint** - El usuario está quejándose o expresando frustración (ej: "muy caro", "demoró mucho", "mal servicio")
5. **unknown** - No se puede determinar la intención claramente

Responde ÚNICAMENTE con una de estas palabras: saludo, faq, order, complaint, unknown

Mensaje del usuario: {message}

Historial de conversación reciente:
{conversationHistory}

Intención:`;

/**
 * Classify the user's intent using the LLM
 */
export async function classifyIntentNode(
  state: AgentState,
): Promise<Partial<AgentState>> {
  const lastMessage = state.messages[state.messages.length - 1];
  
  if (!lastMessage || lastMessage.role !== "user") {
    return { intent: "unknown" };
  }

  try {
    const llm = getLLM();
    const callbackHandler = getLangfuseCallbackHandler(
      "intent-classification",
      state.sessionId ?? undefined,
      state.chatId ?? undefined,
    );

    const prompt = ChatPromptTemplate.fromTemplate(INTENT_CLASSIFICATION_PROMPT);
    const chain = prompt.pipe(llm);

    const conversationHistory = state.messages
      .slice(-5)
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const response = await chain.invoke(
      {
        message: lastMessage.content,
        conversationHistory,
      },
      {
        callbacks: [callbackHandler],
      },
    );

    const content = response.content.toString().toLowerCase().trim();
    
    // Validate and map the response to a valid intent
    const validIntents: Intent[] = ["saludo", "faq", "order", "complaint", "unknown"];
    const classifiedIntent: Intent = validIntents.includes(content as Intent)
      ? (content as Intent)
      : "unknown";

    return { intent: classifiedIntent };
  } catch (error) {
    console.error("Error classifying intent:", error);
    return { 
      intent: "unknown",
      error: error instanceof Error ? error.message : "Failed to classify intent",
    };
  }
}
