# Plan de Mejoras LangGraph para RestauLang

## Resumen Ejecutivo

Este documento detalla las mejoras necesarias para hacer el proyecto RestauLang más robusto utilizando las características avanzadas de LangGraph, manteniendo el alcance actual del proyecto.

## Estado Actual

### Gráficos Existentes

1. **conversation-assistant.ts** - Graph principal con:
   - StateGraph simple sin checkpointer de LangGraph
   - Persistencia manual via Convex checkpoints
   - Handoff unidireccional (bot → humano)
   - Sin sub-gráficos modulares
   - Sin interrupts ni Command patterns

2. **judge-agent.ts** - Graph de evaluación con:
   - StateGraph simple lineal
   - Sin checkpointer
   - Sin retry policies

## Plan de Mejoras por Categoría

---

### 1. PERSISTENCIA ROBUSTA (Priority: ALTA)

#### Problema Actual
- Checkpoints se guardan manualmente en Convex
- No hay integración con checkpointer de LangGraph
- State management es manual y propenso a errores

#### Solución Propuesta

**a) Implementar Checkpointer Personalizado para Convex**

Crear un checkpointer que integre LangGraph con Convex:

```typescript
// new file: src/langgraph/convex-checkpointer.ts
import { BaseCheckpointSaver, Checkpoint, CheckpointList, CheckpointMetadata } from "@langchain/langgraph";
import type { ConversationRepository } from "../services/conversation-assistant.js";

export class ConvexCheckpointer extends BaseCheckpointSaver {
  constructor(private repository: ConversationRepository) {
    super();
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata
  ): Promise<void> {
    const sessionId = config.configurable?.["session_id"];
    const threadId = config.configurable?.["thread_id"];

    if (!sessionId || !threadId) {
      throw new Error("Missing session_id or thread_id in config");
    }

    await this.repository.saveCheckpoint({
      sessionId,
      threadId,
      checkpoint: JSON.stringify(checkpoint),
      createdAt: Date.now()
    });
  }

  async get(config: RunnableConfig): Promise<Checkpoint | undefined> {
    const sessionId = config.configurable?.["session_id"];
    if (!sessionId) return undefined;

    const latestCheckpoint = await this.repository.getLatestCheckpoint(sessionId);
    if (!latestCheckpoint) return undefined;

    return JSON.parse(latestCheckpoint.checkpoint);
  }

  async list(config: RunnableConfig, limit?: number): Promise<CheckpointList> {
    // Implement time travel browsing
  }
}
```

**b) Integrar Checkpointer en el Graph Principal**

```typescript
const checkpointer = new ConvexCheckpointer(options.repository);

const graph = new StateGraph(ConversationState)
  .addNode(/* ... */)
  .compile({ checkpointer });
```

**c) Configurar para Producción con PostgresSaver (Futuro)**

```typescript
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";

const postgresCheckpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
await postgresCheckpointer.setup();
```

---

### 2. HUMAN-IN-THE-LOOP CON INTERRUPTS (Priority: ALTA)

#### Problema Actual
- Handoff es unidireccional (una vez handed_off, no vuelve)
- Sin capacidad de pausar para aprobación humana
- Sin validación con re-interrupt loops

#### Solución Propuesta

**a) Implementar Interrupt para Confirmación de Pedido Crítico**

```typescript
// Para pedidos de alto valor, pedir confirmación humana
async function orderConfirmationNode(state: ConversationGraphState) {
  const orderDraft = state.orderDraft;
  const isHighValue = orderDraft.total > 5000; // Ejemplo

  if (isHighValue) {
    // Interrupt para aprobación de pedido grande
    const approved = interrupt({
      type: "order_approval",
      orderDraft,
      message: `Pedido de alto valor ($${orderDraft.total}) requiere aprobación`
    });

    return {
      draftReply: approved
        ? "Pedido aprobado. Procesando..."
        : "Pedido rechazado por el operador."
    };
  }

  return { draftReply: "Pedido normal, procesando..." };
}
```

**b) Implementar Handoff Bidireccional con Command**

```typescript
// Nuevo nodo para reactivar sesión desde handoff
async function reactivateSessionNode(state: ConversationGraphState) {
  const command = interrupt({
    type: "session_reactivation",
    session: state.session,
    message: "Sesión está en handoff. ¿Reactivar?"
  });

  if (command.approved) {
    await repository.updateSessionStatus(state.chatId, "active");
    return {
      isHandedOff: false,
      draftReply: "Sesión reactivada. ¿En qué puedo ayudarte?"
    };
  }

  return {
    draftReply: "Sesión permanece en handoff."
  };
}
```

