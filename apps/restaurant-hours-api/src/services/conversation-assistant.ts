import { Annotation, END, START, StateGraph } from "@langchain/langgraph";

import {
  createRuleBasedOrderExtractionAgent,
  type ExtractedOrderLine,
  type ExtractOrderRequest
} from "./order-extraction.js";

export type ConversationIntent = "complaint" | "faq" | "greeting" | "order";

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
  createdAt: number;
};

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
  }): Promise<string>;
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
};

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
  draftReply: Annotation<string>,
  responseText: Annotation<string>,
  threadId: Annotation<string>
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

  const graph = new StateGraph(ConversationState)
    .addNode("load_session", async (state) =>
      loadSessionNode(options.repository, state)
    )
    .addNode("analyze_message", async (state) =>
      analyzeMessageNode(extractOrderRequest, state)
    )
    .addNode("greeting_handler", async () => ({
      draftReply: DEFAULT_GREETING
    }))
    .addNode("faq_handler", async (state) => faqHandlerNode(state))
    .addNode("resolve_order_request", async (state) => resolveOrderRequestNode(state))
    .addNode("order_handler", async (state) =>
      orderHandlerNode(options.repository, state)
    )
    .addNode("complaint_handler", async () => ({
      draftReply:
        "Puedo dejar esto marcado para revision humana. Contame brevemente el problema y lo derivamos."
    }))
    .addNode("format_response", async (state) =>
      formatResponseNode(composeResponse, state)
    )
    .addEdge(START, "load_session")
    .addEdge("load_session", "analyze_message")
    .addConditionalEdges("analyze_message", routeByIntent, {
      complaint: "complaint_handler",
      faq: "faq_handler",
      greeting: "greeting_handler",
      order: "resolve_order_request"
    })
    .addEdge("greeting_handler", "format_response")
    .addEdge("faq_handler", "format_response")
    .addEdge("resolve_order_request", "order_handler")
    .addEdge("order_handler", "format_response")
    .addEdge("complaint_handler", "format_response")
    .addEdge("format_response", END)
    .compile();

  return {
    async handleIncomingMessage(input) {
      const result = await graph.invoke({
        chatId: input.chatId,
        messageText: input.text,
        session: null,
        catalog: null,
        intent: null,
        requestedActions: [],
        wantsMenu: false,
        extractedOrderLines: [],
        validatedOrderLines: [],
        invalidOrderLines: [],
        orderDraft: null,
        draftReply: "",
        responseText: "",
        threadId: buildThreadId(input.chatId)
      });

      const session = requireSession(result.session);

      await options.repository.saveCheckpoint({
        sessionId: session.id,
        threadId: result.threadId,
        checkpoint: JSON.stringify({
          intent: result.intent,
          orderDraft: result.orderDraft,
          threadId: result.threadId
        } satisfies PersistedConversationState),
        createdAt: Date.now()
      });

      return result.responseText || result.draftReply;
    }
  };
}

function routeByIntent(state: ConversationGraphState): ConversationIntent {
  return state.intent ?? "faq";
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
    orderDraft: persistedState.orderDraft,
    session,
    threadId: persistedState.threadId ?? latestCheckpoint?.threadId ?? buildThreadId(state.chatId)
  };
}

