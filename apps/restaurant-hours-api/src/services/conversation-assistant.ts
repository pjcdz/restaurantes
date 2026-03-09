import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";

import {
  createRuleBasedOrderExtractionAgent,
  type ExtractedOrderLine,
  type ExtractOrderRequest
} from "./order-extraction.js";
import { ConvexCheckpointer } from "../langgraph/convex-checkpointer.js";
import { createConvexCheckpointerV2 } from "../langgraph/convex-checkpointer-v2.js";
import {
  calculateChange,
  calculateLineSubtotal,
  calculateOrderTotals,
  InsufficientPaymentError
} from "./order-calculator.js";
import {
  detectPaymentIntent,
  extractPaymentAmount as extractPaymentAmountFromPaymentHandler,
  generateChangeResponse,
  generateInsufficientAmountResponse,
  generateOrderConfirmationResponse as generateOrderConfirmationPayment,
  generatePaymentMethodsResponse,
  type PaymentConfig
} from "./payment-handler.js";
import {
  applyCartAction,
  detectCartAction,
  detectOrderCancellation,
  validateCartActionForState,
  type CartAction
} from "./order-schema-v2.js";
import {
  createConversationTraceContext,
  createTracedNodeExecutor,
  getTraceTokenUsage,
  recordTraceError,
  setTraceInput,
  setTraceOutput,
  type ConversationTraceContext
} from "./conversation-tracing.js";
import {
  isFallbackSessionHandedOff,
  setFallbackSessionStatus
} from "./handoff-session-store.js";
import { degradationHandler } from "../resilience/graceful-degradation.js";
import { CircuitOpenError } from "../resilience/circuit-breaker.js";
import { Logger } from "../utils/logger.js";

/**
 * Logger instance for conversation assistant.
 */
const logger = new Logger({ service: "conversation-assistant" });

export type ConversationIntent = "complaint" | "faq" | "greeting" | "order" | "payment";

export type ConversationSessionRecord = {
  id: string;
  chatId: string;
  phoneNumber: string | null;
  createdAt: number;
  updatedAt: number;
  status: "active" | "handed_off" | "paused";
};

export type ConversationCheckpoint = {
  id: string;
  sessionId: string;
  threadId: string;
  checkpoint: string;
  ts?: string;
  versions?: string;
  versionsSeen?: string;
  metadata?: string;
  namespace?: string;
  createdAt: number;
};

export type ConversationPaymentConfig = PaymentConfig;

export type CatalogMenuRecord = {
  item: string;
  descripcion: string;
  precio: number;
  categoria: string;
  disponible: boolean;
};

export type CatalogFaqRecord = {
  tema: string;
  pregunta: string;
  respuesta: string;
};

export type CatalogPriceRecord = {
  producto: string;
  precioUnitario: number;
  aliases: Array<string>;
};

export type ConversationOrderItem = {
  producto: string;
  cantidad: number;
  precioUnitario: number;
};

export type ConversationOrderStatus = "completo" | "error_producto" | "incompleto";

export type ConversationOrderDraft = {
  telefono: string;
  items: Array<ConversationOrderItem>;
  direccion: string | null;
  tipoEntrega: "delivery" | "pickup" | null;
  metodoPago: string | null;
  nombreCliente: string | null;
  montoAbono: number | null;
  total: number;
  estado: ConversationOrderStatus;
};

export type ConversationOrderRecord = ConversationOrderDraft & {
  id: string;
  sessionId: string;
  createdAt: number;
  updatedAt: number;
};

export type CatalogSnapshot = {
  menu: Array<CatalogMenuRecord>;
  faq: Array<CatalogFaqRecord>;
  prices: Array<CatalogPriceRecord>;
};

export type ConversationRepository = {
  upsertSessionByChatId(chatId: string): Promise<ConversationSessionRecord>;
  getLatestCheckpoint(sessionId: string): Promise<ConversationCheckpoint | null>;
  saveCheckpoint(input: Omit<ConversationCheckpoint, "id">): Promise<ConversationCheckpoint>;
  getCatalogSnapshot(): Promise<CatalogSnapshot>;
  upsertOrderForSession(
    input: Omit<ConversationOrderRecord, "createdAt" | "id" | "updatedAt">
  ): Promise<ConversationOrderRecord>;
  /**
   * Updates the status of a session.
   * @param chatId - The chat ID of the session
   * @param status - The new status ('active', 'handed_off', 'paused')
   */
  updateSessionStatus(chatId: string, status: "active" | "handed_off" | "paused"): Promise<void>;
  deleteOrderForSession?(sessionId: string): Promise<void>;
  getActivePaymentConfig(): Promise<ConversationPaymentConfig | null>;
};

export type ComposeResponseInput = {
  chatId: string;
  draftReply: string;
  intent: ConversationIntent;
  messageText: string;
  orderDraft: ConversationOrderDraft | null;
  session: ConversationSessionRecord;
};

export type ComposeResponse = (input: ComposeResponseInput) => Promise<string>;

export type ConversationAssistant = {
  handleIncomingMessage(input: {
    chatId: string;
    text: string;
    tracingEnvironment?: string;
  }): Promise<string>;
  handleIncomingMessageDetailed?(input: {
    chatId: string;
    text: string;
    tracingEnvironment?: string;
  }): Promise<ConversationAssistantResult>;
};

export type ConversationAssistantResult = {
  reply: string;
  traceId?: string;
  observationId?: string;
  tokens: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    estimatedOutputTokens: number;
  };
};

type RequestedAction = "answer_faq" | "show_menu" | "update_order";

type ResolvedOrderLine = {
  rawText: string;
  requestedProduct: string;
  matchedProduct: string;
  quantity: number;
  precioUnitario: number;
  subtotal: number;
};

type InvalidOrderLine = {
  rawText: string;
  requestedProduct: string;
  reason: "product_not_found";
};

type PersistedConversationState = {
  intent: ConversationIntent | null;
  orderDraft: ConversationOrderDraft | null;
  threadId: string | null;
  lastHandledMessage: string | null;
  lastHandledAt: number | null;
  lastResponseText: string | null;
  consecutiveErrorCount: number | null;
};

type ConversationRoute = ConversationIntent | "duplicate" | "handed_off";

const DUPLICATE_MESSAGE_WINDOW_MS = 10_000;
const DELIVERY_FEE_FALLBACK = 1500;
const ERROR_HANDOFF_THRESHOLD = 3;
const consecutiveErrorCounts = new Map<string, number>();

const HANDOFF_RESPONSE =
  "Tu conversacion ha sido transferida a un operador humano. Te responderan a la brevedad. Gracias por tu paciencia.";

const ConversationState = Annotation.Root({
  chatId: Annotation<string>,
  messageText: Annotation<string>,
  session: Annotation<ConversationSessionRecord | null>,
  catalog: Annotation<CatalogSnapshot | null>,
  intent: Annotation<ConversationIntent | null>,
  requestedActions: Annotation<Array<RequestedAction>>,
  wantsMenu: Annotation<boolean>,
  extractedOrderLines: Annotation<Array<ExtractedOrderLine>>,
  validatedOrderLines: Annotation<Array<ResolvedOrderLine>>,
  invalidOrderLines: Annotation<Array<InvalidOrderLine>>,
  orderDraft: Annotation<ConversationOrderDraft | null>,
  isDuplicate: Annotation<boolean>,
  isHandedOff: Annotation<boolean>,
  duplicateResponseText: Annotation<string>,
  lastHandledMessage: Annotation<string | null>,
  lastHandledAt: Annotation<number | null>,
  lastResponseText: Annotation<string>,
  consecutiveErrorCount: Annotation<number>,
  draftReply: Annotation<string>,
  responseText: Annotation<string>,
  threadId: Annotation<string>,
  traceContext: Annotation<ConversationTraceContext | null>,
  suppressReply: Annotation<boolean>,
  // SRS v4: Campos para carrito acumulativo
  cartAction: Annotation<"add" | "remove" | "replace" | "clear" | undefined>,
  previousCart: Annotation<Array<ConversationOrderItem> | undefined>
});

type ConversationGraphState = typeof ConversationState.State;

const DEFAULT_GREETING =
  "¡Hola! Bienvenido a RestauLang. Puedo ayudarte con el menu, horarios o tomar tu pedido.";