**c) Implementar Validación con Re-interrupt Loop**

```typescript
// Para validación de direcciones o pagos problemáticos
async function validatePaymentNode(state: ConversationGraphState) {
  const orderDraft = state.orderDraft;

  while (true) {
    const paymentInfo = interrupt({
      type: "payment_validation",
      orderDraft,
      fields: ["metodoPago", "montoAbono"]
    });

    // Validar paymentInfo
    if (isValidPayment(paymentInfo)) {
      return {
        orderDraft: {
          ...orderDraft,
          ...paymentInfo
        }
      };
    }

    // Si inválido, re-interrupt con mensaje de error
    // El loop continúa hasta validación correcta
  }
}
```

**d) Agregar Checkpointer para Soportar Interrupts**

```typescript
// Esencial: interrupts requieren checkpointer
const graph = new StateGraph(ConversationState)
  .addNode(/* ... */)
  .compile({ checkpointer });
```

---

### 3. SUB-GRÁFICOS MODULARES (Priority: MEDIA)

#### Problema Actual
- Graph monolítico difícil de mantener
- No hay separación de concerns
- No hay reutilización de flujos

#### Solución Propuesta

**a) Crear Sub-gráfico de Order Flow**

```typescript
// new file: src/langgraph/subgraphs/order-flow.ts

const OrderFlowState = Annotation.Root({
  chatId: Annotation<string>,
  extractedOrderLines: Annotation<Array<ExtractedOrderLine>>,
  orderDraft: Annotation<ConversationOrderDraft | null>,
  catalog: Annotation<CatalogSnapshot>,
  validatedOrderLines: Annotation<Array<ResolvedOrderLine>>,
  invalidOrderLines: Annotation<Array<InvalidOrderLine>>,
  finalReply: Annotation<string>
});

function createOrderFlowGraph(): CompiledGraph<typeof OrderFlowState> {
  return new StateGraph(OrderFlowState)
    .addNode("validate_items", validateItemsNode)
    .addNode("merge_order", mergeOrderNode)
    .addNode("calculate_totals", calculateTotalsNode)
    .addNode("build_reply", buildOrderReplyNode)
    .addEdge(START, "validate_items")
    .addEdge("validate_items", "merge_order")
    .addEdge("merge_order", "calculate_totals")
    .addEdge("calculate_totals", "build_reply")
    .addEdge("build_reply", END)
    .compile();
}
```

**b) Crear Sub-gráfico de FAQ Flow**

```typescript
// new file: src/langgraph/subgraphs/faq-flow.ts

const FaqFlowState = Annotation.Root({
  messageText: Annotation<string>,
  catalog: Annotation<CatalogSnapshot>,
  wantsMenu: Annotation<boolean>,
  reply: Annotation<string>
});

function createFaqFlowGraph(): CompiledGraph<typeof FaqFlowState> {
  return new StateGraph(FaqFlowState)
    .addNode("check_menu_request", checkMenuRequestNode)
    .addNode("show_menu", showMenuNode)
    .addNode("match_faq", matchFaqNode)
    .addEdge(START, "check_menu_request")
    .addConditionalEdges(
      "check_menu_request",
      (state) => state.wantsMenu ? "show_menu" : "match_faq",
      ["show_menu", "match_faq"]
    )
    .addEdge("show_menu", END)
    .addEdge("match_faq", END)
    .compile();
}
```

**c) Crear Sub-gráfico de Handoff Flow**

```typescript
// new file: src/langgraph/subgraphs/handoff-flow.ts

const HandoffFlowState = Annotation.Root({
  session: Annotation<ConversationSessionRecord>,
  chatId: Annotation<string>,
  repository: Annotation<ConversationRepository>,
  isHandedOff: Annotation<boolean>,
  reply: Annotation<string>
});

function createHandoffFlowGraph(): CompiledGraph<typeof HandoffFlowState> {
  return new StateGraph(HandoffFlowState)
    .addNode("check_status", checkHandoffStatusNode)
    .addNode("activate_handoff", activateHandoffNode)
    .addNode("handle_handoff", handleHandoffNode)
    .addEdge(START, "check_status")
    .addConditionalEdges(
      "check_status",
      (state) => state.isHandedOff ? "handle_handoff" : "activate_handoff",
      ["activate_handoff", "handle_handoff"]
    )
    .addEdge("activate_handoff", END)
    .addEdge("handle_handoff", END)
    .compile();
}
```

**d) Integrar Sub-gráficos en el Graph Principal**