async function analyzeMessageNode(
  extractOrderRequest: ExtractOrderRequest,
  state: ConversationGraphState
) {
  const normalizedText = normalizeText(state.messageText);

  if (isComplaintMessage(normalizedText)) {
    return {
      extractedOrderLines: [],
      intent: "complaint" as const,
      invalidOrderLines: [],
      requestedActions: [],
      validatedOrderLines: [],
      wantsMenu: false
    };
  }

  if (isGreetingMessage(normalizedText)) {
    return {
      extractedOrderLines: [],
      intent: "greeting" as const,
      invalidOrderLines: [],
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
  const extractedOrderLines = isDetailOnlyOrderMessage(normalizedText, state.orderDraft)
    ? []
    : extraction.orderLines;
  const shouldUpdateOrder =
    extractedOrderLines.length > 0 || isOrderFollowUpMessage(normalizedText, state.orderDraft);

  return {
    extractedOrderLines,
    intent: shouldUpdateOrder ? ("order" as const) : ("faq" as const),
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
      draftReply: `Hoy tenemos: ${menuSummary}. Si queres, puedo ayudarte a armar tu pedido.`
    };
  }

  const faqMatch = findFaqMatch(catalog.faq, normalizedText);

  return {
    draftReply:
      faqMatch?.respuesta ??
      "No encontre ese dato en la base actual. Si queres, puedo mostrarte el menu o tomar tu pedido."
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
      subtotal: orderLine.quantity * price.precioUnitario
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
  const session = requireSession(state.session);
  const orderDraft = cloneOrderDraft(state.orderDraft, state.chatId);
  const normalizedText = normalizeText(state.messageText);
  const hasIncomingLines = state.extractedOrderLines.length > 0;

  if (state.validatedOrderLines.length > 0) {
    mergeOrderItemsTool(orderDraft, state.validatedOrderLines);
  }

  if (!hasIncomingLines && orderDraft.items.length === 0) {
    return {
      draftReply: "Decime que producto queres pedir y lo preparo.",
      orderDraft
    };
  }

  if (orderDraft.items.length === 0 && state.invalidOrderLines.length > 0) {
    orderDraft.estado = "error_producto";

    return {
      draftReply: buildOrderReply({
        invalidOrderLines: state.invalidOrderLines,
        orderDraft,
        validatedOrderLines: []
      }),
      orderDraft
    };
  }

  if (orderDraft.items.length > 0) {
    updateOrderDraftWithMessage(orderDraft, normalizedText);
    recalculateOrderTool(orderDraft);
    orderDraft.estado = determineOrderStatus(orderDraft);

    await repository.upsertOrderForSession({
      ...orderDraft,
      sessionId: session.id
    });
  }

  return {
    draftReply: buildOrderReply({
      invalidOrderLines: state.invalidOrderLines,
      orderDraft,
      validatedOrderLines: state.validatedOrderLines
    }),
    orderDraft
  };
}

async function formatResponseNode(
  composeResponse: ComposeResponse,
  state: ConversationGraphState
) {
  const session = requireSession(state.session);
  const intent = state.intent ?? "faq";

  if (intent === "order") {
    return {
      responseText: state.draftReply
    };
  }

  const responseText = await composeResponse({
    chatId: state.chatId,
    draftReply: state.draftReply,
    intent,
    messageText: state.messageText,
    orderDraft: state.orderDraft,
    session
  });

  return {
    responseText: responseText.trim() || state.draftReply
  };
}

function buildOrderReply(input: {
  validatedOrderLines: Array<ResolvedOrderLine>;
  invalidOrderLines: Array<InvalidOrderLine>;
  orderDraft: ConversationOrderDraft;
}): string {
  const segments: Array<string> = [];

  if (input.validatedOrderLines.length === 1 && input.invalidOrderLines.length === 0) {
    const line = input.validatedOrderLines[0];
    const updatedItem = input.orderDraft.items.find(
      (item) => item.producto === line.matchedProduct
    );
    const shouldShowAccumulatedTotal =
      input.orderDraft.items.length > 1 ||
      (updatedItem?.cantidad ?? line.quantity) > line.quantity;

    if (shouldShowAccumulatedTotal) {
      segments.push(
        `Anotado: ${line.quantity} ${line.matchedProduct} ($${line.subtotal}). Total parcial: $${input.orderDraft.total}.`
      );
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

    segments.push(
      `No pude identificar: ${missingItems}. Decime a que producto te referis y lo sumo.`
    );
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

function parsePersistedConversationState(
  checkpoint: ConversationCheckpoint | null
): PersistedConversationState {
  if (!checkpoint) {
    return {
      intent: null,
      orderDraft: null,
      threadId: null
    };
  }

  try {
    const parsed = JSON.parse(checkpoint.checkpoint) as Partial<PersistedConversationState>;

    return {
      intent: isConversationIntent(parsed.intent) ? parsed.intent : null,
      orderDraft: isConversationOrderDraft(parsed.orderDraft) ? parsed.orderDraft : null,
      threadId: typeof parsed.threadId === "string" ? parsed.threadId : null
    };
  } catch {
    return {
      intent: null,
      orderDraft: null,
      threadId: checkpoint.threadId
    };
  }
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

function isComplaintMessage(normalizedText: string): boolean {
  return includesAny(normalizedText, ["queja", "reclamo", "humano", "persona", "operador"]);
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

  if (
    includesAny(normalizedText, [
      "delivery",
      "envio",
      "retiro",
      "pickup",
      "paso a buscar",
      "efectivo",
      "tarjeta",
      "transferencia",
      "mercado pago",
      "mercadopago",
      "alias",
      "me llamo",
      "soy"
    ])
  ) {
    return true;
  }

  if (!orderDraft.nombreCliente && looksLikeNameOnlyMessage(normalizedText)) {
    return true;
  }

  return Boolean(/\d/.test(normalizedText) && orderDraft.tipoEntrega === "delivery");
}

function isDetailOnlyOrderMessage(
  normalizedText: string,
  orderDraft: ConversationOrderDraft | null
): boolean {
  if (!orderDraft) {
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
  for (const entry of entries) {
    const terms = buildFaqTerms(entry);

    if (
      terms.some(
        (term) =>
          containsWholePhrase(normalizedText, term) ||
          containsWholePhrase(term, normalizedText)
      )
    ) {
      return entry;
    }
  }

  return null;
}

function buildFaqTerms(entry: CatalogFaqRecord): Array<string> {
  const normalizedTopic = normalizeText(entry.tema);
  const questionTerms = normalizeText(entry.pregunta)
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
  const uniqueTerms = new Set<string>();

  if (normalizedTopic) {
    uniqueTerms.add(normalizedTopic);
  }

  for (const term of questionTerms) {
    uniqueTerms.add(term);
  }

  return Array.from(uniqueTerms);
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

function recalculateOrderTool(orderDraft: ConversationOrderDraft) {
  orderDraft.total = orderDraft.items.reduce(
    (sum, item) => sum + item.cantidad * item.precioUnitario,
    0
  );
}

function updateOrderDraftWithMessage(
  orderDraft: ConversationOrderDraft,
  normalizedText: string
) {
  if (includesAny(normalizedText, ["delivery", "envio"])) {
    orderDraft.tipoEntrega = "delivery";
  }

  if (includesAny(normalizedText, ["retiro", "pickup", "paso a buscar"])) {
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
    if (includesAny(normalizedText, ["mercado pago", "mercadopago"])) {
      orderDraft.metodoPago = "mercado pago";
    } else if (normalizedText.includes("tarjeta")) {
      orderDraft.metodoPago = "tarjeta";
    } else if (
      normalizedText.includes("transferencia") ||
      normalizedText.includes("alias")
    ) {
      orderDraft.metodoPago = "transferencia";
    } else {
      orderDraft.metodoPago = "efectivo";
    }
  }

  const explicitName = normalizedText.match(/(?:me llamo|soy)\s+([a-z\s]+)/u);

  if (explicitName?.[1]) {
    orderDraft.nombreCliente = explicitName[1].trim();
  } else if (!orderDraft.nombreCliente && looksLikeNameOnlyMessage(normalizedText)) {
    orderDraft.nombreCliente = normalizedText;
  }
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
    return "¿Como queres pagar? (efectivo/tarjeta/transferencia/mercado pago)";
  }

  if (!orderDraft.nombreCliente) {
    return "¿A nombre de quien dejamos el pedido?";
  }

  const itemsSummary = orderDraft.items
    .map((item) => `${item.cantidad} ${item.producto}`)
    .join(", ");
  const deliverySummary =
    orderDraft.tipoEntrega === "delivery"
      ? `delivery a ${orderDraft.direccion}`
      : "retiro en sucursal";

  return `¡Listo! Tu pedido: ${itemsSummary}, ${deliverySummary}. Total: $${orderDraft.total}.`;
}

function isConversationIntent(value: unknown): value is ConversationIntent {
  return value === "complaint" || value === "faq" || value === "greeting" || value === "order";
}

function isConversationOrderDraft(value: unknown): value is ConversationOrderDraft {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ConversationOrderDraft>;

  return (
    typeof candidate.telefono === "string" &&
    Array.isArray(candidate.items) &&
    typeof candidate.total === "number" &&
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