export function createConversationAssistant(options: {
  repository: ConversationRepository;
  composeResponse?: ComposeResponse;
  extractOrderRequest?: ExtractOrderRequest;
}): ConversationAssistant {
  const composeResponse = options.composeResponse ?? (async (input) => input.draftReply);
  const extractOrderRequest =
    options.extractOrderRequest ?? createRuleBasedOrderExtractionAgent();
  const executeNode = async <T>(
    state: ConversationGraphState | undefined,
    nodeName: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    if (!state?.traceContext) {
      return fn();
    }

    return createTracedNodeExecutor(state.traceContext).execute(nodeName, fn);
  };

  // Create Convex checkpointer for automatic state persistence
  const checkpointer = new ConvexCheckpointer(options.repository);

  const graph = new StateGraph(ConversationState)
    .addNode("load_session", async (state) =>
      executeNode(state, "load_session", async () =>
        loadSessionNode(options.repository, state)
      )
    )
    .addNode("check_handed_off", async (state) =>
      executeNode(state, "check_handed_off", async () =>
        checkHandedOffNode(state)
      )
    )
    .addNode("analyze_message", async (state) =>
      executeNode(state, "analyze_message", async () =>
        analyzeMessageNode(extractOrderRequest, state)
      )
    )
    .addNode("greeting_handler", async (state) =>
      executeNode(state, "greeting_handler", async () => ({
        draftReply: DEFAULT_GREETING
      }))
    )
    .addNode("faq_handler", async (state) =>
      executeNode(state, "faq_handler", async () => faqHandlerNode(state))
    )
    .addNode("resolve_order_request", async (state) =>
      executeNode(state, "resolve_order_request", async () => resolveOrderRequestNode(state))
    )
    .addNode("order_handler", async (state) =>
      executeNode(state, "order_handler", async () =>
        orderHandlerNode(options.repository, state)
      )
    )
    .addNode("payment_handler", async (state) =>
      executeNode(state, "payment_handler", async () =>
        paymentHandlerNode(options.repository, state)
      )
    )
    .addNode("duplicate_handler", async (state) =>
      executeNode(state, "duplicate_handler", async () => ({
        draftReply: state.duplicateResponseText
      }))
    )
    .addNode("complaint_handler", async (state) =>
      executeNode(state, "complaint_handler", async () =>
        complaintHandlerNode(options.repository, state)
      )
    )
    .addNode("handoff_handler", async (state) =>
      executeNode(state, "handoff_handler", async () => ({
        draftReply: HANDOFF_RESPONSE
      }))
    )
    .addNode("silence_handoff", async (state) =>
      executeNode(state, "silence_handoff", async () => ({
        draftReply: "",
        suppressReply: true
      }))
    )
    .addNode("format_response", async (state) =>
      executeNode(state, "format_response", async () =>
        formatResponseNode(composeResponse, state)
      )
    )
    .addEdge(START, "load_session")
    .addEdge("load_session", "check_handed_off")
    .addConditionalEdges("check_handed_off", routeByHandedOffStatus, {
      handed_off: "silence_handoff",
      continue: "analyze_message"
    })
    .addConditionalEdges("analyze_message", routeByIntent, {
      complaint: "complaint_handler",
      duplicate: "duplicate_handler",
      faq: "faq_handler",
      greeting: "greeting_handler",
      order: "resolve_order_request",
      payment: "payment_handler"
    })
    .addEdge("greeting_handler", "format_response")
    .addEdge("faq_handler", "format_response")
    .addEdge("resolve_order_request", "order_handler")
    .addEdge("order_handler", "format_response")
    .addEdge("payment_handler", "format_response")
    .addEdge("duplicate_handler", "format_response")
    .addEdge("complaint_handler", "handoff_handler")
    .addEdge("handoff_handler", "format_response")
    .addEdge("silence_handoff", "format_response")
    .addEdge("format_response", END)
    .compile({ checkpointer });

  const handleIncomingMessageDetailed = async (
    input: { chatId: string; text: string; tracingEnvironment?: string }
  ): Promise<ConversationAssistantResult> => {
    const traceContext = createConversationTraceContext(
      input.chatId,
      undefined,
      undefined,
      {
        environment: input.tracingEnvironment
      }
    );
    const tracedExecutor = createTracedNodeExecutor(traceContext);
    let traceSucceeded = true;

    setTraceInput(traceContext, {
      chatId: input.chatId,
      message: input.text
    });

    try {
      // Load session BEFORE invoking the graph for proper checkpointer integration
      const session = await executeNode(undefined, "upsert_session", () =>
        options.repository.upsertSessionByChatId(input.chatId)
      );

      const threadId = buildThreadId(input.chatId);
      const graphConfig: RunnableConfig = {
        configurable: {
          thread_id: threadId,
          session_id: session.id  // Pass session_id for checkpointer
        }
      };

      const result = await graph.invoke(
        {
          chatId: input.chatId,
          messageText: input.text,
          session,
          threadId,
          traceContext
        } as unknown as ConversationGraphState,
        graphConfig
      );

      const finalResponse = result.responseText || result.draftReply;

      // Note: Checkpoint is now saved automatically by LangGraph checkpointer
      // We only need to update the order draft if needed (separate table in Convex)
      if (result.orderDraft) {
        const orderDraft = result.orderDraft;

        if (orderDraft.estado === "completo") {
          await executeNode(undefined, "upsert_order", () =>
            options.repository.upsertOrderForSession({
              telefono: orderDraft.telefono,
              items: orderDraft.items,
              direccion: orderDraft.direccion,
              tipoEntrega: orderDraft.tipoEntrega,
              metodoPago: orderDraft.metodoPago,
              nombreCliente: orderDraft.nombreCliente,
              total: orderDraft.total,
              estado: orderDraft.estado,
              montoAbono: orderDraft.montoAbono,
              sessionId: session.id
            })
          );
        } else if (options.repository.deleteOrderForSession) {
          await executeNode(undefined, "delete_order", () =>
            options.repository.deleteOrderForSession!(session.id)
          );
        }
      }

      setTraceOutput(traceContext, {
        reply: finalResponse,
        intent: result.intent,
        isDuplicate: result.isDuplicate
      });

      return {
        reply: finalResponse,
        traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
        observationId: traceContext.rootObservationId,
        tokens: getTraceTokenUsage(traceContext)
      };
    } catch (error) {
      traceSucceeded = false;
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      recordTraceError(traceContext, normalizedError);

      // Graceful degradation: return FAQ-based fallback response instead of throwing
      if (error instanceof CircuitOpenError) {
        logger.warn("Circuit breaker open - returning graceful degradation response", undefined, {
          chatId: input.chatId,
          error: { name: error.name, message: error.message }
        });

        const normalizedText = normalizeText(input.text);
        const fallbackIntent: "complaint" | "faq" | "greeting" = isGreetingMessage(normalizedText)
          ? "greeting"
          : isComplaintMessage(normalizedText)
            ? "complaint"
            : "faq";
        const fallbackResponse = degradationHandler.handleCircuitOpen(
          "convex",
          fallbackIntent,
          input.text
        );

        setTraceOutput(traceContext, {
          reply: fallbackResponse,
          fallbackReason: "circuit_open",
          error: normalizedError.message
        });

        return {
          reply: fallbackResponse,
          traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
          observationId: traceContext.rootObservationId,
          tokens: getTraceTokenUsage(traceContext)
        };
      }

      // For other errors, return a graceful fallback
      logger.error("Conversation assistant error - returning fallback response", undefined, undefined, {
        chatId: input.chatId,
        error: { name: normalizedError.name, message: normalizedError.message }
      });

      const fallbackResponse = degradationHandler.getFallbackResponse("faq", input.text);
      setTraceOutput(traceContext, {
        reply: fallbackResponse,
        fallbackReason: "unexpected_error",
        error: normalizedError.message
      });

      return {
        reply: fallbackResponse,
        traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
        observationId: traceContext.rootObservationId,
        tokens: getTraceTokenUsage(traceContext)
      };
    } finally {
      tracedExecutor.end(traceSucceeded);
    }
  };

  return {
    async handleIncomingMessage(input) {
      const result = await handleIncomingMessageDetailed(input);
      return result.reply;
    },
    handleIncomingMessageDetailed
  };
}

function routeByIntent(state: ConversationGraphState): ConversationRoute {
  if (state.isDuplicate) {
    return "duplicate";
  }

  return state.intent ?? "faq";
}

function routeByHandedOffStatus(
  state: ConversationGraphState
): "handed_off" | "continue" {
  if (state.isHandedOff) {
    return "handed_off";
  }

  return "continue";
}

function checkHandedOffNode(state: ConversationGraphState) {
  const session = requireSession(state.session);
  const isFallbackHandedOff = isFallbackSessionHandedOff(state.chatId);

  if (session.status === "handed_off" || isFallbackHandedOff) {
    logger.info("Session is handed_off, ignoring message", undefined, {
      sessionId: session.id,
      chatId: state.chatId,
      source: session.status === "handed_off" ? "convex" : "fallback"
    });

    return {
      isHandedOff: true
    };
  }

  return {
    isHandedOff: false
  };
}

async function complaintHandlerNode(
  repository: ConversationRepository,
  state: ConversationGraphState
) {
  const session = requireSession(state.session);
  setFallbackSessionStatus(state.chatId, "handed_off");

  try {
    // Update session status to handed_off in Convex.
    await repository.updateSessionStatus(state.chatId, "handed_off");
  } catch (error) {
    logger.error(
      "Failed to persist handed_off status, continuing with human handoff response",
      undefined,
      error instanceof Error ? error : new Error(String(error)),
      { sessionId: session.id, chatId: state.chatId }
    );
  }

  logger.info("Session handed off for human intervention", undefined, {
    sessionId: session.id
  });

  return {
    draftReply:
      "Entendido. Te voy a transferir con un operador humano que pueda ayudarte mejor. Un momento por favor."
  };
}

async function loadSessionNode(
  repository: ConversationRepository,
  state: ConversationGraphState
) {
  const session = await repository.upsertSessionByChatId(state.chatId);
  const [catalog, latestCheckpoint] = await Promise.all([
    repository.getCatalogSnapshot(),
    repository.getLatestCheckpoint(session.id)
  ]);
  const persistedState = parsePersistedConversationState(latestCheckpoint);

  return {
    catalog,
    consecutiveErrorCount: persistedState.consecutiveErrorCount ?? 0,
    lastHandledAt: persistedState.lastHandledAt,
    lastHandledMessage: persistedState.lastHandledMessage,
    lastResponseText: persistedState.lastResponseText ?? "",
    orderDraft: persistedState.orderDraft,
    session,
    suppressReply: false,
    threadId: persistedState.threadId ?? latestCheckpoint?.threadId ?? buildThreadId(state.chatId)
  };
}