```typescript
const orderFlow = createOrderFlowGraph();
const faqFlow = createFaqFlowGraph();
const handoffFlow = createHandoffFlowGraph();

const graph = new StateGraph(ConversationState)
  .addNode("order_flow", (state) => orderFlow.invoke({
    chatId: state.chatId,
    extractedOrderLines: state.extractedOrderLines,
    orderDraft: state.orderDraft,
    catalog: state.catalog,
    validatedOrderLines: [],
    invalidOrderLines: [],
    finalReply: ""
  }))
  .addNode("faq_flow", (state) => faqFlow.invoke({/* ... */}))
  .addNode("handoff_flow", (state) => handoffFlow.invoke({/* ... */}))
  // ... routing logic
  .compile();
```

---

### 4. EJECUCIÓN EN PARALELO (Priority: MEDIA)

#### Problema Actual
- Todo es secuencial
- No se aprovechan oportunidades de paralelismo

#### Solución Propuesta

**a) Parallel Validation de Ordenes**

Usando `Send` API para validar múltiples items en paralelo:

```typescript
import { Send } from "@langchain/langgraph";

function parallelValidateItemsNode(state: ConversationGraphState) {
  // Fan-out a workers paralelos
  return state.extractedOrderLines.map((orderLine) =>
    new Send("validate_item", {
      catalog: state.catalog,
      orderLine
    })
  );
}

function validateItemNode(state: { catalog: CatalogSnapshot, orderLine: ExtractedOrderLine }) {
  const price = findMatchingPriceEntry(
    state.catalog.prices,
    normalizeProductKey(state.orderLine.productText)
  );

  return {
    validatedLine: price ? {
      rawText: state.orderLine.rawText,
      matchedProduct: price.producto,
      quantity: state.orderLine.quantity,
      precioUnitario: price.precioUnitario,
      subtotal: calculateLineSubtotal(state.orderLine.quantity, price.precioUnitario)
    } : null
  };
}

const graph = new StateGraph(ConversationState)
  .addNode("parallel_validate", parallelValidateItemsNode)
  .addNode("validate_item", validateItemNode)
  .addNode("aggregate_results", aggregateValidationResultsNode)
  .addConditionalEdges(START, parallelValidateItemsNode, ["validate_item"])
  .addEdge("validate_item", "aggregate_results")
  .addEdge("aggregate_results", END)
  .compile({ checkpointer });
```

**b) Parallel Loading de Catalog y Checkpoint**

Ya se hace con `Promise.all` pero podría ser un nodo separado:

```typescript
async function parallelLoadNode(state: ConversationGraphState) {
  const [session, catalog, checkpoint] = await Promise.all([
    repository.upsertSessionByChatId(state.chatId),
    repository.getCatalogSnapshot(),
    // checkpoint loading if needed
  ]);

  return { session, catalog, /* ... */ };
}
```

---

### 5. RETRY POLICIES (Priority: MEDIA)

#### Problema Actual
- Circuit breakers externos pero no RetryPolicy de LangGraph
- Manejo de errores transitorios limitado

#### Solución Propuesta

**a) Implementar RetryPolicy para Nodes Vulnerables**

```typescript
import { RetryPolicy } from "@langchain/langgraph";

const graph = new StateGraph(ConversationState)
  .addNode(
    "analyze_message",
    analyzeMessageNode,
    {
      retryPolicy: {
        maxAttempts: 3,
        initialInterval: 1000,
        maxInterval: 10000,
        backoffFactor: 2,
        jitter: true
      }
    }
  )
  .addNode(
    "load_catalog",
    loadCatalogNode,
    {
      retryPolicy: {
        maxAttempts: 2,
        initialInterval: 500
      }
    }
  )
  .compile({ checkpointer });
```

**b) Implementar ToolNode para LLM Calls**

```typescript
import { ToolNode } from "@langchain/langgraph/prebuilt";

const tools = [
  // LLM-based tools con handleToolErrors
];

const toolNode = new ToolNode(tools, { handleToolErrors: true });

const graph = new StateGraph(ConversationState)
  .addNode("tools", toolNode)
  .compile({ checkpointer });
```

---

### 6. STORE PARA CROSS-THREAD MEMORY (Priority: BAJA)

#### Problema Actual
- No hay persistencia de preferencias entre conversaciones
- Cada conversación empieza sin contexto del usuario

#### Solución Propuesta

**a) Implementar Store para Preferencias de Usuario**

