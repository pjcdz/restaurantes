import { StateGraph, END, Annotation } from "@langchain/langgraph";
import type { AgentState, Intent, OrderStatus } from "./types.js";
import { createInitialState } from "./types.js";
import {
  classifyIntentNode,
  faqHandlerNode,
  orderHandlerNode,
  formatResponseNode,
} from "./nodes/index.js";

/**
 * Define the state annotation for LangGraph
 */
const AgentStateAnnotation = Annotation.Root({
  messages: Annotation<Array<{ role: "user" | "assistant" | "system"; content: string }>>({
    default: () => [],
    reducer: (current, update) => [...current, ...update],
  }),
  intent: Annotation<Intent | null>({
    default: () => null,
    reducer: (_, update) => update,
  }),
  cart: Annotation<AgentState["cart"]>({
    default: () => ({
      items: [],
      telefono: null,
      direccion: null,
      tipoEntrega: null,
      metodoPago: null,
      nombreCliente: null,
    }),
    reducer: (current, update) => ({ ...current, ...update }),
  }),
  sessionId: Annotation<string | null>({
    default: () => null,
    reducer: (_, update) => update,
  }),
  chatId: Annotation<string | null>({
    default: () => null,
    reducer: (_, update) => update,
  }),
  faqResult: Annotation<AgentState["faqResult"]>({
    default: () => null,
    reducer: (_, update) => update,
  }),
  orderValidation: Annotation<AgentState["orderValidation"]>({
    default: () => null,
    reducer: (_, update) => update,
  }),
  response: Annotation<string | null>({
    default: () => null,
    reducer: (_, update) => update,
  }),
  error: Annotation<string | null>({
    default: () => null,
    reducer: (_, update) => update,
  }),
});

/**
 * Route to the appropriate handler based on intent
 */
function routeByIntent(state: typeof AgentStateAnnotation.State): string {
  const intent = state.intent;

  switch (intent) {
    case "faq":
      return "faq_handler";
    case "order":
      return "order_handler";
    case "saludo":
    case "complaint":
    case "unknown":
    default:
      return "format_response";
  }
}

/**
 * Create the agent graph
 */
export function createAgentGraph() {
  // Create the graph with state annotation
  const graph = new StateGraph(AgentStateAnnotation)
    // Add nodes
    .addNode("classify_intent", classifyIntentNode)
    .addNode("faq_handler", faqHandlerNode)
    .addNode("order_handler", orderHandlerNode)
    .addNode("format_response", formatResponseNode)
    // Set entry point
    .addEdge("__start__", "classify_intent")
    // Add conditional routing after classification
    .addConditionalEdges("classify_intent", routeByIntent, {
      faq_handler: "faq_handler",
      order_handler: "order_handler",
      format_response: "format_response",
    })
    // Connect handlers to response formatter
    .addEdge("faq_handler", "format_response")
    .addEdge("order_handler", "format_response")
    // End after formatting
    .addEdge("format_response", "__end__");

  return graph.compile();
}

/**
 * Run the agent with a message
 */
export async function runAgent(
  message: string,
  chatId: string,
  sessionId?: string,
  previousMessages?: Array<{ role: "user" | "assistant" | "system"; content: string }>,
): Promise<{ response: string; state: Partial<AgentState> }> {
  const graph = createAgentGraph();

  // Get default state first
  const defaultState = createInitialState();

  // Create initial state with the new message, overriding defaults
  const initialState: Partial<AgentState> = {
    ...defaultState,
    messages: previousMessages
      ? [...previousMessages, { role: "user" as const, content: message }]
      : [{ role: "user" as const, content: message }],
    chatId,
    sessionId: sessionId ?? null,
  };

  try {
    // Run the graph
    const result = await graph.invoke(initialState);

    // Add the response to messages
    const response = result.response ?? "Lo siento, no pude procesar tu mensaje.";

    return {
      response,
      state: result,
    };
  } catch (error) {
    console.error("Error running agent:", error);
    return {
      response: "Lo siento, hubo un error al procesar tu mensaje. Por favor intenta de nuevo.",
      state: {
        error: error instanceof Error ? error.message : "Unknown error",
      },
    };
  }
}

// Export types
export type { AgentState, Intent, OrderStatus };
export { createInitialState };