async function analyzeMessageNode(
  extractOrderRequest: ExtractOrderRequest,
  state: ConversationGraphState
) {
  const normalizedText = normalizeText(state.messageText);
  const paymentIntent = detectPaymentIntent(state.messageText);

  if (isDuplicateMessage(state, normalizedText)) {
    return {
      duplicateResponseText: state.lastResponseText,
      extractedOrderLines: [],
      intent: state.intent ?? ("faq" as const),
      invalidOrderLines: [],
      isDuplicate: true,
      requestedActions: [],
      validatedOrderLines: [],
      wantsMenu: false
    };
  }

  if (isComplaintMessage(normalizedText)) {
    return {
      duplicateResponseText: "",
      extractedOrderLines: [],
      intent: "complaint" as const,
      invalidOrderLines: [],
      isDuplicate: false,
      requestedActions: [],
      validatedOrderLines: [],
      wantsMenu: false
    };
  }

  if (isGreetingMessage(normalizedText)) {
    return {
      duplicateResponseText: "",
      extractedOrderLines: [],
      intent: "greeting" as const,
      invalidOrderLines: [],
      isDuplicate: false,
      requestedActions: [],
      validatedOrderLines: [],
      wantsMenu: false
    };
  }

  const catalog = requireCatalog(state.catalog);
  const extraction = await extractOrderRequest({
    catalog,
    messageText: state.messageText,
    orderDraft: state.orderDraft
  });
  const cartAction = detectCartAction(normalizedText);
  const cancellation = detectOrderCancellation(normalizedText);
  const extractedOrderLines = isDetailOnlyOrderMessage(normalizedText, state.orderDraft)
    ? []
    : extraction.orderLines;
  const shouldUpdateOrder =
    extractedOrderLines.length > 0 ||
    isOrderFollowUpMessage(normalizedText, state.orderDraft) ||
    cancellation.isCancellation ||
    (cartAction === "clear" && Boolean(state.orderDraft));
  const faqMatch = findFaqMatch(catalog.faq, normalizedText);
  const shouldForceFaqRoute =
    Boolean(faqMatch) &&
    !shouldUpdateOrder &&
    !isMenuRequest(normalizedText);

  if (shouldForceFaqRoute) {
    return {
      duplicateResponseText: "",
      extractedOrderLines: [],
      intent: "faq" as const,
      invalidOrderLines: [],
      isDuplicate: false,
      requestedActions: ["answer_faq"],
      validatedOrderLines: [],
      wantsMenu: false
    };
  }

  const shouldPrioritizePayment = shouldRouteToPaymentHandler({
    extractedOrderLines,
    normalizedText,
    orderDraft: state.orderDraft,
    paymentIntent
  });

  return {
    duplicateResponseText: "",
    extractedOrderLines,
    isDuplicate: false,
    intent: shouldPrioritizePayment
      ? ("payment" as const)
      : shouldUpdateOrder
      ? ("order" as const)
      : paymentIntent
        ? ("payment" as const)
        : ("faq" as const),
    invalidOrderLines: [],
    requestedActions: buildRequestedActions(extraction.wantsMenu, shouldUpdateOrder),
    validatedOrderLines: [],
    wantsMenu: extraction.wantsMenu
  };
}

function buildRequestedActions(
  wantsMenu: boolean,
  shouldUpdateOrder: boolean
): Array<RequestedAction> {
  const actions: Array<RequestedAction> = [];

  if (wantsMenu) {
    actions.push("show_menu");
  }

  if (shouldUpdateOrder) {
    actions.push("update_order");
  }

  if (actions.length === 0) {
    actions.push("answer_faq");
  }

  return actions;
}

function faqHandlerNode(state: ConversationGraphState) {
  const catalog = requireCatalog(state.catalog);
  const normalizedText = normalizeText(state.messageText);
  const faqMatch = findFaqMatch(catalog.faq, normalizedText);
  const hasActiveOrder = Boolean(state.orderDraft?.items.length);
  const topicSwitchPrompt = hasActiveOrder ? buildTopicSwitchPrompt(state.orderDraft) : null;

  if (faqMatch && (state.wantsMenu || isMenuRequest(normalizedText))) {
    const availableMenu = catalog.menu.filter((item) => item.disponible);
    const menuSummary = availableMenu
      .map((item) => `${item.item} ($${item.precio})`)
      .join(", ");
    const combinedReply = menuSummary
      ? `${faqMatch.respuesta} Menu disponible: ${menuSummary}.`
      : faqMatch.respuesta;

    return {
      draftReply: topicSwitchPrompt
        ? `${topicSwitchPrompt} ${combinedReply}`.trim()
        : combinedReply
    };
  }

  if (state.wantsMenu || isMenuRequest(normalizedText)) {
    const availableMenu = catalog.menu.filter((item) => item.disponible);

    if (availableMenu.length === 0) {
      return {
        draftReply:
          "Todavia no tengo items cargados en el menu. Si queres, puedo registrar tu pedido manualmente."
      };
    }

    const menuSummary = availableMenu
      .map((item) => `${item.item} ($${item.precio})`)
      .join(", ");

    return {
      draftReply: topicSwitchPrompt
        ? `${topicSwitchPrompt} Hoy tenemos: ${menuSummary}. Si queres, puedo ayudarte a armar tu pedido.`
        : `Hoy tenemos: ${menuSummary}. Si queres, puedo ayudarte a armar tu pedido.`
    };
  }

  return {
    draftReply:
      faqMatch
        ? topicSwitchPrompt
          ? `${topicSwitchPrompt} ${faqMatch.respuesta}`.trim()
          : faqMatch.respuesta
        : "No encontre ese dato en la base actual. Si queres, puedo mostrarte el menu o tomar tu pedido."
  };
}

function resolveOrderRequestNode(state: ConversationGraphState) {
  const catalog = requireCatalog(state.catalog);
  const validatedOrderLines: Array<ResolvedOrderLine> = [];
  const invalidOrderLines: Array<InvalidOrderLine> = [];

  for (const orderLine of state.extractedOrderLines) {
    const price = findMatchingPriceEntry(
      catalog.prices,
      normalizeProductKey(orderLine.productText)
    );

    if (!price) {
      invalidOrderLines.push({
        rawText: orderLine.rawText,
        reason: "product_not_found",
        requestedProduct: orderLine.productText
      });
      continue;
    }

    validatedOrderLines.push({
      rawText: orderLine.rawText,
      requestedProduct: orderLine.productText,
      matchedProduct: price.producto,
      quantity: orderLine.quantity,
      precioUnitario: price.precioUnitario,
      subtotal: calculateLineSubtotal(orderLine.quantity, price.precioUnitario)
    });
  }

  return {
    invalidOrderLines,
    validatedOrderLines
  };
}

async function orderHandlerNode(
  repository: ConversationRepository,
  state: ConversationGraphState
) {
  const catalog = requireCatalog(state.catalog);
  const session = requireSession(state.session);
  const orderDraft = cloneOrderDraft(state.orderDraft, state.chatId);
  const normalizedText = normalizeText(state.messageText);
  const cartAction = detectCartAction(normalizedText);
  const cancellation = detectOrderCancellation(normalizedText);
  const hasIncomingLines = state.extractedOrderLines.length > 0;
  const previousCart = orderDraft.items.map((item) => ({ ...item }));
  const suggestedProducts = catalog.menu
    .filter((item) => item.disponible)
    .map((item) => item.item)
    .slice(0, 3);

  if (cancellation.isCancellation || cartAction === "clear") {
    if (orderDraft.items.length === 0) {
      return maybeEscalateForRepeatedErrors(repository, state, {
        cartAction: "clear" as const,
        draftReply: "No tenes un pedido activo para cancelar. ¿Queres empezar uno nuevo?",
        errorDetected: true,
        orderDraft,
        previousCart
      });
    }

    orderDraft.items = [];
    orderDraft.total = 0;
    orderDraft.estado = "incompleto";
    orderDraft.direccion = null;
    orderDraft.tipoEntrega = null;
    orderDraft.metodoPago = null;
    orderDraft.nombreCliente = null;
    orderDraft.montoAbono = null;

    return {
      cartAction: "clear" as const,
      consecutiveErrorCount: 0,
      draftReply: "Tu pedido fue cancelado. ¿Queres comenzar de nuevo?",
      orderDraft,
      previousCart
    };
  }

  if (state.validatedOrderLines.length > 0) {
    const actionScopedOrderLines = scopeValidatedOrderLinesForCartAction({
      cartAction,
      catalog,
      normalizedText,
      validatedOrderLines: state.validatedOrderLines
    });
    const validation = validateCartActionForState(cartAction, orderDraft.items);
    if (!validation.valid && cartAction !== "add" && cartAction !== "replace") {
      return maybeEscalateForRepeatedErrors(repository, state, {
        cartAction,
        draftReply: validation.reason ?? "No pude aplicar esa accion sobre el carrito.",
        errorDetected: true,
        orderDraft,
        previousCart
      });
    }

    const incomingItems: Array<ConversationOrderItem> = actionScopedOrderLines.map((line) => ({
      cantidad: line.quantity,
      precioUnitario: line.precioUnitario,
      producto: line.matchedProduct
    }));

    orderDraft.items = applyCartAction(
      orderDraft.items,
      incomingItems,
      cartAction
    ) as Array<ConversationOrderItem>;
  }

  if (!hasIncomingLines && orderDraft.items.length === 0) {
    return maybeEscalateForRepeatedErrors(repository, state, {
      cartAction,
      draftReply: "Decime que producto queres pedir y lo preparo.",
      errorDetected: true,
      orderDraft,
      previousCart
    });
  }

  if (orderDraft.items.length === 0 && state.invalidOrderLines.length > 0) {
    orderDraft.estado = "error_producto";
    const draftReply = buildOrderReply({
      cartAction,
      invalidOrderLines: state.invalidOrderLines,
      orderDraft,
      suggestedProducts,
      validatedOrderLines: []
    });

    return maybeEscalateForRepeatedErrors(repository, state, {
      draftReply,
      errorDetected: true,
      orderDraft,
      previousCart
    });
  }

  if (orderDraft.items.length > 0) {
    updateOrderDraftWithMessage(orderDraft, normalizedText);
    recalculateOrderTool(orderDraft, catalog);
    orderDraft.estado = determineOrderStatus(orderDraft);

    if (
      !hasIncomingLines &&
      state.invalidOrderLines.length === 0 &&
      isOrderTotalInquiry(normalizedText)
    ) {
      return {
        draftReply: buildOrderTotalReply(orderDraft),
        consecutiveErrorCount: 0,
        orderDraft,
        previousCart
      };
    }
  }

  const draftReply = buildOrderReply({
    cartAction,
    invalidOrderLines: state.invalidOrderLines,
    orderDraft,
    suggestedProducts,
    validatedOrderLines: scopeValidatedOrderLinesForCartAction({
      cartAction,
      catalog,
      normalizedText,
      validatedOrderLines: state.validatedOrderLines
    })
  });

  return maybeEscalateForRepeatedErrors(repository, state, {
    draftReply,
    errorDetected: shouldCountConversationError({
      draftReply,
      invalidOrderLines: state.invalidOrderLines,
      orderDraft
    }),
    orderDraft,
    previousCart
  });
}