```typescript
import { MemoryStore } from "@langchain/langgraph";

const store = new MemoryStore();

// Guardar preferencia
await store.put([state.chatId, "preferences"], "favorite", {
  favoriteItems: ["milanesa", "pizza"],
  preferredPayment: "efectivo",
  lastOrder: Date.now()
});

// Leer preferencia
async function personalizeResponseNode(
  state: ConversationGraphState,
  runtime: Runtime
) {
  const prefs = await runtime.store?.get([state.chatId, "preferences"], "favorite");

  return {
    personalizedContext: prefs?.value || null
  };
}

const graph = new StateGraph(ConversationState)
  .addNode("load_preferences", personalizeResponseNode)
  .compile({ checkpointer, store });
```

---

### 7. ERROR HANDLING DE 4 TIERS (Priority: MEDIA)

#### Problema Actual
- Try-catch simple con graceful degradation
- No hay estrategia sistemática de manejo de errores

#### Solución Propuesta

Implementar la estrategia de 4 tiers:

1. **Tier 1: RetryPolicy** - Para errores transitorios (network, rate limits)
2. **Tier 2: ToolNode con handleToolErrors** - Para errores recuperables por LLM
3. **Tier 3: Interrupt** - Para errores solucionables por humanos
4. **Tier 4: Throw** - Para errores inesperados (developer fix)

```typescript
// Ejemplo de implementación

async function resilientNode(state: ConversationGraphState) {
  try {
    // Lógica principal
    return result;
  } catch (error) {
    // Tier 3: Interrupt para errores que requieren intervención humana
    if (isUserFixableError(error)) {
      const solution = interrupt({
        type: "error_resolution",
        error: error.message,
        suggestion: "Verificar datos del pedido"
      });

      return resolveWith(solution);
    }

    // Tier 4: Lanzar para otros errores
    throw error;
  }
}
```

---

## Roadmap de Implementación

### Fase 1: Fundamentos (Semana 1-2)
- [ ] Implementar ConvexCheckpointer
- [ ] Integrar checkpointer en graphs principales
- [ ] Migrar persistencia manual a checkpointer automático

### Fase 2: Human-in-the-Loop (Semana 2-3)
- [ ] Implementar interrupts para aprobaciones
- [ ] Crear handoff bidireccional con Command
- [ ] Agregar validación con re-interrupt loops

### Fase 3: Modularización (Semana 3-4)
- [ ] Extraer order-flow como sub-gráfico
- [ ] Extraer faq-flow como sub-gráfico
- [ ] Extraer handoff-flow como sub-gráfico

### Fase 4: Mejoras de Performance (Semana 4-5)
- [ ] Implementar ejecución en paralelo con Send API
- [ ] Agregar RetryPolicy a nodes vulnerables
- [ ] Optimizar loading paralelo de recursos

### Fase 5: Memory Avanzada (Semana 5-6)
- [ ] Implementar Store para cross-thread memory
- [ ] Agregar persistencia de preferencias de usuario
- [ ] Implementar time travel para debug

---

## Pruebas y Validación

### Testing Strategy

1. **Unit Tests**: Tests de nodes individuales
2. **Integration Tests**: Tests de flujos completos
3. **Interrupt Tests**: Tests de pausa/resume
4. **Parallel Tests**: Tests de ejecución concurrente
5. **Error Simulation Tests**: Tests de fallos controlados

### Test Cases Prioritarios

- [ ] Interrupt y resume funcionan correctamente
- [ ] Checkpointer persiste state entre invocaciones
- [ ] Parallel validation produce resultados correctos
- [ ] RetryPolicy re-intenta errores transitorios
- [ ] Handoff bidireccional funciona
- [ ] Sub-gráficos se integran correctamente

---

## Consideraciones de Producción

### Configuración de Checkpointer

```typescript
// Desarrollo
const checkpointer = new MemorySaver();

// Producción
const checkpointer = PostgresSaver.fromConnString(process.env.DATABASE_URL);
await checkpointer.setup();

// Custom con Convex (actual del proyecto)
const checkpointer = new ConvexCheckpointer(repository);
```

### Monitoreo y Observabilidad

- Continuar usando Langfuse para tracing
- Agregar métricas específicas de LangGraph
- Monitorear retry attempts y fallas
- Alertar cuando interrupt timeouts

### Seguridad

- Validar inputs en interrupts
- Rate limiting para reintentos
- Sanitizar datos en checkpoints
- Auditoría de handoffs

---

## Conclusiones

Este plan transformará RestauLang de un bot conversacional con LangGraph básico a un sistema de IA conversacional robusto con:

- Persistencia stateful automática
- Human-in-the-loop bidireccional
- Arquitectura modular y mantenible
- Performance optimizada con paralelismo
- Resiliencia con retry policies
- Memoria persistente de usuario

**Todo manteniendo el alcance actual del proyecto**: conversaciones de restaurante, toma de pedidos, FAQs, y handoff a humanos.