async function paymentHandlerNode(
  repository: ConversationRepository,
  state: ConversationGraphState
) {
  const paymentIntent = detectPaymentIntent(state.messageText);
  const orderDraft = state.orderDraft
    ? cloneOrderDraft(state.orderDraft, state.chatId)
    : null;
  const hasActiveOrder = Boolean(orderDraft && orderDraft.items.length > 0);
  const normalizedMessage = normalizeText(state.messageText);

  if (
    !hasActiveOrder &&
    (paymentIntent === null ||
      paymentIntent === "payment_methods" ||
      paymentIntent === "payment_question")
  ) {
    const catalog = requireCatalog(state.catalog);
    const faqMatch = findFaqMatch(catalog.faq, normalizedMessage);

    if (faqMatch) {
      return {
        consecutiveErrorCount: 0,
        draftReply: faqMatch.respuesta
      };
    }
  }

  const paymentConfig = repository.getActivePaymentConfig
    ? await repository.getActivePaymentConfig()
    : null;

  if (!paymentIntent) {
    return {
      consecutiveErrorCount: 0,
      draftReply: paymentConfig
        ? generatePaymentMethodsResponse(paymentConfig)
        : "Aceptamos solo efectivo. Si queres, te calculo el vuelto."
    };
  }

  if (paymentIntent === "payment_methods" || paymentIntent === "payment_question") {
    if (
      orderDraft &&
      orderDraft.items.length > 0 &&
      orderDraft.metodoPago === "efectivo" &&
      orderDraft.montoAbono === null
    ) {
      return {
        consecutiveErrorCount: 0,
        draftReply: `El total de tu pedido es $${orderDraft.total}. ¿Con cuanto vas a pagar?`
      };
    }

    return {
      consecutiveErrorCount: 0,
      draftReply: paymentConfig
        ? generatePaymentMethodsResponse(paymentConfig)
        : "Aceptamos solo efectivo. Si queres, te calculo el vuelto."
    };
  }

  if (!orderDraft || orderDraft.items.length === 0) {
    return maybeEscalateForRepeatedErrors(repository, state, {
      draftReply: "Necesito un pedido activo para continuar con el pago. ¿Querés hacer un pedido?",
      errorDetected: true
    });
  }

  if (paymentIntent === "payment_amount") {
    const paymentAmount = extractPaymentAmountFromPaymentHandler(state.messageText);

    if (paymentAmount === null) {
      return maybeEscalateForRepeatedErrors(repository, state, {
        draftReply: "No pude identificar el monto. Decime con cuanto vas a pagar y lo calculo.",
        errorDetected: true,
        orderDraft
      });
    }

    if (paymentAmount < orderDraft.total) {
      return maybeEscalateForRepeatedErrors(repository, state, {
        draftReply: generateInsufficientAmountResponse(orderDraft.total, paymentAmount),
        errorDetected: true,
        orderDraft
      });
    }

    if (!orderDraft.metodoPago) {
      orderDraft.metodoPago = "efectivo";
    }

    orderDraft.montoAbono = paymentAmount;
    orderDraft.estado = determineOrderStatus(orderDraft);
    return {
      consecutiveErrorCount: 0,
      draftReply: buildPaymentAmountReply(orderDraft, paymentAmount),
      orderDraft
    };
  }

  if (orderDraft.estado !== "completo") {
    return {
      consecutiveErrorCount: 0,
      draftReply: buildOrderFollowUp(orderDraft),
      orderDraft
    };
  }

  return {
    consecutiveErrorCount: 0,
    draftReply: generateOrderConfirmationPayment(orderDraft, paymentConfig ?? undefined),
    orderDraft
  };
}

async function formatResponseNode(
  composeResponse: ComposeResponse,
  state: ConversationGraphState
) {
  const session = requireSession(state.session);
  const intent = state.intent ?? "faq";
  const isDirectFaqResponse =
    intent === "faq" &&
    state.requestedActions.includes("answer_faq") &&
    !state.wantsMenu;
  const normalizedMessage = normalizeText(state.messageText);
  const buildResponseUpdate = (responseText: string) => {
    const sanitizedResponse = sanitizeAssistantResponse(responseText);
    return {
      lastHandledAt: Date.now(),
      lastHandledMessage: normalizedMessage,
      lastResponseText: sanitizedResponse,
      responseText: sanitizedResponse
    };
  };

  if (state.suppressReply) {
    return buildResponseUpdate("");
  }

  if (
    state.isDuplicate ||
    intent === "order" ||
    intent === "payment" ||
    intent === "complaint" ||
    isDirectFaqResponse
  ) {
    return buildResponseUpdate(state.draftReply);
  }

  const responseText = await composeResponse({
    chatId: state.chatId,
    draftReply: state.draftReply,
    intent,
    messageText: state.messageText,
    orderDraft: state.orderDraft,
    session
  });

  return buildResponseUpdate(responseText.trim() || state.draftReply);
}

function buildOrderReply(input: {
  cartAction: CartAction;
  validatedOrderLines: Array<ResolvedOrderLine>;
  invalidOrderLines: Array<InvalidOrderLine>;
  orderDraft: ConversationOrderDraft;
  suggestedProducts: Array<string>;
}): string {
  const segments: Array<string> = [];

  if (
    input.cartAction === "remove" &&
    input.validatedOrderLines.length > 0 &&
    input.invalidOrderLines.length === 0
  ) {
    const removedItems = input.validatedOrderLines
      .map((line) => `${line.quantity} ${line.matchedProduct}`)
      .join(", ");
    const totalSummary =
      input.orderDraft.items.length > 0
        ? ` Total parcial: $${input.orderDraft.total}.`
        : "";
    segments.push(`Quitado: ${removedItems}.${totalSummary}`);
  } else if (
    input.cartAction === "replace" &&
    input.validatedOrderLines.length > 0 &&
    input.invalidOrderLines.length === 0
  ) {
    const replacedItems = input.validatedOrderLines
      .map((line) => `${line.quantity} ${line.matchedProduct} ($${line.subtotal})`)
      .join(", ");
    segments.push(`Actualizado: ${replacedItems}. Total parcial: $${input.orderDraft.total}.`);
  } else if (input.validatedOrderLines.length === 1 && input.invalidOrderLines.length === 0) {
    const line = input.validatedOrderLines[0];
    const updatedItem = input.orderDraft.items.find(
      (item) => item.producto === line.matchedProduct
    );
    const shouldShowAccumulatedTotal =
      input.orderDraft.items.length > 1 ||
      (updatedItem?.cantidad ?? line.quantity) > line.quantity;

    if (shouldShowAccumulatedTotal) {
      const accumulatedQuantity = updatedItem?.cantidad ?? line.quantity;
      const isIncrementOnExistingItem = accumulatedQuantity > line.quantity;

      if (isIncrementOnExistingItem) {
        segments.push(
          `Anotado: +${line.quantity} ${line.matchedProduct}. Ahora llevas ${accumulatedQuantity} ${line.matchedProduct}. Total parcial: $${input.orderDraft.total}.`
        );
      } else {
        segments.push(
          `Anotado: ${line.quantity} ${line.matchedProduct} ($${line.subtotal}). Total parcial: $${input.orderDraft.total}.`
        );
      }
    } else {
      segments.push(
        `Anotado: ${line.quantity} ${line.requestedProduct} ($${line.precioUnitario} c/u = $${line.subtotal}).`
      );
    }
  } else if (input.validatedOrderLines.length === 1) {
    const line = input.validatedOrderLines[0];

    segments.push(`Anotado: ${line.quantity} ${line.matchedProduct} ($${line.subtotal}).`);
  } else if (input.validatedOrderLines.length > 1) {
    const addedItems = input.validatedOrderLines
      .map((line) => `${line.quantity} ${line.matchedProduct} ($${line.subtotal})`)
      .join(", ");

    segments.push(`Anotado: ${addedItems}. Total parcial: $${input.orderDraft.total}.`);
  }

  if (input.invalidOrderLines.length > 0) {
    const missingItems = input.invalidOrderLines
      .map((line) => line.requestedProduct)
      .join(", ");
    const shouldAskVariantAndQuantity =
      input.orderDraft.items.length === 0 &&
      input.invalidOrderLines.some((line) =>
        includesAny(normalizeText(line.requestedProduct), ["hamburguesa", "burger"])
      );

    if (
      shouldAskVariantAndQuantity &&
      input.suggestedProducts.length > 0
    ) {
      segments.push(
        `No pude identificar: ${missingItems}. Decime cual hamburguesa queres y cuantas unidades de cada una. Opciones disponibles: ${input.suggestedProducts.join(", ")}.`
      );
    } else if (input.orderDraft.items.length === 0 && input.suggestedProducts.length > 0) {
      segments.push(
        `No pude identificar: ${missingItems}. Decime a que producto te referis y lo sumo. Opciones disponibles: ${input.suggestedProducts.join(", ")}.`
      );
    } else {
      segments.push(
        `No pude identificar: ${missingItems}. Decime a que producto te referis y lo sumo.`
      );
    }
  }

  if (input.orderDraft.items.length === 0) {
    return (
      segments.join(" ").trim() ||
      "No encontre ese producto en la lista de precios. Decime otro item del menu y lo reviso."
    );
  }

  segments.push(buildOrderFollowUp(input.orderDraft));

  return segments.join(" ").trim();
}

function sanitizeAssistantResponse(responseText: string): string {
  const trimmed = responseText.trim();

  if (!trimmed) {
    return trimmed;
  }

  return trimmed
    .replace(/^¡?\s*che[,!.\s]*/iu, "")
    .trim();
}

function buildPaymentAmountReply(
  orderDraft: ConversationOrderDraft,
  paymentAmount: number
): string {
  if (orderDraft.estado === "completo") {
    return buildOrderFollowUp(orderDraft);
  }

  const change = paymentAmount - orderDraft.total;
  const paymentSummary =
    change === 0
      ? `Perfecto. El total es $${orderDraft.total} y abonas con el monto exacto.`
      : `Perfecto. El total es $${orderDraft.total}. Pagando $${paymentAmount}, tu vuelto sera $${change}.`;

  return `${paymentSummary} ${buildOrderFollowUp(orderDraft)}`;
}

function buildTopicSwitchPrompt(orderDraft: ConversationOrderDraft | null): string {
  if (!orderDraft || orderDraft.items.length === 0) {
    return "";
  }

  return "Tengo tu pedido en curso. Si prefieres cambiar de tema, luego retomamos el pedido.";
}

function parsePersistedConversationState(
  checkpoint: ConversationCheckpoint | null
): PersistedConversationState {
  if (!checkpoint) {
    return {
      consecutiveErrorCount: 0,
      intent: null,
      lastHandledAt: null,
      lastHandledMessage: null,
      lastResponseText: null,
      orderDraft: null,
      threadId: null
    };
  }

  try {
    const parsed = JSON.parse(checkpoint.checkpoint) as Partial<PersistedConversationState>;

    return {
      consecutiveErrorCount:
        typeof parsed.consecutiveErrorCount === "number"
          ? parsed.consecutiveErrorCount
          : 0,
      intent: isConversationIntent(parsed.intent) ? parsed.intent : null,
      lastHandledAt:
        typeof parsed.lastHandledAt === "number" ? parsed.lastHandledAt : null,
      lastHandledMessage:
        typeof parsed.lastHandledMessage === "string"
          ? parsed.lastHandledMessage
          : null,
      lastResponseText:
        typeof parsed.lastResponseText === "string" ? parsed.lastResponseText : null,
      orderDraft: isConversationOrderDraft(parsed.orderDraft) ? parsed.orderDraft : null,
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : null
    };
  } catch (error) {
    // ERR-2: Log JSON parse failure instead of silently swallowing the error
    logger.error("Failed to parse conversation checkpoint JSON - data may be corrupted", undefined, undefined, {
      threadId: checkpoint.threadId,
      sessionId: checkpoint.sessionId,
      error: error instanceof Error
        ? { name: error.name, message: error.message }
        : { name: "UnknownError", message: String(error) },
      checkpointLength: checkpoint.checkpoint.length
    });
    return {
      consecutiveErrorCount: 0,
      intent: null,
      lastHandledAt: null,
      lastHandledMessage: null,
      lastResponseText: null,
      orderDraft: null,
      threadId: checkpoint.threadId
    };
  }
}

function isDuplicateMessage(
  state: ConversationGraphState,
  normalizedText: string
): boolean {
  if (
    !normalizedText ||
    !state.lastHandledMessage ||
    !state.lastHandledAt ||
    !state.lastResponseText
  ) {
    return false;
  }

  return (
    state.lastHandledMessage === normalizedText &&
    Date.now() - state.lastHandledAt <= DUPLICATE_MESSAGE_WINDOW_MS
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function includesAny(input: string, words: Array<string>): boolean {
  return words.some((word) => input.includes(word));
}

const DIRECT_HANDOFF_KEYWORDS = [
  "humano",
  "persona",
  "operador",
  "supervisor",
  "gerente",
  "encargado",
  "responsable"
];

const COMPLAINT_KEYWORDS = [
  "queja",
  "reclamo",
  "denuncia",
  "problema grave",
  "mal servicio",
  "mala atencion"
];

const ORDER_CONTEXT_KEYWORDS = ["pedido", "orden", "comida", "delivery", "envio"];
const ORDER_ISSUE_KEYWORDS = [
  "llego mal",
  "vino mal",
  "llego frio",
  "vino frio",
  "incompleto",
  "faltan",
  "falta",
  "demora",
  "tardo",
  "tarde"
];

const NEGATIVE_SENTIMENT_KEYWORDS = [
  "enojado",
  "enojada",
  "molesto",
  "molesta",
  "furioso",
  "furiosa",
  "indignado",
  "indignada",
  "harto",
  "harta",
  "pesimo",
  "decepcionado",
  "decepcionada"
];

const FRUSTRATION_PATTERNS = [
  "no me respondes bien",
  "no me respondes",
  "no me ayudas",
  "ya te pregunte",
  "te pregunte 3 veces"
];

const INSULT_KEYWORDS = [
  "idiota",
  "estupido",
  "inutil",
  "pelotudo",
  "pelotuda",
  "boludo",
  "boluda",
  "forro",
  "mierda",
  "hijo de puta",
  "hija de puta",
  "hdp"
];

const OUT_OF_SCOPE_HUMAN_HANDOFF_KEYWORDS = [
  "fuera de lo establecido",
  "fuera de tema",
  "otro tema",
  "nada que ver con comida",
  "consulta legal",
  "defensa del consumidor",
  "demanda",
  "abogado",
  "fiscalia",
  "denuncia formal"
];

function isComplaintMessage(normalizedText: string): boolean {
  if (!normalizedText) {
    return false;
  }

  if (includesAny(normalizedText, DIRECT_HANDOFF_KEYWORDS)) {
    return true;
  }

  if (includesAny(normalizedText, COMPLAINT_KEYWORDS)) {
    return true;
  }

  const hasOrderContext = includesAny(normalizedText, ORDER_CONTEXT_KEYWORDS);
  const hasOrderIssue = includesAny(normalizedText, ORDER_ISSUE_KEYWORDS);

  if (hasOrderContext && hasOrderIssue) {
    return true;
  }

  if (includesAny(normalizedText, NEGATIVE_SENTIMENT_KEYWORDS)) {
    return true;
  }

  if (includesAny(normalizedText, FRUSTRATION_PATTERNS)) {
    return true;
  }

  if (includesAny(normalizedText, INSULT_KEYWORDS)) {
    return true;
  }

  return includesAny(normalizedText, OUT_OF_SCOPE_HUMAN_HANDOFF_KEYWORDS);
}

function isGreetingMessage(normalizedText: string): boolean {
  return includesAny(normalizedText, ["hola", "buenas", "buen dia", "buenas tardes"]);
}

function isOrderFollowUpMessage(
  normalizedText: string,
  orderDraft: ConversationOrderDraft | null
): boolean {
  if (!orderDraft) {
    return false;
  }

  if (detectCartAction(normalizedText) !== "add") {
    return true;
  }

  if (
    includesAny(normalizedText, [
      "delivery",
      "envio",
      "retiro",
      "retirar",
      "pickup",
      "paso a buscar",
      "efectivo",
      "tarjeta",
      "transferencia",
      "mercado pago",
      "mercadopago",
      "alias",
      "me llamo",
      "soy",
      "con",
      "pago",
      "tengo",
      "abono"
    ])
  ) {
    return true;
  }

  if (isOrderTotalInquiry(normalizedText)) {
    return true;
  }

  if (!orderDraft.nombreCliente && looksLikeNameOnlyMessage(normalizedText)) {
    return true;
  }

  // Recognize payment amount messages when waiting for montoAbono
  if (
    orderDraft.metodoPago === "efectivo" &&
    orderDraft.montoAbono === null &&
    /^\d+(?:\.\d+)?$/.test(normalizedText)
  ) {
    return true;
  }

  return Boolean(/\d/.test(normalizedText) && orderDraft.tipoEntrega === "delivery");
}

function isOrderTotalInquiry(normalizedText: string): boolean {
  return includesAny(normalizedText, [
    "cuanto es",
    "cuanto sale",
    "cuanto cuesta",
    "total"
  ]);
}

function isDetailOnlyOrderMessage(
  normalizedText: string,
  orderDraft: ConversationOrderDraft | null
): boolean {
  if (!orderDraft) {
    return false;
  }

  if (detectCartAction(normalizedText) !== "add") {
    return false;
  }

  if (looksLikeExplicitItemAddMessage(normalizedText)) {
    return false;
  }

  return isOrderFollowUpMessage(normalizedText, orderDraft);
}

function looksLikeExplicitItemAddMessage(normalizedText: string): boolean {
  return includesAny(normalizedText, [
    "quiero",
    "quisiera",
    "pedido",
    "pedir",
    "agrega",
    "agregame",
    "suma",
    "sumame",
    "mandame",
    "manda",
    "traeme",
    "trae",
    "dame",
    "poneme"
  ]);
}

function singularizeWord(value: string): string {
  if (value.endsWith("es")) {
    return value.slice(0, -2);
  }

  if (value.endsWith("s")) {
    return value.slice(0, -1);
  }

  return value;
}

function isMenuRequest(normalizedText: string): boolean {
  return includesAny(normalizedText, [
    "menu",
    "carta",
    "que tienen",
    "que venden",
    "recomend",
    "suger"
  ]);
}

function normalizeProductKey(value: string): string {
  return normalizeText(value)
    .split(/\s+/u)
    .filter(Boolean)
    .map((token) => singularizeWord(token))
    .join(" ");
}

function findFaqMatch(
  entries: Array<CatalogFaqRecord>,
  normalizedText: string
): CatalogFaqRecord | null {
  const normalizedQuery = normalizeFaqMatchText(normalizedText);

  if (!normalizedQuery) {
    return null;
  }

  for (const entry of entries) {
    const terms = buildFaqTerms(entry)
      .map((term) => normalizeFaqMatchText(term))
      .filter(Boolean);

    if (
      terms.some(
        (term) =>
          containsWholePhrase(normalizedQuery, term) ||
          containsWholePhrase(term, normalizedQuery)
      )
    ) {
      return entry;
    }
  }

  return null;
}

function buildFaqTerms(entry: CatalogFaqRecord): Array<string> {
  const normalizedTopic = normalizeText(entry.tema);
  const normalizedQuestion = normalizeText(entry.pregunta);
  const questionTerms = normalizedQuestion
    .split(/[,.!?;:]/u)
    .map((term) => term.trim())
    .filter(Boolean);
  const uniqueTerms = new Set<string>();

  if (normalizedTopic) {
    uniqueTerms.add(normalizedTopic);
  }

  if (normalizedQuestion) {
    uniqueTerms.add(normalizedQuestion);
  }

  for (const term of questionTerms) {
    uniqueTerms.add(term);
  }

  return Array.from(uniqueTerms);
}

function normalizeFaqMatchText(value: string): string {
  return normalizeText(value)
    .replace(/[^a-z0-9\s]/gu, " ")
    .replace(/\bpagar\b/gu, "pago")
    .replace(/\bpagos\b/gu, "pago")
    .replace(/\s+/gu, " ")
    .split(" ")
    .filter(Boolean)
    .map((token) => singularizeWord(token))
    .join(" ")
    .trim();
}

function extractDeliveryFeeFromCatalog(catalog: CatalogSnapshot | null): number {
  if (!catalog) {
    return DELIVERY_FEE_FALLBACK;
  }

  const deliveryEntry = catalog.faq.find((entry) =>
    includesAny(normalizeText(`${entry.tema} ${entry.pregunta}`), ["delivery", "envio", "envíos"])
  );

  if (!deliveryEntry) {
    return DELIVERY_FEE_FALLBACK;
  }

  const responseText = deliveryEntry.respuesta;
  const amountMatch = responseText.match(/\$\s*([\d.]+)/u);

  if (!amountMatch?.[1]) {
    return DELIVERY_FEE_FALLBACK;
  }

  const numericAmount = Number.parseInt(amountMatch[1].replace(/\./gu, ""), 10);

  return Number.isFinite(numericAmount) ? numericAmount : DELIVERY_FEE_FALLBACK;
}

function shouldRouteToPaymentHandler(input: {
  normalizedText: string;
  paymentIntent: ReturnType<typeof detectPaymentIntent>;
  orderDraft: ConversationOrderDraft | null;
  extractedOrderLines: Array<ExtractedOrderLine>;
}): boolean {
  const { extractedOrderLines, normalizedText, orderDraft, paymentIntent } = input;

  if (!orderDraft || orderDraft.items.length === 0 || !paymentIntent) {
    return false;
  }

  if (
    paymentIntent === "payment_confirmation" ||
    isPaymentMethodsQuestion(normalizedText)
  ) {
    return true;
  }

  if (extractPaymentAmountFromPaymentHandler(normalizedText) !== null) {
    return true;
  }

  if (isOrderTotalInquiry(normalizedText)) {
    return false;
  }

  if (extractedOrderLines.length > 0) {
    return false;
  }

  if (isSpecificPaymentMethodSelection(normalizedText)) {
    return false;
  }

  return paymentIntent === "payment_question";
}

function isPaymentMethodsQuestion(normalizedText: string): boolean {
  return includesAny(normalizedText, [
    "como puedo pagar",
    "como pago",
    "formas de pago",
    "metodos de pago",
    "metodo de pago",
    "medios de pago",
    "que aceptan",
    "qué aceptan",
    "aceptan mercado pago",
    "aceptan transferencia",
    "aceptan tarjeta",
    "aceptan efectivo"
  ]);
}

function isSpecificPaymentMethodSelection(normalizedText: string): boolean {
  return (
    includesAny(normalizedText, [
      "efectivo",
      "transferencia",
      "mercado pago",
      "mercadopago",
      "tarjeta",
      "alias"
    ]) &&
    !isPaymentMethodsQuestion(normalizedText)
  );
}

function findMatchingPriceEntry(
  entries: Array<CatalogPriceRecord>,
  lookupKey: string
): CatalogPriceRecord | null {
  const exactMatch = findPriceEntryByKeys(entries, (candidateKey) => candidateKey === lookupKey);

  if (exactMatch) {
    return exactMatch.entry;
  }

  const userContainsCandidate = findPriceEntryByKeys(entries, (candidateKey) =>
    containsWholePhrase(lookupKey, candidateKey)
  );

  if (userContainsCandidate) {
    return userContainsCandidate.entry;
  }

  const candidateContainsUser = findPriceEntryByKeys(entries, (candidateKey) =>
    containsWholePhrase(candidateKey, lookupKey)
  );

  return candidateContainsUser?.entry ?? null;
}

function findPriceEntryByKeys(
  entries: Array<CatalogPriceRecord>,
  matcher: (candidateKey: string) => boolean
): {
  entry: CatalogPriceRecord;
  key: string;
} | null {
  const candidates = entries.flatMap((entry) =>
    buildPriceLookupKeys(entry).map((key) => ({
      entry,
      key
    }))
  );
  const matches = candidates
    .filter(({ key }) => matcher(key))
    .sort((left, right) => right.key.length - left.key.length);

  return matches[0] ?? null;
}

function buildPriceLookupKeys(entry: CatalogPriceRecord): Array<string> {
  const keys = new Set<string>();
  const normalizedProduct = normalizeProductKey(entry.producto);

  keys.add(normalizedProduct);

  const aliasSource =
    entry.aliases.length > 0
      ? entry.aliases
      : buildDerivedProductAliases(entry.producto);

  for (const alias of aliasSource) {
    const normalizedAlias = normalizeProductKey(alias);

    if (!normalizedAlias) {
      continue;
    }

    keys.add(normalizedAlias);
  }

  return Array.from(keys);
}

function scopeValidatedOrderLinesForCartAction(input: {
  cartAction: CartAction;
  catalog: CatalogSnapshot;
  normalizedText: string;
  validatedOrderLines: Array<ResolvedOrderLine>;
}): Array<ResolvedOrderLine> {
  const { cartAction, catalog, normalizedText, validatedOrderLines } = input;

  if (
    (cartAction !== "remove" && cartAction !== "replace") ||
    validatedOrderLines.length <= 1
  ) {
    return validatedOrderLines;
  }

  const scopedLines = validatedOrderLines.filter((line) => {
    const priceEntry = findMatchingPriceEntry(
      catalog.prices,
      normalizeProductKey(line.matchedProduct)
    );
    const candidateKeys = priceEntry
      ? buildPriceLookupKeys(priceEntry)
      : [normalizeProductKey(line.requestedProduct), normalizeProductKey(line.matchedProduct)];

    return candidateKeys.some((key) => containsWholePhrase(normalizedText, key));
  });

  const sourceLines = scopedLines.length > 0 ? scopedLines : validatedOrderLines;
  const dedupedLines = new Map<string, ResolvedOrderLine>();

  for (const line of sourceLines) {
    if (!dedupedLines.has(line.matchedProduct)) {
      dedupedLines.set(line.matchedProduct, line);
    }
  }

  return Array.from(dedupedLines.values());
}

function buildDerivedProductAliases(productName: string): Array<string> {
  const normalizedTokens = normalizeProductKey(productName)
    .split(/\s+/u)
    .filter((token) => token && !isAliasStopWord(token));
  const aliases = new Set<string>();

  for (const token of normalizedTokens) {
    aliases.add(token);
  }

  for (let index = 0; index < normalizedTokens.length - 1; index += 1) {
    aliases.add(`${normalizedTokens[index]} ${normalizedTokens[index + 1]}`);
  }

  return Array.from(aliases);
}

function isAliasStopWord(token: string): boolean {
  return (
    token === "a" ||
    token === "al" ||
    token === "con" ||
    token === "de" ||
    token === "del" ||
    token === "el" ||
    token === "la" ||
    token === "las" ||
    token === "lo" ||
    token === "los" ||
    token === "y"
  );
}

function containsWholePhrase(input: string, phrase: string): boolean {
  if (!input || !phrase) {
    return false;
  }

  const escapedPhrase = phrase.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

  return new RegExp(`(?:^|\\s)${escapedPhrase}(?:$|\\s)`, "u").test(input);
}

function cloneOrderDraft(
  currentOrderDraft: ConversationOrderDraft | null,
  chatId: string
): ConversationOrderDraft {
  if (currentOrderDraft) {
    return {
      ...currentOrderDraft,
      items: currentOrderDraft.items.map((item) => ({
        ...item
      }))
    };
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
    estado: "incompleto"
  };
}

function mergeOrderItemsTool(
  orderDraft: ConversationOrderDraft,
  validatedOrderLines: Array<ResolvedOrderLine>
) {
  for (const line of validatedOrderLines) {
    const existingItem = orderDraft.items.find((item) => item.producto === line.matchedProduct);

    if (existingItem) {
      existingItem.cantidad += line.quantity;
      continue;
    }

    orderDraft.items.push({
      producto: line.matchedProduct,
      cantidad: line.quantity,
      precioUnitario: line.precioUnitario
    });
  }
}

function recalculateOrderTool(
  orderDraft: ConversationOrderDraft,
  catalog?: CatalogSnapshot | null
) {
  const itemsTotal = calculateOrderTotals(orderDraft.items).total;
  const deliveryFee =
    orderDraft.tipoEntrega === "delivery"
      ? extractDeliveryFeeFromCatalog(catalog ?? null)
      : 0;

  orderDraft.total = itemsTotal + deliveryFee;
}

function updateOrderDraftWithMessage(
  orderDraft: ConversationOrderDraft,
  normalizedText: string
) {
  if (includesAny(normalizedText, ["delivery", "envio"])) {
    orderDraft.tipoEntrega = "delivery";
  }

  if (includesAny(normalizedText, ["retiro", "retirar", "pickup", "paso a buscar"])) {
    orderDraft.tipoEntrega = "pickup";
  }

  if (orderDraft.tipoEntrega === "delivery") {
    const explicitAddress = normalizedText.match(
      /(?:mi direccion es|direccion|es en)\s+(.+)/u
    );

    if (explicitAddress?.[1]) {
      orderDraft.direccion = explicitAddress[1].trim();
    } else if (/\d/.test(normalizedText)) {
      orderDraft.direccion = normalizedText;
    }
  }

  if (
    includesAny(normalizedText, [
      "efectivo",
      "tarjeta",
      "transferencia",
      "mercado pago",
      "mercadopago",
      "alias"
    ])
  ) {
    orderDraft.metodoPago = "efectivo";
  }

  const explicitName = normalizedText.match(/(?:me llamo|soy)\s+([a-z\s]+)/u);

  if (explicitName?.[1]) {
    orderDraft.nombreCliente = explicitName[1].trim();
  } else if (!orderDraft.nombreCliente && looksLikeNameOnlyMessage(normalizedText)) {
    orderDraft.nombreCliente = normalizedText;
  }

  // Extract montoAbono (payment amount) for cash payments
  // Only parse when metodoPago is "efectivo" and montoAbono is not yet set
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    const paymentAmount = extractPaymentAmountFromPaymentHandler(normalizedText);
    if (paymentAmount !== null) {
      orderDraft.montoAbono = paymentAmount;
    }
  }
}

async function maybeEscalateForRepeatedErrors(
  repository: ConversationRepository,
  state: ConversationGraphState,
  payload: {
    draftReply: string;
    errorDetected: boolean;
    orderDraft?: ConversationOrderDraft | null;
    previousCart?: Array<ConversationOrderItem> | undefined;
    cartAction?: "add" | "remove" | "replace" | "clear" | undefined;
  }
) {
  const consecutiveErrorCount = nextConsecutiveErrorCount({
    chatId: state.chatId,
    currentCount: state.consecutiveErrorCount,
    hasError: payload.errorDetected
  });

  if (consecutiveErrorCount < ERROR_HANDOFF_THRESHOLD) {
    return {
      cartAction: payload.cartAction,
      consecutiveErrorCount,
      draftReply: payload.draftReply,
      orderDraft: payload.orderDraft,
      previousCart: payload.previousCart
    };
  }

  await repository.updateSessionStatus(state.chatId, "handed_off");
  consecutiveErrorCounts.delete(state.chatId);

  return {
    cartAction: payload.cartAction,
    consecutiveErrorCount: 0,
    draftReply: HANDOFF_RESPONSE,
    isHandedOff: true,
    orderDraft: payload.orderDraft,
    previousCart: payload.previousCart,
    suppressReply: false
  };
}

function nextConsecutiveErrorCount(input: {
  chatId?: string;
  currentCount: number | null | undefined;
  hasError: boolean;
}): number {
  if (!input.hasError) {
    if (input.chatId) {
      consecutiveErrorCounts.delete(input.chatId);
    }
    return 0;
  }

  const previousCount = input.chatId
    ? consecutiveErrorCounts.get(input.chatId) ?? 0
    : input.currentCount ?? 0;
  const nextCount = Math.max(previousCount, input.currentCount ?? 0) + 1;

  if (input.chatId) {
    consecutiveErrorCounts.set(input.chatId, nextCount);
  }

  return nextCount;
}

function shouldCountConversationError(input: {
  draftReply: string;
  invalidOrderLines?: Array<InvalidOrderLine>;
  orderDraft?: ConversationOrderDraft | null;
}): boolean {
  if ((input.invalidOrderLines?.length ?? 0) > 0) {
    return true;
  }

  const normalizedReply = normalizeText(input.draftReply);

  if (includesAny(normalizedReply, ["no encontre", "no pude", "insuficiente", "necesito un pedido activo"])) {
    return true;
  }

  return input.orderDraft?.estado === "error_producto";
}

function looksLikeNameOnlyMessage(normalizedText: string): boolean {
  if (!/^[a-z]+(?:\s+[a-z]+){0,3}$/u.test(normalizedText)) {
    return false;
  }

  if (
    isMenuRequest(normalizedText) ||
    isGreetingMessage(normalizedText) ||
    isComplaintMessage(normalizedText)
  ) {
    return false;
  }

  if (
    includesAny(normalizedText, [
      "delivery",
      "envio",
      "retiro",
      "retirar",
      "pickup",
      "paso a buscar",
      "efectivo",
      "tarjeta",
      "transferencia",
      "mercado pago",
      "mercadopago",
      "alias",
      "quiero",
      "quisiera",
      "pedido",
      "pedir",
      "agrega",
      "agregame",
      "suma",
      "sumame",
      "mandame",
      "manda",
      "traeme",
      "trae",
      "dame",
      "poneme",
      "horario",
      "hora",
      "abierto",
      "cierran",
      "donde",
      "direccion"
    ])
  ) {
    return false;
  }

  if (detectCartAction(normalizedText) !== "add") {
    return false;
  }

  return true;
}

function determineOrderStatus(orderDraft: ConversationOrderDraft): ConversationOrderStatus {
  if (orderDraft.items.length === 0) {
    return "incompleto";
  }

  if (
    orderDraft.tipoEntrega === "delivery" &&
    !orderDraft.direccion
  ) {
    return "incompleto";
  }

  if (!orderDraft.tipoEntrega || !orderDraft.metodoPago || !orderDraft.nombreCliente) {
    return "incompleto";
  }

  // Require montoAbono for cash payments
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    return "incompleto";
  }

  return "completo";
}

function buildOrderFollowUp(orderDraft: ConversationOrderDraft): string {
  if (!orderDraft.tipoEntrega) {
    return "¿Es para delivery o retiro?";
  }

  if (orderDraft.tipoEntrega === "delivery" && !orderDraft.direccion) {
    return "Perfecto. ¿Cual es la direccion de entrega?";
  }

  if (!orderDraft.metodoPago) {
    return "¿Como queres pagar? Por ahora trabajamos solo con efectivo.";
  }

  if (!orderDraft.nombreCliente) {
    return "¿A nombre de quien dejamos el pedido?";
  }

  // Ask for payment amount when paying in cash
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono === null) {
    return `El total es $${orderDraft.total}. ¿Con cuanto vas a pagar?`;
  }

  const itemsSummary = orderDraft.items
    .map((item) => `${item.cantidad} ${item.producto}`)
    .join(", ");
  const deliverySummary =
    orderDraft.tipoEntrega === "delivery"
      ? `delivery a ${orderDraft.direccion}`
      : "retiro en sucursal";

  // Include change information if paying in cash with montoAbono
  if (orderDraft.metodoPago === "efectivo" && orderDraft.montoAbono !== null) {
    try {
      const vuelto = calculateChange(orderDraft.total, orderDraft.montoAbono);
      if (vuelto > 0) {
        return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}. Abonas $${orderDraft.montoAbono}, tu vuelto es $${vuelto}.`;
      }
      // Exact payment
      return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}. Abonas con el monto exacto.`;
    } catch (error) {
      if (error instanceof InsufficientPaymentError) {
        return `El monto ($${orderDraft.montoAbono}) es insuficiente. El total es $${orderDraft.total}. ¿Con cuanto vas a pagar?`;
      }
      throw error;
    }
  }

  return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}.`;
}

function buildOrderTotalReply(orderDraft: ConversationOrderDraft): string {
  const itemsSummary = orderDraft.items
    .map((item) => `${item.cantidad} ${item.producto}`)
    .join(", ");

  return `Tu pedido actual es: ${itemsSummary}. Total: $${orderDraft.total}. ${buildOrderFollowUp(orderDraft)}`;
}

function isConversationIntent(value: unknown): value is ConversationIntent {
  return (
    value === "complaint" ||
    value === "faq" ||
    value === "greeting" ||
    value === "order" ||
    value === "payment"
  );
}

function isConversationOrderDraft(value: unknown): value is ConversationOrderDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ConversationOrderDraft>;

  // montoAbono can be null or a number, both are valid
  const montoAbonoValid =
    candidate.montoAbono === null ||
    candidate.montoAbono === undefined ||
    typeof candidate.montoAbono === "number";

  return (
    typeof candidate.telefono === "string" &&
    Array.isArray(candidate.items) &&
    typeof candidate.total === "number" &&
    montoAbonoValid &&
    (candidate.estado === "completo" ||
      candidate.estado === "error_producto" ||
      candidate.estado === "incompleto")
  );
}

function requireCatalog(catalog: CatalogSnapshot | null): CatalogSnapshot {
  if (!catalog) {
    throw new Error("Catalog snapshot is required.");
  }

  return catalog;
}

function requireSession(
  session: ConversationSessionRecord | null
): ConversationSessionRecord {
  if (!session) {
    throw new Error("Conversation session is required.");
  }

  return session;
}

function buildThreadId(chatId: string): string {
  return `telegram:${chatId}`;
}

/**
 * SRS v4: Conversation Assistant V2 con mejoras de Sprint 1.
 *
 * Mejoras implementadas:
 * - Checkpointer V2: Persistencia mejorada con version management
 * - Saludo profesional
 */
export function createConversationAssistantV2(options: {
  repository: ConversationRepository;
  composeResponse?: ComposeResponse;
  extractOrderRequest?: ExtractOrderRequest;
}): ConversationAssistant {
  const composeResponse = options.composeResponse ?? (async (input) => input.draftReply);
  const extractOrderRequest =
    options.extractOrderRequest ?? createRuleBasedOrderExtractionAgent();
  const executeNode = async <T>(
    state: ConversationGraphState | undefined,
    nodeName: string,
    fn: () => Promise<T>
  ): Promise<T> => {
    if (!state?.traceContext) {
      return fn();
    }

    return createTracedNodeExecutor(state.traceContext).execute(nodeName, fn);
  };

  // SRS v4: Usar Checkpointer V2 para mejor persistencia
  const checkpointer = createConvexCheckpointerV2(options.repository);

  const graph = new StateGraph(ConversationState)
    .addNode("load_session", async (state) =>
      executeNode(state, "load_session", async () =>
        loadSessionNode(options.repository, state)
      )
    )
    .addNode("check_handed_off", async (state) =>
      executeNode(state, "check_handed_off", async () =>
        checkHandedOffNode(state)
      )
    )
    .addNode("analyze_message", async (state) =>
      executeNode(state, "analyze_message", async () =>
        analyzeMessageNode(extractOrderRequest, state)
      )
    )
    .addNode("greeting_handler", async (state) =>
      executeNode(state, "greeting_handler", async () => ({
        draftReply: DEFAULT_GREETING
      }))
    )
    .addNode("faq_handler", async (state) =>
      executeNode(state, "faq_handler", async () => faqHandlerNode(state))
    )
    .addNode("resolve_order_request", async (state) =>
      executeNode(state, "resolve_order_request", async () => resolveOrderRequestNode(state))
    )
    .addNode("order_handler", async (state) =>
      executeNode(state, "order_handler", async () =>
        orderHandlerNode(options.repository, state)
      )
    )
    .addNode("payment_handler", async (state) =>
      executeNode(state, "payment_handler", async () =>
        paymentHandlerNode(options.repository, state)
      )
    )
    .addNode("duplicate_handler", async (state) =>
      executeNode(state, "duplicate_handler", async () => ({
        draftReply: state.duplicateResponseText
      }))
    )
    .addNode("complaint_handler", async (state) =>
      executeNode(state, "complaint_handler", async () =>
        complaintHandlerNode(options.repository, state)
      )
    )
    .addNode("handoff_handler", async (state) =>
      executeNode(state, "handoff_handler", async () => ({
        draftReply: HANDOFF_RESPONSE
      }))
    )
    .addNode("silence_handoff", async (state) =>
      executeNode(state, "silence_handoff", async () => ({
        draftReply: "",
        suppressReply: true
      }))
    )
    .addNode("format_response", async (state) =>
      executeNode(state, "format_response", async () =>
        formatResponseNode(composeResponse, state)
      )
    )
    .addEdge(START, "load_session")
    .addEdge("load_session", "check_handed_off")
    .addConditionalEdges("check_handed_off", routeByHandedOffStatus, {
      handed_off: "silence_handoff",
      continue: "analyze_message"
    })
    .addConditionalEdges("analyze_message", routeByIntentV2, {
      complaint: "complaint_handler",
      duplicate: "duplicate_handler",
      faq: "faq_handler",
      greeting: "greeting_handler",
      order: "resolve_order_request",
      payment: "payment_handler"
    })
    .addEdge("greeting_handler", "format_response")
    .addEdge("faq_handler", "format_response")
    .addEdge("resolve_order_request", "order_handler")
    .addEdge("order_handler", "format_response")
    .addEdge("payment_handler", "format_response")
    .addEdge("duplicate_handler", "format_response")
    .addEdge("complaint_handler", "handoff_handler")
    .addEdge("handoff_handler", "format_response")
    .addEdge("silence_handoff", "format_response")
    .addEdge("format_response", END)
    .compile({ checkpointer });

  const handleIncomingMessageDetailed = async (
    input: { chatId: string; text: string; tracingEnvironment?: string }
  ): Promise<ConversationAssistantResult> => {
    const traceContext = createConversationTraceContext(
      input.chatId,
      undefined,
      undefined,
      {
        environment: input.tracingEnvironment
      }
    );
    const tracedExecutor = createTracedNodeExecutor(traceContext);
    let traceSucceeded = true;

    setTraceInput(traceContext, {
      chatId: input.chatId,
      message: input.text
    });

    try {
      const session = await executeNode(undefined, "upsert_session", () =>
        options.repository.upsertSessionByChatId(input.chatId)
      );

      const threadId = buildThreadId(input.chatId);
      const graphConfig: RunnableConfig = {
        configurable: {
          thread_id: threadId,
          session_id: session.id,
          // SRS v4: Namespace para checkpointer V2
          namespace: "restaulang-main"
        }
      };

      const result = await graph.invoke(
        {
          chatId: input.chatId,
          messageText: input.text,
          session,
          threadId,
          traceContext
        } as unknown as ConversationGraphState,
        graphConfig
      );

      const finalResponse = result.responseText || result.draftReply;

      if (
        result.orderDraft &&
        (result.orderDraft.items.length > 0 || result.cartAction === "clear")
      ) {
        const orderDraft = result.orderDraft;
        await executeNode(undefined, "upsert_order", () =>
          options.repository.upsertOrderForSession({
            telefono: orderDraft.telefono,
            items: orderDraft.items,
            direccion: orderDraft.direccion,
            tipoEntrega: orderDraft.tipoEntrega,
            metodoPago: orderDraft.metodoPago,
            nombreCliente: orderDraft.nombreCliente,
            total: orderDraft.total,
            estado: orderDraft.estado,
            montoAbono: orderDraft.montoAbono,
            sessionId: session.id
          })
        );
      }

      setTraceOutput(traceContext, {
        reply: finalResponse,
        intent: result.intent,
        isDuplicate: result.isDuplicate
      });

      return {
        reply: finalResponse,
        traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
        observationId: traceContext.rootObservationId,
        tokens: getTraceTokenUsage(traceContext)
      };
    } catch (error) {
      traceSucceeded = false;
      const normalizedError = error instanceof Error ? error : new Error(String(error));
      recordTraceError(traceContext, normalizedError);

      if (error instanceof CircuitOpenError) {
        logger.warn("Circuit breaker open - returning graceful degradation response", undefined, {
          chatId: input.chatId,
          error: { name: error.name, message: error.message }
        });

        const normalizedText = normalizeText(input.text);
        const fallbackIntent: "complaint" | "faq" | "greeting" = isGreetingMessage(normalizedText)
          ? "greeting"
          : isComplaintMessage(normalizedText)
            ? "complaint"
            : "faq";
        const fallbackResponse = degradationHandler.handleCircuitOpen(
          "convex",
          fallbackIntent,
          input.text
        );

        setTraceOutput(traceContext, {
          reply: fallbackResponse,
          fallbackReason: "circuit_open",
          error: normalizedError.message
        });

        return {
          reply: fallbackResponse,
          traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
          observationId: traceContext.rootObservationId,
          tokens: getTraceTokenUsage(traceContext)
        };
      }

      logger.error("Conversation assistant error - returning fallback response", undefined, undefined, {
        chatId: input.chatId,
        error: { name: normalizedError.name, message: normalizedError.message }
      });

      const fallbackResponse = degradationHandler.getFallbackResponse("faq", input.text);
      setTraceOutput(traceContext, {
        reply: fallbackResponse,
        fallbackReason: "unexpected_error",
        error: normalizedError.message
      });

      return {
        reply: fallbackResponse,
        traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
        observationId: traceContext.rootObservationId,
        tokens: getTraceTokenUsage(traceContext)
      };
    } finally {
      tracedExecutor.end(traceSucceeded);
    }
  };

  return {
    async handleIncomingMessage(input) {
      const result = await handleIncomingMessageDetailed(input);
      return result.reply;
    },
    handleIncomingMessageDetailed
  };
}

/**
 * SRS v4: Router de intención para el assistant V2.
 */
function routeByIntentV2(state: ConversationGraphState): ConversationRoute {
  if (state.isDuplicate) {
    return "duplicate";
  }

  return state.intent ?? "faq";
}
