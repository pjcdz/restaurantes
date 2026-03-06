# SRS v4 - Sistema de Asistente Conversacional para Restaurantes
## Resolución de Problemas Críticos Identificados en SRS v3

**Versión:** 4.0
**Fecha:** 2026-03-06
**Estado:** Enfoque en Resolución de Problemas Críticos
**Basado en:** SRS v3.8 + Resultados de Tests Langfuse (48 tests, 40% aprobación)

---

## 1. Introducción

### 1.1 Propósito
Este documento especifica las mejoras y correcciones necesarias para el **SRS v3**, basándonos en los resultados de las pruebas automatizadas con AI Judge (Langfuse). El análisis de 988 registros de pruebas reveló problemas críticos en áreas fundamentales del sistema que deben ser resueltos antes de avanzar con nuevas funcionalidades.

### 1.2 Análisis de Problemas Identificados

#### Resumen Ejecutivo de Resultados SRS v3

| Categoría | Tests | Pasaron | Fallaron | % Aprobación | Severidad |
|-----------|-------|---------|----------|--------------|-----------|
| Resilience | 5 | 5 | 0 | **100%** ✅ | Baja |
| Security | 5 | 5 | 0 | **100%** ✅ | Baja |
| Handoff | 4 | 1 | 3 | **25%** ⚠️ | Alta |
| Payment | 5 | 0 | 5 | **0%** ❌ | **CRÍTICA** |
| Edge Cases | 5 | 1 | 4 | **20%** ❌ | Media |
| Workflow | 3 | 0 | 3 | **0%** ❌ | **CRÍTICA** |
| Multi Order | 3 | 0 | 3 | **0%** ❌ | **CRÍTICA** |
| Single Order | 4 | 0 | 4 | **0%** ❌ | **CRÍTICA** |
| Menu | 4 | 2 | 2 | **50%** ⚠️ | Media |
| FAQ | 5 | 2 | 3 | **40%** ⚠️ | Media |
| Greeting | 3 | ~3 | ~0 | ~**100%** ✅ | Baja |
| **TOTAL** | **46** | **19** | **27** | **41.3%** | - |

#### Desglose por Severidad

**CRÍTICO (bloquea MVP funcional):**
- ❌ Payment (0/5): Manejo de pagos completamente no implementado
- ❌ Workflow (0/3): Fallas en mantener contexto conversacional
- ❌ Multi Order (0/3): No puede procesar pedidos múltiples
- ❌ Single Order (0/4): No puede procesar pedidos individuales

**ALTA PRIORIDAD (afecta experiencia usuario):**
- ⚠️ Handoff (1/4): Solo 25% de tests pasan, sin mecanismo claro de derivación

**MEDIA PRIORIDAD:**
- ⚠️ FAQ (2/5): Respuestas inconsistentes, falta aprovechamiento de contexto
- ⚠️ Menu (2/4): Filtrado de menú no funciona correctamente
- ⚠️ Edge Cases (1/5): Manejo de errores y cancelaciones deficiente

**BAJA PRIORIDAD:**
- ✅ Security (5/5): Excelente desempeño, no requiere cambios
- ✅ Resilience (5/5): Buen desempeño con saludo "Che" informal
- ✅ Greeting (3/3): Saludos funcionales

### 1.3 Definiciones y Acrónimos
| Término | Definición |
|---------|------------|
| SRS/ERS | Especificación de Requerimientos de Software |
| RF | Requerimiento Funcional |
| RNF | Requerimiento No Funcional |
| TBD | To Be Defined (por definir) |
| Handoff | Derivación de conversación a humano |
| StateGraph | Grafo de estados de LangGraph para orquestación de agentes |
| Checkpoint | Punto de persistencia del estado conversacional |
| AgentState | Estado del agente que viaja por los nodos de LangGraph |
| Langfuse | Plataforma de observabilidad y evaluación de IA |
| AI Judge | Agente de IA que evalúa la calidad de respuestas del sistema |
| whatsapp-cloud-inbox | Inbox open-source para gestión de conversaciones WhatsApp |

### 1.4 Referencias
- `SRS-v3-kilo.md` - Especificación base v3.8
- `langfusetests.csv` - Resultados de pruebas AI Judge (48 tests)
- `apps/restaurant-hours-api/src/langgraph/` - Implementación LangGraph actual
- `apps/restaurant-hours-api/src/judge/` - Sistema AI Judge
- https://github.com/gokapso/whatsapp-cloud-inbox - Inbox para handoff

---

## 2. Estrategia de Resolución

### 2.1 Enfoque: Priorización por Impacto de Negocio

El SRS v4 adopta un enfoque de **priorización por impacto de negocio**, enfocándose primero en resolver los problemas que bloquean la funcionalidad core del MVP:

```
CRÍTICO ────────▶ ALTA ───────▶ MEDIA ───────▶ BAJA
   │                    │                 │               │
   ▼                    ▼                 ▼               ▼
Payment/Order        Handoff            FAQ/Menu        Greeting
Workflow                                Edge Cases      Resilience
Multi Order                                                Security
```

### 2.2 Roadmap de Implementación

```
Sprint 1 (2 semanas)           Sprint 2 (2 semanas)           Sprint 3 (1 semana)
│                              │                              │
├─ Pedido Core                  ├─ Handoff                     ├─ FAQ/Menu
│  • Validación                 │  • Detección clara           │  • Filtros de menú
│  • Extracción                 │  • whatsapp-cloud-inbox      │  • Contexto FAQ
│  • Persistencia              │  • Activación IA             │  • Respuestas
│                              │                              │
                              ├─ Edge Cases                 └─ Tono Profesional
                              │  • Cancelación
                              │  • Errores técnicos
                              │  • Nonsense handling
```

---

## 3. Descripción de Soluciones por Categoría

### 3.1 PAY - Manejo de Pagos (CRÍTICO)

#### 3.1.1 Diagnóstico del Problema

**Estado actual:** 0/5 tests pasan

**Errores identificados en tests:**
- `PAY-01` (Métodos de pago): El sistema no reconoce ni responde preguntas sobre métodos de pago
- `PAY-02` (Validación de monto): No valida montos de pago
- `PAY-03` (Cálculo de cambio): No calcula vuelto
- `PAY-04` (Confirmación de pago): No confirma pagos
- `PAY-05` (Error de pago): No maneja errores de pago

**Comentarios recurrentes del AI Judge:**
- "completely fails to handle payment queries"
- "severe lack of resilience"
- "does not provide any information about payment methods"
- "fails to validate payment amounts"

#### 3.1.2 Solución Propuesta: Payment Handler Node

**Arquitectura propuesta:**

```typescript
// Nuevo nodo en LangGraph
const paymentHandlerNode: StateNode<AgentState> = async (state) => {
  // 1. Detectar si el mensaje es sobre pagos
  const paymentIntent = detectPaymentIntent(state.messages);
  if (!paymentIntent) {
    return state; // No es sobre pagos, continuar
  }

  // 2. Recuperar configuración de pagos desde Convex
  const paymentConfig = await convex.query(api.payment.getConfig);

  // 3. Generar respuesta basada en configuración
  const response = generatePaymentResponse(paymentConfig, paymentIntent);

  // 4. Actualizar estado si es parte de un pedido activo
  if (state.orderStatus === "incompleto" && paymentIntent.type === "confirmation") {
    state.customerData.montoAbono = paymentIntent.amount;
    if (state.customerData.montoAbono >= calculateTotal(state.cart)) {
      state.orderStatus = "completo";
      state.vuelto = state.customerData.montoAbono - calculateTotal(state.cart);
    }
  }

  return { ...state, response };
};
```

**Configuración de pagos en Convex:**

```typescript
// Nueva tabla en schema.ts
payment_config: defineTable({
  metodos: v.array(v.string()), // ["efectivo", "transferencia"]
  efectivoMinimo: v.number(),  // Monto mínimo para efectivo
  transferenciaBanco: v.string(), // Nombre del banco
  transferenciaAlias: v.string(), // Alias/CBU
  transferenciaCBU: v.string(), // CBU completo
  entregaPago: v.string(), // "con_entrega" | "adelantado"
}).index("by_activo", ["activo"]),
```

**Flujo de interacción:**

```
Cliente: "¿Cómo puedo pagar?"
Bot: "Aceptamos:
        • Efectivo (contra entrega o al retirar)
        • Transferencia (anticipada al [Banco] - Alias: [alias])

        Si vas a pagar en efectivo, me avisas con cuánto para calcular el vuelto."

Cliente: "Voy a pagar 20 mil"
Bot: "Perfecto. Tu pedido es $16.000.
        Pagando $20.000, tu vuelto será $4.000.

        ¿Confirmas el pedido?"
```

#### 3.1.3 Requerimientos Funcionales (PAY)

| ID | Requerimiento | Prioridad | Estado Actual | Estado Objetivo |
|----|---------------|-----------|---------------|------------------|
| PAY-RF-001 | El sistema debe informar los métodos de pago disponibles | CRÍTICA | ❌ No implementado | ✅ Implementar |
| PAY-RF-002 | El sistema debe aceptar pagos en efectivo | CRÍTICA | ❌ No implementado | ✅ Implementar |
| PAY-RF-003 | El sistema debe aceptar transferencias bancarias | CRÍTICA | ❌ No implementado | ✅ Implementar |
| PAY-RF-004 | El sistema debe validar que montoAbono >= total | CRÍTICA | ❌ No implementado | ✅ Implementar |
| PAY-RF-005 | El sistema debe calcular vuelto para pagos en efectivo | CRÍTICA | ❌ No implementado | ✅ Implementar |
| PAY-RF-006 | El sistema debe proporcionar datos bancarios para transferencias | CRÍTICA | ❌ No implementado | ✅ Implementar |
| PAY-RF-007 | El sistema debe confirmar el método de pago con el cliente | MEDIA | ❌ No implementado | ✅ Implementar |

#### 3.1.4 Implementación Prioritaria

**Tareas para Sprint 1:**

| ID | Tarea | Estimación | Dependencies |
|----|-------|-------------|---------------|
| PAY-01 | Crear tabla `payment_config` en Convex | 2h | - |
| PAY-02 | Implementar `paymentHandlerNode` en LangGraph | 4h | PAY-01 |
| PAY-03 | Integrar `paymentHandlerNode` en StateGraph | 2h | PAY-02 |
| PAY-04 | Implementar lógica de cálculo de vuelto | 2h | PAY-02 |
| PAY-05 | Agregar tests para PAY-01 a PAY-05 | 4h | PAY-03, PAY-04 |
| PAY-06 | Validar con AI Judge | 2h | PAY-05 |

**Total estimado: 16 horas (2 días)**

---

### 3.2 ORDER - Procesamiento de Pedidos (CRÍTICO)

#### 3.2.1 Diagnóstico del Problema

**Estado actual:**
- Single Order: 0/4 tests pasan
- Multi Order: 0/3 tests pasan

**Errores identificados en tests:**

**Single Order (O):**
- `O1` (Pedido simple): "completely fails to process order"
- `O2` (Pedido con cantidad): "does not handle quantity correctly"
- `O3` (Pedido con confirmación): "fails to confirm order"
- `O4` (Modificación de pedido): "cannot modify existing order"

**Multi Order (MO):**
- `MO1` (Pedido múltiple simple): "cannot process multiple items"
- `MO2` (Pedido múltiple con confirmación): "Failed after 3 attempts. Last error: Cannot connect to API: Connect Timeout Error"
- `MO3` (Modificación de pedido múltiple): "cannot modify multi-item order"

**Comentarios recurrentes del AI Judge:**
- "fails to build order state"
- "repeats error messages without progress"
- "does not maintain order context"
- "unable to extract order details"

#### 3.2.2 Solución Propuesta: Order Handler V2

**Problema raíz identificado:**
El actual `order_handler` no implementa correctamente:
1. Extracción estructurada de items del pedido
2. Acumulación del carrito entre mensajes
3. Validación de productos contra base de datos
4. Persistencia en Convex

**Arquitectura mejorada:**

```typescript
// Order Handler V2 - Mejoras significativas
const orderHandlerV2Node: StateNode<AgentState> = async (state) => {
  // 1. Recuperar menú actualizado desde Convex
  const menuItems = await convex.query(api.menu.getAvailableItems);

  // 2. Inyectar menú en contexto del LLM
  const menuContext = buildMenuContext(menuItems);

  // 3. Extracción estructurada con Zod (mejorada)
  const orderExtractionResult = await extractOrderStructured(
    state.messages,
    menuContext
  );

  // 4. Validar items contra base de datos
  const validatedItems = await validateOrderItems(
    orderExtractionResult.items,
    menuItems
  );

  // 5. Actualizar carrito (acumulativo)
  const updatedCart = updateCartAccumulatively(
    state.cart,
    validatedItems,
    orderExtractionResult.action // "add" | "remove" | "replace" | "clear"
  );

  // 6. Calcular subtotal
  const subtotal = calculateSubtotal(updatedCart);

  // 7. Actualizar estado
  return {
    ...state,
    cart: updatedCart,
    orderStatus: determineOrderStatus(state, updatedCart),
    metadata: {
      ...state.metadata,
      subtotal,
      itemCount: updatedCart.length,
    },
  };
};
```

**Esquema Zod mejorado:**

```typescript
const OrderActionSchema = z.enum(["add", "remove", "replace", "clear"]);

const OrderItemSchema = z.object({
  producto: z.string(),
  cantidad: z.number().int().positive().default(1),
});

const OrderExtractionSchema = z.object({
  action: OrderActionSchema.default("add"),
  items: z.array(OrderItemSchema).default([]),
  confirmation: z.boolean().default(false),
  cancellation: z.boolean().default(false),
});
```

**Flujo acumulativo de carrito:**

```
Mensaje 1: "Quiero 2 hamburguesas"
Bot: "Anotado: 2 hamburguesas ($14.000). ¿Algo más?"
Carrito: [{producto: "Hamburguesa", cantidad: 2, precio: 7000}]

Mensaje 2: "Agregá también papas"
Bot: "¡Listo! Agregué papas ($3.000).
        Tu pedido ahora: 2 hamburguesas + papas ($17.000 total)."
Carrito: [
  {producto: "Hamburguesa", cantidad: 2, precio: 7000},
  {producto: "Papas", cantidad: 1, precio: 3000}
]

Mensaje 3: "En realidad no quiero papas"
Bot: "Entendido. Quito las papas.
        Tu pedido: 2 hamburguesas ($14.000 total)."
Carrito: [{producto: "Hamburguesa", cantidad: 2, precio: 7000}]
```

#### 3.2.3 Requerimientos Funcionales (ORDER)

| ID | Requerimiento | Prioridad | Estado Actual | Estado Objetivo |
|----|---------------|-----------|---------------|------------------|
| ORD-RF-001 | El sistema debe extraer items del pedido usando Zod | CRÍTICA | ⚠️ Parcial | ✅ Mejorar |
| ORD-RF-002 | El sistema debe validar items contra tabla `Precios` | CRÍTICA | ✅ Implementado | ✅ Mantener |
| ORD-RF-003 | El sistema debe acumular items en el carrito entre mensajes | CRÍTICA | ❌ No implementado | ✅ Implementar |
| ORD-RF-004 | El sistema debe soportar acciones: add, remove, replace, clear | CRÍTICA | ❌ No implementado | ✅ Implementar |
| ORD-RF-005 | El sistema debe calcular subtotal del carrito | CRÍTICA | ✅ Implementado | ✅ Mantener |
| ORD-RF-006 | El sistema debe resumir el carrito al cliente | MEDIA | ⚠️ Parcial | ✅ Mejorar |
| ORD-RF-007 | El sistema debe persistir el pedido en Convex al confirmar | CRÍTICA | ✅ Implementado | ✅ Mantener |

#### 3.2.4 Implementación Prioritaria

**Tareas para Sprint 1:**

| ID | Tarea | Estimación | Dependencies |
|----|-------|-------------|---------------|
| ORD-01 | Actualizar esquema Zod para soportar acciones | 2h | - |
| ORD-02 | Implementar `updateCartAccumulatively` | 4h | ORD-01 |
| ORD-03 | Reescribir `orderHandlerNode` con lógica acumulativa | 6h | ORD-02 |
| ORD-04 | Implementar resumen de carrito en `format_response` | 2h | ORD-03 |
| ORD-05 | Agregar tests para O1-O4 y MO1-MO3 | 4h | ORD-04 |
| ORD-06 | Validar con AI Judge | 2h | ORD-05 |

**Total estimado: 20 horas (2.5 días)**

---

### 3.3 WORKFLOW - Flujos Complejos (CRÍTICO)

#### 3.3.1 Diagnóstico del Problema

**Estado actual:** 0/3 tests pasan

**Errores identificados en tests:**
- `W1` (Flujo completo): "fails to maintain conversation context"
- `W2` (Multi-turno): "loses state between messages"
- `W3` (Correcciones): "cannot handle user corrections"

**Comentarios recurrentes del AI Judge:**
- "fails to maintain context in multi-turn conversations"
- "conversation state is lost between messages"
- "unable to handle user corrections mid-flow"

#### 3.3.2 Solución Propuesta: Checkpointer Mejorado

**Problema raíz identificado:**
El checkpointer actual de LangGraph no está persistiendo correctamente el estado en Convex entre mensajes.

**Arquitectura de Checkpointer V2:**

```typescript
// Nuevo checkpointer con mejor manejo de estado
const ConvexCheckpointerV2: Checkpointer = {
  async get(configurable) {
    const { thread_id, checkpoint_ns } = configurable;

    // Buscar checkpoint más reciente
    const checkpoint = await convex.query(api.checkpoints.getLatest, {
      threadId: thread_id,
      namespace: checkpoint_ns,
    });

    if (!checkpoint) {
      return null;
    }

    return {
      config: configurable,
      ts: checkpoint.ts,
      id: checkpoint.id,
      channel_values: JSON.parse(checkpoint.data),
      channel_versions: JSON.parse(checkpoint.versions),
      versions_seen: JSON.parse(checkpoint.versionsSeen),
      pending_sends: [],
    };
  },

  async put(configurable, checkpoint, metadata) {
    await convex.mutation(api.checkpoints.save, {
      threadId: configurable.thread_id,
      namespace: configurable.checkpoint_ns,
      ts: checkpoint.ts,
      id: checkpoint.id,
      data: JSON.stringify(checkpoint.channel_values),
      versions: JSON.stringify(checkpoint.channel_versions),
      versionsSeen: JSON.stringify(checkpoint.versionsSeen),
      metadata,
    });
  },

  async list(configurable, options) {
    return await convex.query(api.checkpoints.list, {
      threadId: configurable.thread_id,
      namespace: configurable.checkpoint_ns,
      limit: options?.limit,
      before: options?.before,
    });
  },
};
```

**Mejoras en el StateGraph:**

```typescript
// Configurar checkpointer V2 en StateGraph
const graph = new StateGraph<AgentState>({
  checkpointer: ConvexCheckpointerV2,
  interruptAfter: ["handoff_node"], // Solo interrumpir en handoff
});

// Forzar checkpoint después de cada nodo crítico
graph.setCheckpointBefore(["order_handler", "payment_handler", "handoff_node"]);
graph.setCheckpointAfter(["order_handler", "payment_handler", "handoff_node"]);
```

#### 3.3.3 Requerimientos Funcionales (WORKFLOW)

| ID | Requerimiento | Prioridad | Estado Actual | Estado Objetivo |
|----|---------------|-----------|---------------|------------------|
| WRK-RF-001 | El sistema debe persistir el estado en Convex después de cada mensaje | CRÍTICA | ❌ No implementado | ✅ Implementar |
| WRK-RF-002 | El sistema debe recuperar el estado correcto para cada mensaje | CRÍTICA | ⚠️ Parcial | ✅ Mejorar |
| WRK-RF-003 | El sistema debe mantener el carrito entre mensajes | CRÍTICA | ❌ No implementado | ✅ Implementar |
| WRK-RF-004 | El sistema debe permitir correcciones del usuario | CRÍTICA | ❌ No implementado | ✅ Implementar |

#### 3.3.4 Implementación Prioritaria

**Tareas para Sprint 1:**

| ID | Tarea | Estimación | Dependencies |
|----|-------|-------------|---------------|
| WRK-01 | Crear tabla mejorada `checkpoints` en Convex | 2h | - |
| WRK-02 | Implementar `ConvexCheckpointerV2` | 6h | WRK-01 |
| WRK-03 | Integrar checkpointer V2 en StateGraph | 2h | WRK-02 |
| WRK-04 | Configurar checkpoints estratégicos en el grafo | 2h | WRK-03 |
| WRK-05 | Agregar tests para W1-W3 | 4h | WRK-04 |
| WRK-06 | Validar con AI Judge | 2h | WRK-05 |

**Total estimado: 18 horas (2.25 días)**

---

### 3.4 HANDOFF - Derivación a Humano (ALTA PRIORIDAD)

#### 3.4.1 Diagnóstico del Problema

**Estado actual:** 1/4 tests pasan (25%)

**Errores identificados en tests:**
- `HANDOFF-01` (Solicitud explícita): "does not provide handoff mechanism"
- `HANDOFF-02` (Frustración detectada): "fails to detect user frustration"
- `HANDOFF-03` (Queja): "successfully hands off" ✅ (único que pasa)
- `HANDOFF-04` (Reactivación): "cannot reactivate AI after handoff"

**Comentarios recurrentes del AI Judge:**
- "no clear path to escalate to human"
- "does not provide mechanism for handoff"
- "fails to integrate whatsapp-cloud-inbox"
- "cannot transfer control to human operator"

#### 3.4.2 Solución Propuesta: Handoff Completo

**Arquitectura propuesta:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HANDOFF FLOW COMPLETO                                    │
└─────────────────────────────────────────────────────────────────────────────┘

1. DETECCIÓN DE TRIGGER
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Triggers:                                                               │
   │ • Palabras clave: "humano", "operador", "hablar con alguien"          │
   │ • Sentimiento negativo (frustración/enojo)                             │
   │ • Repetición de errores (>3 veces mismo error)                          │
   │ • Solicitud explícita: "quiero hablar con alguien"                     │
   └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
2. ACTUALIZACIÓN DE ESTADO
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Update Convex session:                                                  │
   │ status: "handed_off"                                                    │
   │ handoffReason: "user_requested" | "frustration_detected"               │
   │ handedOffAt: timestamp                                                   │
   └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
3. NOTIFICACIÓN AL ADMIN (whatsapp-cloud-inbox)
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ POST /api/handoff/notify                                               │
   │ {                                                                      │
   │   sessionId: "...",                                                     │
   │   chatId: "...",                                                       │
   │   reason: "user_requested",                                             │
   │   lastMessages: [...],                                                  │
   │   orderState: {...}                                                    │
   │ }                                                                      │
   └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
4. GESTIÓN EN INBOX (/admin)
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ • Operador ve conversación en inbox                                     │
   │ • Historial completo cargado desde Convex                                │
   │ • Puede responder directamente al cliente                               │
   └─────────────────────────────────────────────────────────────────────────┘
                                     │
                                     ▼
5. REACTIVACIÓN DE IA
   ┌─────────────────────────────────────────────────────────────────────────┐
   │ Botón "Reactivar IA" en inbox                                         │
   │ Update Convex session:                                                  │
   │ status: "active"                                                        │
   └─────────────────────────────────────────────────────────────────────────┘
```

**Implementación del Handoff Node:**

```typescript
const handoffNode: StateNode<AgentState> = async (state) => {
  // 1. Analizar trigger de handoff
  const handoffTrigger = await detectHandoffTrigger(state.messages);

  if (!handoffTrigger.shouldHandoff) {
    return state; // No se requiere handoff
  }

  // 2. Actualizar sesión en Convex
  await convex.mutation(api.sessions.updateStatus, {
    sessionId: state.metadata.sessionId,
    status: "handed_off",
    handoffReason: handoffTrigger.reason,
  });

  // 3. Notificar al inbox (whatsapp-cloud-inbox)
  await notifyInbox({
    sessionId: state.metadata.sessionId,
    chatId: state.metadata.chatId,
    reason: handoffTrigger.reason,
    messages: state.messages,
    orderState: {
      cart: state.cart,
      customerData: state.customerData,
      orderStatus: state.orderStatus,
    },
  });

  // 4. Generar respuesta final al usuario
  const response = generateHandoffResponse(handoffTrigger);

  return {
    ...state,
    response,
    metadata: {
      ...state.metadata,
      handedOff: true,
      handoffReason: handoffTrigger.reason,
    },
  };
};
```

**Detección de triggers de handoff:**

```typescript
async function detectHandoffTrigger(messages: BaseMessage[]): Promise<{
  shouldHandoff: boolean;
  reason: "explicit_request" | "frustration" | "error_repetition" | "complaint";
  confidence: number;
}> {
  const lastMessage = messages[messages.length - 1];

  // 1. Palabras clave explícitas
  const explicitKeywords = [
    "humano", "operador", "hablar con alguien",
    "persona", "atención", "supervisor"
  ];

  if (containsAny(lastMessage.content, explicitKeywords)) {
    return { shouldHandoff: true, reason: "explicit_request", confidence: 0.95 };
  }

  // 2. Detección de queja/frustración
  const sentiment = await analyzeSentiment(lastMessage.content);
  if (sentiment === "negative" && sentiment.confidence > 0.8) {
    return { shouldHandoff: true, reason: "frustration", confidence: 0.85 };
  }

  // 3. Repetición de errores
  const errorCount = countRecentErrors(messages, 3); // últimos 3 mensajes
  if (errorCount >= 2) {
    return { shouldHandoff: true, reason: "error_repetition", confidence: 0.75 };
  }

  // 4. Queja detectada por clasificador de intenciones
  const intent = await classifyIntent(lastMessage.content);
  if (intent === "complaint") {
    return { shouldHandoff: true, reason: "complaint", confidence: 0.9 };
  }

  return { shouldHandoff: false, reason: "complaint", confidence: 0 };
}
```

#### 3.4.3 Requerimientos Funcionales (HANDOFF)

| ID | Requerimiento | Prioridad | Estado Actual | Estado Objetivo |
|----|---------------|-----------|---------------|------------------|
| HND-RF-001 | El sistema debe detectar solicitudes explícitas de handoff | ALTA | ❌ No implementado | ✅ Implementar |
| HND-RF-002 | El sistema debe detectar frustración del usuario | ALTA | ⚠️ Parcial | ✅ Mejorar |
| HND-RF-003 | El sistema debe actualizar estado a "handed_off" en Convex | ALTA | ❌ No implementado | ✅ Implementar |
| HND-RF-004 | El sistema debe notificar al inbox (whatsapp-cloud-inbox) | ALTA | ❌ No implementado | ✅ Implementar |
| HND-RF-005 | El bot debe ignorar mensajes cuando status es "handed_off" | ALTA | ✅ Implementado | ✅ Mantener |
| HND-RF-006 | El sistema debe permitir reactivación de IA desde inbox | MEDIA | ❌ No implementado | ✅ Implementar |
| HND-RF-007 | El inbox debe mostrar historial completo de conversación | MEDIA | ⚠️ Parcial | ✅ Mejorar |

#### 3.4.4 Implementación Prioritaria

**Tareas para Sprint 2:**

| ID | Tarea | Estimación | Dependencies |
|----|-------|-------------|---------------|
| HND-01 | Implementar `detectHandoffTrigger` | 4h | - |
| HND-02 | Actualizar tabla `sessions` con campos de handoff | 2h | - |
| HND-03 | Implementar `handoffNode` completo | 6h | HND-01, HND-02 |
| HND-04 | Integrar whatsapp-cloud-inbox en `/admin` | 8h | HND-03 |
| HND-05 | Implementar notificación de handoff | 4h | HND-04 |
| HND-06 | Implementar reactivación de IA desde inbox | 4h | HND-05 |
| HND-07 | Agregar tests para HANDOFF-01 a HANDOFF-04 | 4h | HND-06 |
| HND-08 | Validar con AI Judge | 2h | HND-07 |

**Total estimado: 34 horas (4.25 días)**

---

### 3.5 FAQ/EDGE - FAQ y Casos Extremos (MEDIA PRIORIDAD)

#### 3.5.1 Diagnóstico del Problema

**FAQ:**
- Estado actual: 2/5 tests pasan (40%)
- `F1` (Horarios): "doesn't directly state the hours, pivots to menu"
- `F2` (Mercado Pago): "correctly answers but then unnecessarily lists the menu"
- `F3` (Menú completo): "fails to leverage FAQ context for delivery radius"
- `F4` (Delivery): "lists entire menu, irrelevant to delivery question"
- `F5` (Vegetarianos): ✅ Pasa

**Edge Cases:**
- Estado actual: 1/5 tests pasan (20%)
- `E1` (Nonsense): ✅ Pasa (maneja bien entradas nonsense)
- `E2` (Cancelación): "cannot handle order cancellation"
- `E3` (Error técnico): "repeats error without progress"
- `E4` (Ambigüedad): "fails to clarify ambiguous requests"
- `E5` (Cambio de tema): "cannot handle topic change mid-order"

**Comentarios recurrentes del AI Judge:**
- "doesn't leverage FAQ context"
- "unnecessarily lists the menu"
- "fails to clarify"
- "repeats error messages"

#### 3.5.2 Solución Propuesta: FAQ Handler Mejorado

**Arquitectura mejorada:**

```typescript
const faqHandlerV2Node: StateNode<AgentState> = async (state) => {
  // 1. Clasificar tipo de FAQ
  const faqType = await classifyFAQType(state.messages);

  // 2. Recuperar FAQ relevante desde Convex
  const relevantFAQ = await convex.query(api.faq.getByTopic, {
    topic: faqType.topic,
  });

  // 3. Generar respuesta contextualizada
  const response = await generateContextualFAQResponse({
    faq: relevantFAQ,
    userMessage: state.messages[state.messages.length - 1],
    conversationContext: state.messages,
    orderState: state.orderStatus === "incompleto" ? {
      hasActiveOrder: true,
      cart: state.cart,
    } : { hasActiveOrder: false },
  });

  // 4. NO listamos el menú a menos que se solicite explícitamente
  return { ...state, response };
};
```

**Prompt mejorado para FAQ:**

```typescript
const FAQ_RESPONSE_PROMPT = `Eres un asistente de un restaurante.

CONTEXTO IMPORTANTE:
- SOLO respondes a la pregunta del usuario
- NO listas el menú a menos que el usuario lo solicite explícitamente
- Si hay un pedido activo en curso, prioriza completarlo antes de ofrecer nuevos productos
- Las respuestas deben ser breves y directas

PREGUNTA DEL USUARIO: {userMessage}

INFORMACIÓN DE FAQ: {faqData}

ESTADO DEL PEDIDO: {orderState}

Instrucciones:
1. Responde directamente a la pregunta usando la información de FAQ
2. Si no hay información en FAQ, indica que no tienes esa información
3. NO ofrezcas productos ni listes el menú a menos que se solicite
4. Si hay un pedido en curso, prioriza completarlo`;
```

#### 3.5.3 Solución Propuesta: Edge Cases Handler

**Nuevo nodo para manejo de casos extremos:**

```typescript
const edgeCaseHandlerNode: StateNode<AgentState> = async (state) => {
  const lastMessage = state.messages[state.messages.length - 1];

  // 1. Detectar tipo de caso extremo
  const edgeCaseType = await detectEdgeCaseType(lastMessage.content);

  switch (edgeCaseType) {
    case "cancellation":
      return handleOrderCancellation(state);
    case "technical_error":
      return handleTechnicalError(state);
    case "ambiguity":
      return handleAmbiguity(state);
    case "topic_change":
      return handleTopicChange(state);
    case "nonsense":
      return handleNonsense(state);
    default:
      return state; // No es un caso extremo
  }
};

async function handleOrderCancellation(state: AgentState) {
  // 1. Confirmar cancelación con el usuario
  const confirmResponse = "¿Estás seguro de que quieres cancelar tu pedido?";
  await sendMessage(state.metadata.chatId, confirmResponse);

  // 2. Marcar pedido como cancelado en Convex
  if (state.metadata.orderId) {
    await convex.mutation(api.pedidos.cancel, {
      orderId: state.metadata.orderId,
      reason: "user_requested",
    });
  }

  // 3. Limpiar estado
  return {
    ...state,
    cart: [],
    customerData: {},
    orderStatus: "cancelado",
  };
}

async function handleTechnicalError(state: AgentState) {
  const errorCount = state.metadata.errorCount || 0;

  if (errorCount >= 3) {
    // 3 o más errores: derivar a humano
    return handoffNode(state);
  }

  // Responder con mensaje diferente al error anterior
  const errorMessages = [
    "Lo siento, tuve un problema. ¿Podrías reformular tu pedido?",
    "Hubo un error técnico. ¿Podrías intentarlo de nuevo de otra manera?",
    "Estoy teniendo dificultades. Si prefieres, puedo conectarte con un operador.",
  ];

  return {
    ...state,
    response: errorMessages[errorCount],
    metadata: {
      ...state.metadata,
      errorCount: errorCount + 1,
    },
  };
}

async function handleAmbiguity(state: AgentState) {
  const lastMessage = state.messages[state.messages.length - 1];
  const ambiguity = await detectAmbiguity(lastMessage.content);

  return {
    ...state,
    response: `No estoy seguro de lo que quieres decir con "${ambiguity.ambiguousPhrase}".
    ¿Podrías aclarar?
    ${ambiguity.suggestions ? `Quizás quisiste decir: ${ambiguity.suggestions.join(", ")}` : ""}`,
  };
}

async function handleTopicChange(state: AgentState) {
  if (state.orderStatus === "incompleto" && state.cart.length > 0) {
    return {
      ...state,
      response: `Tienes un pedido en progreso (${state.cart.length} items).
      ¿Quieres continuar con el pedido o quieres comenzar de nuevo?`,
    };
  }

  return state; // No hay pedido activo, permitir cambio de tema
}
```

#### 3.5.4 Requerimientos Funcionales (FAQ/EDGE)

| ID | Requerimiento | Prioridad | Estado Actual | Estado Objetivo |
|----|---------------|-----------|---------------|------------------|
| FAQ-RF-001 | El sistema debe responder preguntas de FAQ sin listar menú | MEDIA | ❌ No implementado | ✅ Implementar |
| FAQ-RF-002 | El sistema debe aprovechar el contexto de FAQ disponible | MEDIA | ❌ No implementado | ✅ Implementar |
| FAQ-RF-003 | El sistema debe priorizar completar pedidos activos | MEDIA | ❌ No implementado | ✅ Implementar |
| EDGE-RF-001 | El sistema debe manejar cancelaciones de pedidos | MEDIA | ❌ No implementado | ✅ Implementar |
| EDGE-RF-002 | El sistema debe manejar errores técnicos con mensajes distintos | MEDIA | ❌ No implementado | ✅ Implementar |
| EDGE-RF-003 | El sistema debe derivar a humano tras 3+ errores | MEDIA | ❌ No implementado | ✅ Implementar |
| EDGE-RF-004 | El sistema debe aclarar ambigüedades | MEDIA | ❌ No implementado | ✅ Implementar |
| EDGE-RF-005 | El sistema debe confirmar cambio de tema durante pedido | MEDIA | ❌ No implementado | ✅ Implementar |

#### 3.5.5 Implementación Prioritaria

**Tareas para Sprint 3:**

| ID | Tarea | Estimación | Dependencies |
|----|-------|-------------|---------------|
| FAQ-01 | Actualizar `faqHandlerNode` con lógica mejorada | 4h | - |
| FAQ-02 | Implementar prompt mejorado para FAQ | 2h | FAQ-01 |
| FAQ-03 | Crear `edgeCaseHandlerNode` | 6h | - |
| FAQ-04 | Implementar handlers de casos extremos | 4h | FAQ-03 |
| FAQ-05 | Integrar `edgeCaseHandlerNode` en StateGraph | 2h | FAQ-04 |
| FAQ-06 | Agregar tests para F1-F5 y E1-E5 | 4h | FAQ-02, FAQ-05 |
| FAQ-07 | Validar con AI Judge | 2h | FAQ-06 |

**Total estimado: 24 horas (3 días)**

---

### 3.6 TONO - Profesionalización del Tono (BAJA PRIORIDAD)

#### 3.6.1 Diagnóstico del Problema

**Comentarios recurrentes del AI Judge:**
- "tone is too informal ('Che')"
- "might not be suitable for all users"
- "a bit too informal"

#### 3.6.2 Solución Propuesta

**Actualizar prompt de formato de respuestas:**

```typescript
const RESPONSE_FORMAT_PROMPT = `Eres un asistente conversacional profesional de un restaurante.

TONO Y ESTILO:
- Profesional pero amigable
- NO uses saludos informales como "Che" o similares
- Usa "¡Hola!", "Buenos días", "Buenas tardes" como saludos
- Sé cortés y empático
- Usa lenguaje claro y directo

Ejemplos de tono CORRECTO:
✅ "¡Hola! Bienvenido a RestauLang. ¿En qué puedo ayudarte?"
✅ "Perfecto, anoté tu pedido. ¿Algo más?"
✅ "Entendido, voy a cambiar eso por ti."

Ejemplos de tono INCORRECTO:
❌ "¡Che! Bienvenido"
❌ "Dale, ya está"
❌ "Che, no entendí"

Formatea la respuesta del sistema: {systemResponse}`;
```

#### 3.6.3 Requerimientos Funcionales (TONO)

| ID | Requerimiento | Prioridad | Estado Actual | Estado Objetivo |
|----|---------------|-----------|---------------|------------------|
| TON-RF-001 | El sistema debe usar un tono profesional | BAJA | ❌ No implementado | ✅ Implementar |
| TON-RF-002 | El sistema debe evitar saludos informales como "Che" | BAJA | ❌ No implementado | ✅ Implementar |

#### 3.6.4 Implementación Prioritaria

**Tareas para Sprint 3:**

| ID | Tarea | Estimación | Dependencies |
|----|-------|-------------|---------------|
| TON-01 | Actualizar prompt de formato de respuestas | 1h | - |
| TON-02 | Revisar todas las respuestas del sistema | 2h | TON-01 |
| TON-03 | Validar con AI Judge | 1h | TON-02 |

**Total estimado: 4 horas (0.5 días)**

---

## 4. Plan de Implementación (Sprints)

### 4.1 Sprint 1: Core de Pedidos (2 semanas)

**Objetivo:** Resolver los problemas críticos de Payment, Order y Workflow

| ID | Tarea | Estimación | Prioridad |
|----|-------|-------------|-----------|
| PAY-01 | Crear tabla `payment_config` en Convex | 2h | CRÍTICA |
| PAY-02 | Implementar `paymentHandlerNode` en LangGraph | 4h | CRÍTICA |
| PAY-03 | Integrar `paymentHandlerNode` en StateGraph | 2h | CRÍTICA |
| PAY-04 | Implementar lógica de cálculo de vuelto | 2h | CRÍTICA |
| PAY-05 | Agregar tests para PAY-01 a PAY-05 | 4h | CRÍTICA |
| PAY-06 | Validar con AI Judge | 2h | CRÍTICA |
| ORD-01 | Actualizar esquema Zod para soportar acciones | 2h | CRÍTICA |
| ORD-02 | Implementar `updateCartAccumulatively` | 4h | CRÍTICA |
| ORD-03 | Reescribir `orderHandlerNode` con lógica acumulativa | 6h | CRÍTICA |
| ORD-04 | Implementar resumen de carrito en `format_response` | 2h | CRÍTICA |
| ORD-05 | Agregar tests para O1-O4 y MO1-MO3 | 4h | CRÍTICA |
| ORD-06 | Validar con AI Judge | 2h | CRÍTICA |
| WRK-01 | Crear tabla mejorada `checkpoints` en Convex | 2h | CRÍTICA |
| WRK-02 | Implementar `ConvexCheckpointerV2` | 6h | CRÍTICA |
| WRK-03 | Integrar checkpointer V2 en StateGraph | 2h | CRÍTICA |
| WRK-04 | Configurar checkpoints estratégicos en el grafo | 2h | CRÍTICA |
| WRK-05 | Agregar tests para W1-W3 | 4h | CRÍTICA |
| WRK-06 | Validar con AI Judge | 2h | CRÍTICA |

**Total Sprint 1:** 54 horas (6.75 días hábiles)

**Objetivo de tests:** 19/46 → 36/46 (78% aprobación)

---

### 4.2 Sprint 2: Handoff y Mejoras (2 semanas)

**Objetivo:** Implementar handoff completo y mejoras de UX

| ID | Tarea | Estimación | Prioridad |
|----|-------|-------------|-----------|
| HND-01 | Implementar `detectHandoffTrigger` | 4h | ALTA |
| HND-02 | Actualizar tabla `sessions` con campos de handoff | 2h | ALTA |
| HND-03 | Implementar `handoffNode` completo | 6h | ALTA |
| HND-04 | Integrar whatsapp-cloud-inbox en `/admin` | 8h | ALTA |
| HND-05 | Implementar notificación de handoff | 4h | ALTA |
| HND-06 | Implementar reactivación de IA desde inbox | 4h | MEDIA |
| HND-07 | Agregar tests para HANDOFF-01 a HANDOFF-04 | 4h | ALTA |
| HND-08 | Validar con AI Judge | 2h | ALTA |

**Total Sprint 2:** 34 horas (4.25 días hábiles)

**Objetivo de tests:** 36/46 → 40/46 (87% aprobación)

---

### 4.3 Sprint 3: FAQ, Edge Cases y Tono (1 semana)

**Objetivo:** Resolver problemas de media prioridad y profesionalizar el tono

| ID | Tarea | Estimación | Prioridad |
|----|-------|-------------|-----------|
| FAQ-01 | Actualizar `faqHandlerNode` con lógica mejorada | 4h | MEDIA |
| FAQ-02 | Implementar prompt mejorado para FAQ | 2h | MEDIA |
| FAQ-03 | Crear `edgeCaseHandlerNode` | 6h | MEDIA |
| FAQ-04 | Implementar handlers de casos extremos | 4h | MEDIA |
| FAQ-05 | Integrar `edgeCaseHandlerNode` en StateGraph | 2h | MEDIA |
| FAQ-06 | Agregar tests para F1-F5 y E1-E5 | 4h | MEDIA |
| FAQ-07 | Validar con AI Judge | 2h | MEDIA |
| TON-01 | Actualizar prompt de formato de respuestas | 1h | BAJA |
| TON-02 | Revisar todas las respuestas del sistema | 2h | BAJA |
| TON-03 | Validar con AI Judge | 1h | BAJA |

**Total Sprint 3:** 28 horas (3.5 días hábiles)

**Objetivo de tests:** 40/46 → 44/46 (96% aprobación)

---

## 5. Requerimientos Funcionales (RF) - Completos

### 5.1 Recepción y Contexto
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-001 | El sistema debe recibir mensajes entrantes desde Telegram | Alta | ✅ | ✅ |
| RF-002 | El sistema debe extraer identificador del cliente (`chat_id`) | Alta | ✅ | ✅ |
| RF-003 | El sistema debe buscar sesión existente por chat_id en Convex | Alta | ✅ | ✅ |
| RF-004 | Si no existe sesión, el sistema debe crear registro inicial en Convex | Alta | ✅ | ✅ |
| RF-005 | El sistema debe mantener memoria conversacional via checkpoints en Convex | Alta | ✅ | ✅ (mejorado) |
| RF-006 | Si la sesión tiene status "handed_off", el bot debe ignorar el mensaje | Alta | ✅ | ✅ |

### 5.2 Orquestación de Intenciones
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-007 | El sistema debe clasificar la consulta en: greeting, FAQ, order, complaint | Alta | ✅ | ✅ |
| RF-008 | El sistema debe enrutar al subflujo FAQ para menú/consultas | Alta | ✅ | ✅ |
| RF-009 | El sistema debe enrutar al subflujo Pedidos para intenciones de compra | Alta | ✅ | ✅ |
| RF-010 | El sistema debe derivar a humano ante queja (handoff_node) | Alta | ⚠️ | ✅ (Sprint 2) |

### 5.3 Consultas (Subflujo FAQ)
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-011 | El sistema debe consultar tablas `Menu` y `FAQ` según la intención | Alta | ✅ | ✅ |
| RF-012 | Ante consulta compuesta, debe poder consultar múltiples fuentes | Media | ✅ | ✅ |
| RF-013 | Si no hay datos, debe retornar señal `DATO_NO_ENCONTRADO` sin inventar | Alta | ✅ | ✅ |
| RF-014 | El sistema debe informar que solo acepta efectivo ante consultas de pago | Alta | ⚠️ | ✅ (Sprint 1) |
| RF-015 | El sistema debe responder FAQ sin listar menú innecesariamente | Media | ❌ | ✅ (Sprint 3) |

### 5.4 Gestión de Pedidos (Subflujo Order)
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-016 | El sistema debe construir estado acumulado del pedido | Alta | ⚠️ | ✅ (Sprint 1) |
| RF-017 | El sistema debe validar productos contra tabla `Precios` con Zod | Alta | ✅ | ✅ |
| RF-018 | El sistema debe inferir "Retiro en sucursal" cuando detecte intención pickup | Media | ✅ | ✅ |
| RF-019 | Si no se especifica cantidad, asumir cantidad = 1 | Media | ✅ | ✅ |
| RF-020 | El sistema debe calcular total = precio_unitario × cantidad | Alta | ✅ | ✅ |
| RF-021 | El sistema debe marcar pedido como `completo`, `incompleto` o `error_producto` | Alta | ✅ | ✅ |
| RF-022 | El sistema debe identificar campos faltantes y solicitarlos | Alta | ✅ | ✅ |
| RF-023 | Solo con estado `completo`, actualizar tabla `Pedidos` | Alta | ✅ | ✅ |
| RF-024 | El sistema debe soportar acciones en el carrito: add, remove, replace, clear | Alta | ❌ | ✅ (Sprint 1) |
| RF-025 | El sistema debe resumir el carrito al cliente | Media | ⚠️ | ✅ (Sprint 1) |

### 5.5 Logística y Pago
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-026 | El sistema debe solicitar tipo de entrega (delivery/pickup) | Alta | ✅ | ✅ |
| RF-027 | Si es delivery, el sistema debe solicitar dirección | Alta | ✅ | ✅ |
| RF-028 | El sistema debe calcular costo de envío si aplica | Media | ❌ | ⚠️ (pendiente) |
| RF-029 | El sistema debe informar métodos de pago disponibles | CRÍTICA | ❌ | ✅ (Sprint 1) |
| RF-030 | El sistema debe aceptar pagos en efectivo | CRÍTICA | ❌ | ✅ (Sprint 1) |
| RF-031 | El sistema debe aceptar transferencias bancarias | CRÍTICA | ❌ | ✅ (Sprint 1) |
| RF-032 | El sistema debe preguntar con cuánto va a pagar el cliente | Alta | ⚠️ | ✅ (Sprint 1) |
| RF-033 | El sistema debe validar que montoAbono >= total | CRÍTICA | ❌ | ✅ (Sprint 1) |
| RF-034 | El sistema debe calcular vuelto = montoAbono - total | CRÍTICA | ❌ | ✅ (Sprint 1) |
| RF-035 | El sistema debe proporcionar datos bancarios para transferencias | CRÍTICA | ❌ | ✅ (Sprint 1) |

### 5.6 Redacción y Respuesta
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-036 | El sistema debe transformar salida técnica en respuesta legible | Alta | ✅ | ✅ |
| RF-037 | La redacción debe respetar instrucciones del agente de control | Alta | ✅ | ✅ |
| RF-038 | El sistema debe enviar respuesta al mismo chat de origen | Alta | ✅ | ✅ |
| RF-039 | El sistema debe usar un tono profesional sin "Che" | Baja | ❌ | ✅ (Sprint 3) |

### 5.7 Handoff y Administración
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-040 | El sistema debe integrar whatsapp-cloud-inbox en /admin para handoff | Alta | ⚠️ | ✅ (Sprint 2) |
| RF-041 | Los operadores deben poder ver historial de conversaciones derivadas | Alta | ⚠️ | ✅ (Sprint 2) |
| RF-042 | Los operadores deben poder reactivar la IA después de handoff | Media | ❌ | ✅ (Sprint 2) |
| RF-043 | El admin debe poder gestionar productos (CRUD) desde /admin | Alta | ✅ | ✅ |
| RF-044 | El admin debe poder gestionar FAQ (CRUD) desde /admin | Alta | ✅ | ✅ |

### 5.8 Casos Extremos
| ID | Requerimiento | Prioridad | Estado v3 | Estado v4 |
|----|---------------|-----------|-----------|-----------|
| RF-045 | El sistema debe manejar cancelaciones de pedidos | Media | ❌ | ✅ (Sprint 3) |
| RF-046 | El sistema debe manejar errores técnicos con mensajes distintos | Media | ❌ | ✅ (Sprint 3) |
| RF-047 | El sistema debe derivar a humano tras 3+ errores | Media | ❌ | ✅ (Sprint 3) |
| RF-048 | El sistema debe aclarar ambigüedades | Media | ❌ | ✅ (Sprint 3) |
| RF-049 | El sistema debe confirmar cambio de tema durante pedido | Media | ❌ | ✅ (Sprint 3) |

---

## 6. Requerimientos No Funcionales (RNF)

### 6.1 Seguridad y Privacidad
| ID | Requerimiento | Clasificación | Estado |
|----|---------------|---------------|--------|
| RNF-001 | Las credenciales API no deben exponerse en respuestas | Restricción Externa | ✅ |
| RNF-002 | Minimizar exposición de datos personales | Restricción Externa | ✅ |
| RNF-003 | Las respuestas no deben filtrar estructura interna | Restricción del Producto | ✅ |

### 6.2 Calidad de Información
| ID | Requerimiento | Clasificación | Estado |
|----|---------------|---------------|--------|
| RNF-004 | El sistema NO debe inventar productos, precios, horarios | Restricción del Producto | ✅ |
| RNF-005 | Las respuestas deben ser consistentes con datos de Convex | Restricción del Producto | ✅ |
| RNF-006 | Validación estricta con Zod para evitar alucinaciones | Restricción del Producto | ✅ |

### 6.3 Rendimiento y Disponibilidad
| ID | Requerimiento | Clasificación | Estado |
|----|---------------|---------------|--------|
| RNF-007 | Tiempo de respuesta ≤10s (P95) | Restricción del Producto | ✅ |
| RNF-008 | Tolerar mensajes consecutivos sin corromper estado | Restricción del Producto | ⚠️ (mejorar en Sprint 1) |
| RNF-009 | Checkpoints frecuentes para preservar contexto | Restricción del Producto | ⚠️ (mejorar en Sprint 1) |

### 6.4 Mantenibilidad
| ID | Requerimiento | Clasificación | Estado |
|----|---------------|---------------|--------|
| RNF-010 | Prompts versionados en Git | Restricción Organizacional | ✅ |
| RNF-011 | Requerimientos trazables hasta pruebas | Restricción Organizacional | ✅ |
| RNF-012 | Tests automatizados con AI Judge | Restricción Organizacional | ✅ |

### 6.5 Observabilidad
| ID | Requerimiento | Clasificación | Estado |
|----|---------------|---------------|--------|
| RNF-013 | Trazas en Langfuse (si está configurado) | Restricción del Producto | ✅ |
| RNF-014 | Métricas de latencia y tokens visibles | Restricción del Producto | ✅ |
| RNF-015 | Cada traza debe incluir `langfuse.environment` | Restricción del Producto | ✅ |

### 6.6 Calidad de Experiencia (Nuevos)
| ID | Requerimiento | Clasificación | Estado |
|----|---------------|---------------|--------|
| RNF-016 | Tono de respuestas profesional sin informalidades excesivas | Restricción del Producto | ⚠️ (Sprint 3) |
| RNF-017 | Las respuestas FAQ no deben incluir menú innecesariamente | Restricción del Producto | ⚠️ (Sprint 3) |
| RNF-018 | Los mensajes de error deben variar para no parecer robots | Restricción del Producto | ⚠️ (Sprint 3) |

---

## 7. Reglas de Negocio

| ID | Regla | Estado v3 | Estado v4 |
|----|-------|-----------|-----------|
| RN-001 | Un pedido es `completo` solo si tiene: producto válido, cantidad > 0, dirección o retiro, montoAbono >= total | ✅ | ✅ |
| RN-002 | Si el usuario corrige un dato, se sobrescribe el valor previo | ✅ | ✅ |
| RN-003 | Si el usuario no menciona un campo, se conserva el valor previo en memoria | ✅ | ✅ |
| RN-004 | Si el producto no matchea con `Precios`, se marca `error_producto` | ✅ | ✅ |
| RN-005 | Ante detección de frustración/queja, derivar a humano via whatsapp-cloud-inbox | ⚠️ | ✅ (Sprint 2) |
| RN-006 | El pago puede ser en efectivo o transferencia bancaria | ❌ | ✅ (Sprint 1) |
| RN-007 | El vuelto se calcula como montoAbono - total, y debe ser >= 0 | ❌ | ✅ (Sprint 1) |
| RN-008 | Solo productos con `disponible: true` se muestran al cliente | ✅ | ✅ |
| RN-009 | El carrito se acumula entre mensajes hasta confirmación | ❌ | ✅ (Sprint 1) |
| RN-010 | Tras 3 errores consecutivos, derivar a humano | ❌ | ✅ (Sprint 3) |
| RN-011 | Las respuestas FAQ deben ser directas sin listar menú a menos que se solicite | ❌ | ✅ (Sprint 3) |

---

## 8. Modelo de Datos (Convex Schema) - Actualizaciones

### 8.1 Tablas Actualizadas

```typescript
// convex/schema.ts
export default defineSchema({
  // Sesiones conversacionales (actualizada)
  sessions: defineTable({
    chatId: v.string(),
    phoneNumber: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.string(), // "active" | "handed_off"
    // Campos nuevos para handoff
    handedOffAt: v.optional(v.number()),
    handedOffReason: v.optional(v.string()), // "user_requested" | "frustration" | "error_repetition" | "complaint"
  }).index("by_chatId", ["chatId"]),

  // Checkpoints de LangGraph (actualizada)
  checkpoints: defineTable({
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(), // JSON serializado del AgentState
    versions: v.string(), // JSON serializado de versiones
    versionsSeen: v.string(), // JSON serializado de versiones vistas
    metadata: v.optional(v.string()), // JSON serializado de metadata
    ts: v.string(), // Timestamp del checkpoint
    namespace: v.string(), // Namespace del checkpoint (default: "")
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Pedidos (sin cambios)
  pedidos: defineTable({
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(v.object({
      producto: v.string(),
      cantidad: v.number(),
      precioUnitario: v.number(),
    })),
    direccion: v.optional(v.string()),
    tipoEntrega: v.string(), // "delivery" | "pickup"
    metodoPago: v.string(), // "efectivo" | "transferencia"
    montoAbonado: v.number(), // Con cuánto paga
    vuelto: v.number(), // Cambio a devolver
    nombreCliente: v.optional(v.string()),
    total: v.number(),
    estado: v.string(), // "incompleto" | "completo" | "confirmado" | "cancelado"
    cancelReason: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_telefono", ["telefono"]),

  // Menú (sin cambios)
  menu: defineTable({
    item: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    categoria: v.string(),
    disponible: v.boolean(),
    aliases: v.optional(v.array(v.string())), // Nombres alternativos
  }).index("by_categoria", ["categoria"]),

  // Precios (sin cambios)
  precios: defineTable({
    producto: v.string(),
    precioUnitario: v.number(),
  }).index("by_producto", ["producto"]),

  // FAQ (sin cambios)
  faq: defineTable({
    tema: v.string(),
    pregunta: v.string(),
    respuesta: v.string(),
    categoria: v.optional(v.string()), // Categoría para agrupar FAQs relacionadas
  }),

  // NUEVA: Configuración de pagos
  payment_config: defineTable({
    metodos: v.array(v.string()), // ["efectivo", "transferencia"]
    efectivoMinimo: v.number(), // Monto mínimo para efectivo
    transferenciaBanco: v.string(), // Nombre del banco
    transferenciaAlias: v.string(), // Alias/CBU corto
    transferenciaCBU: v.string(), // CBU completo
    transferenciaCUIT: v.optional(v.string()), // CUIT/CUIL
    entregaPago: v.string(), // "con_entrega" | "adelantado"
    activo: v.boolean(),
  }).index("by_activo", ["activo"]),
});
```

---

## 9. Criterios de Aceptación

| ID | Criterio | Estado v3 | Estado v4 Objetivo |
|----|----------|-----------|-------------------|
| CA-001 | Dada consulta de menú, el bot responde con items/precios reales sin inventar | ✅ | ✅ |
| CA-002 | Dado pedido parcial, el bot solicita exactamente los campos faltantes | ✅ | ✅ |
| CA-003 | Dado pedido completo, el bot confirma y persiste en `Pedidos` | ✅ | ✅ |
| CA-004 | Dada pregunta fuera de base de conocimiento, responde con "no encontrado" | ✅ | ✅ |
| CA-005 | Dada queja o solicitud de humano, inicia flujo de handoff | ⚠️ | ✅ (Sprint 2) |
| CA-006 | El sistema calcula correctamente el vuelto para pagos en efectivo | ❌ | ✅ (Sprint 1) |
| CA-007 | El sistema rechaza montos de pago menores al total | ❌ | ✅ (Sprint 1) |
| CA-008 | AI Judge valida flujos antes de deploy | ✅ | ✅ |
| CA-009 | Handoff permite a operadores ver y responder conversaciones | ⚠️ | ✅ (Sprint 2) |
| CA-010 | Admin puede activar/desactivar productos en tiempo real | ✅ | ✅ |
| CA-011 | El carrito se acumula correctamente entre mensajes | ❌ | ✅ (Sprint 1) |
| CA-012 | El sistema soporta acciones: add, remove, replace, clear en el carrito | ❌ | ✅ (Sprint 1) |
| CA-013 | El sistema informa métodos de pago disponibles | ❌ | ✅ (Sprint 1) |
| CA-014 | El sistema proporciona datos bancarios para transferencias | ❌ | ✅ (Sprint 1) |
| CA-015 | El sistema maneja cancelaciones de pedidos | ❌ | ✅ (Sprint 3) |
| CA-016 | El sistema deriva a humano tras 3+ errores | ❌ | ✅ (Sprint 3) |
| CA-017 | El sistema usa un tono profesional sin "Che" | ⚠️ | ✅ (Sprint 3) |
| CA-018 | Tests AI Judge: 40+ tests pasan (87%+) | ❌ (19/46) | ✅ (Sprint 2+) |
| CA-019 | Tests AI Judge: 44+ tests pasan (96%+) | ❌ (19/46) | ✅ (Sprint 3) |

---

## 10. Matriz de Trazabilidad

### 10.1 Objetivos de Negocio → Requerimientos

| Objetivo de Negocio | RF Relacionados | Sprint |
|---------------------|-----------------|--------|
| Procesar pagos correctamente | RF-029 a RF-035 | 1 |
| Mantener contexto de pedidos | RF-016, RF-024, RF-025 | 1 |
| Derivar a humano cuando es necesario | RF-010, RF-040 a RF-042, RN-010 | 2 |
| Responder FAQs sin desviar | RF-015, RN-011 | 3 |
| Manejar errores y casos extremos | RF-045 a RF-049 | 3 |
| Profesionalizar el tono | RF-039 | 3 |

### 10.2 Problemas Langfuse → Soluciones SRS v4

| Problema Langfuse | Tests Fallando | Solución SRS v4 | Sprint |
|------------------|---------------|------------------|--------|
| PAY - Manejo de pagos no implementado | 0/5 | PAY-RF-001 a PAY-RF-007 | 1 |
| ORDER - Procesamiento de pedidos falla | 0/7 (O+MO) | ORD-RF-003, ORD-RF-004, ORD-RF-006 | 1 |
| WORKFLOW - Pérdida de contexto | 0/3 | WRK-RF-001 a WRK-RF-004 | 1 |
| HANDOFF - Sin mecanismo claro | 1/4 | HND-RF-001 a HND-RF-007 | 2 |
| FAQ - Respuestas irrelevantes | 2/5 | FAQ-RF-001 a FAQ-RF-003 | 3 |
| EDGE - Manejo de errores deficiente | 1/5 | EDGE-RF-001 a EDGE-RF-005 | 3 |
| TONO - "Che" informal | - | TON-RF-001, TON-RF-002 | 3 |

---

## 11. Backlog de Implementación

### 11.1 Sprint 1: Core de Pedidos (2 semanas)

| Prio | ID | Título | Descripción | Estimación |
|------|----|----|-------------|-------------|
| 1 | PAY-01..06 | Implementar Payment Handler | Crear tabla, nodo, lógica de cálculo de vuelto, tests | 16h |
| 2 | ORD-01..06 | Implementar Order Handler V2 | Carrito acumulativo, acciones add/remove/replace/clear, tests | 20h |
| 3 | WRK-01..06 | Implementar Checkpointer V2 | Persistencia mejorada, checkpoints estratégicos, tests | 18h |

**Total Sprint 1:** 54 horas (6.75 días hábiles)

---

### 11.2 Sprint 2: Handoff Completo (2 semanas)

| Prio | ID | Título | Descripción | Estimación |
|------|----|----|-------------|-------------|
| 4 | HND-01..08 | Implementar Handoff | Detección, notificación, inbox, reactivación, tests | 34h |

**Total Sprint 2:** 34 horas (4.25 días hábiles)

---

### 11.3 Sprint 3: FAQ, Edge Cases y Tono (1 semana)

| Prio | ID | Título | Descripción | Estimación |
|------|----|----|-------------|-------------|
| 5 | FAQ-01..07 | Mejorar FAQ Handler | Respuestas directas, no listar menú, contexto, tests | 18h |
| 6 | TON-01..03 | Profesionalizar Tono | Eliminar "Che", prompt mejorado, validación | 4h |
| 7 | EDGE-RF-001..005 | Implementar Edge Cases Handler | Cancelación, errores, ambigüedades, cambio de tema | Integrado en FAQ-01..07 |

**Total Sprint 3:** 28 horas (3.5 días hábiles)

---

## 12. Métricas de Éxito

### 12.1 Métricas de Calidad (AI Judge)

| Métrica | Estado v3 | Objetivo Sprint 1 | Objetivo Sprint 2 | Objetivo Sprint 3 |
|----------|-----------|-------------------|-------------------|-------------------|
| Tests Pasados | 19/46 (41.3%) | 36/46 (78.3%) | 40/46 (87.0%) | 44/46 (95.7%) |
| Payment Tests | 0/5 (0%) | 5/5 (100%) | 5/5 (100%) | 5/5 (100%) |
| Order Tests | 0/7 (0%) | 7/7 (100%) | 7/7 (100%) | 7/7 (100%) |
| Workflow Tests | 0/3 (0%) | 3/3 (100%) | 3/3 (100%) | 3/3 (100%) |
| Handoff Tests | 1/4 (25%) | 1/4 (25%) | 4/4 (100%) | 4/4 (100%) |
| FAQ Tests | 2/5 (40%) | 2/5 (40%) | 2/5 (40%) | 5/5 (100%) |
| Edge Cases Tests | 1/5 (20%) | 1/5 (20%) | 1/5 (20%) | 5/5 (100%) |
| Puntaje Promedio Overall | ~65/100 | ~85/100 | ~90/100 | ~95/100 |

### 12.2 Métricas de Desarrollo

| Métrica | Objetivo |
|----------|----------|
| Cobertura de tests >85% | ✅ |
| Tiempo de respuesta P95 <10s | ✅ |
| Build sin errores | ✅ |
| Lint sin warnings | ✅ |
| Documentación actualizada | ✅ |

---

## 13. Estimación de Costos

### 13.1 Desarrollo (Sprints 1-3)

| Item | Costo Estimado |
|------|----------------|
| Desarrollador Senior (116 horas @ $60/h) | $6,960 |
| QA/AI Judge Review | $500 |
| Total Desarrollo | **~$7,460** |

### 13.2 Infraestructura (Mes)

| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Developer) | $0/mes |
| Gemini API (dev) | $10-30/mes |
| Langfuse (Hobby) | $0/mes |
| Telegram Bot | $0/mes |
| **Total Desarrollo** | **$10-30/mes** |

### 13.3 Producción (50k interacciones/mes) - Post-MVP v4

| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Pro) | $50-100/mes |
| Gemini API | $50-150/mes |
| Langfuse (Pro) | $199/mes |
| Hosting (Cloud Run) | $50-150/mes |
| whatsapp-cloud-inbox (hosting) | $20-50/mes |
| **Total Producción** | **$369-649/mes** |

---

## 14. Pendientes y TBD

| ID | Descripción | Sprint Resolución |
|----|-------------|------------------|
| TBD-001 | Integración completa de whatsapp-cloud-inbox en /admin | 2 |
| TBD-002 | Definir políticas de retención de datos en Convex | Post-MVP |
| TBD-003 | Documentar runbooks operativos para handoff | 2 |
| TBD-004 | Configurar alertas de monitoreo | Post-MVP |
| TBD-005 | Decisión sobre migración a WhatsApp vs mantener Telegram | Post-MVP |
| TBD-006 | Implementar cálculo de costo de envío por zona | Post-MVP |
| TBD-007 | Implementar validación de comprobantes de transferencia (OCR) | Post-MVP |

---

## 15. Control de Versiones

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 2026-02-27 | Equipo | Versión inicial (SRS-v1.md) |
| 2.0 | 2026-02-28 | Equipo | Plan de construcción progresiva, Fase 0-1 detalladas (SRS-v2-kilo.md) |
| 3.0 | 2026-03-02 | Equipo | MVP definitivo: solo efectivo, cálculo de vuelto, whatsapp-cloud-inbox (SRS-v3-kilo.md) |
| 3.1-3.8 | 2026-03-02 to 2026-03-05 | Equipo | Hardening de producción, Langfuse AI quality loop, hotfixes (SRS-v3-kilo.md) |
| 4.0 | 2026-03-06 | Equipo | SRS v4: Resolución de problemas críticos identificados en tests Langfuse v3. Plan de 3 sprints enfocado en Payment, Order, Workflow, Handoff, FAQ, Edge Cases y Tono profesional. |

---

## 16. Anexos

### 16.1 Archivos de Referencia

- `langfusetests.csv` - Resultados completos de pruebas AI Judge (988 registros, 48 tests)
- `SRS-v3-kilo.md` - Especificación base v3.8
- `apps/restaurant-hours-api/src/langgraph/` - Implementación LangGraph actual
- `apps/restaurant-hours-api/src/judge/` - Sistema AI Judge
- `LANGGRAPH_IMPROVEMENTS.md` - Mejoras propuestas para LangGraph (existente)

### 16.2 Convención de Tests Langfuse

Categorías de tests y sus identificadores:

| Categoría | Prefijo | Tests |
|-----------|----------|-------|
| Resilience | RES-01 a RES-05 | 5 tests |
| Security | SEC-01 a SEC-05 | 5 tests |
| Handoff | HANDOFF-01 a HANDOFF-04 | 4 tests |
| Payment | PAY-01 a PAY-05 | 5 tests |
| Edge Case | E1 a E5 | 5 tests |
| Workflow | W1 a W3 | 3 tests |
| Multi Order | MO1 a MO3 | 3 tests |
| Single Order | O1 a O4 | 4 tests |
| Menu | M1 a M4 | 4 tests |
| FAQ | F1 a F5 | 5 tests |
| Greeting | G1 a G3 | 3 tests |

### 16.3 Prompt Templates

#### Prompt de Payment Handler

```typescript
const PAYMENT_HANDLER_PROMPT = `Eres el manejador de pagos de un restaurante.

CONFIGURACIÓN DE PAGOS:
- Métodos disponibles: {paymentMethods}
- Efectivo: aceptado contra entrega o al retirar
- Transferencia: debe ser anticipada

DATOS BANCARIOS:
- Banco: {bankName}
- Alias/CBU: {alias}
- CBU completo: {cbu}
- CUIT/CUIL: {cuit}

REGLAS:
1. Informar solo métodos activos
2. Para efectivo: preguntar monto para calcular vuelto
3. Para transferencia: proporcionar datos bancarios completos
4. Validar que montoAbono >= total antes de confirmar
5. Calcular vuelto = montoAbono - total

PREGUNTA DEL USUARIO: {userMessage}
ESTADO DEL PEDIDO: {orderState}

Genera una respuesta clara y concisa sobre el pago.`;
```

#### Prompt de Order Handler V2

```typescript
const ORDER_HANDLER_V2_PROMPT = `Eres el manejador de pedidos de un restaurante.

MENÚ DISPONIBLE:
{menuItems}

REGLAS DE EXTRACCIÓN:
1. Extraer SOLO productos que existen en el menú
2. Si cantidad no se especifica, asumir 1
3. Detectar acción: add, remove, replace, clear
4. Validar que el producto existe en la tabla de precios

REGLAS DE ACUMULACIÓN:
- add: agregar al carrito existente
- remove: quitar del carrito
- replace: reemplazar el carrito completo
- clear: vaciar el carrito

MENSAJE DEL USUARIO: {userMessage}
CARRITO ACTUAL: {currentCart}

Genera JSON con:
{ "action": "add|remove|replace|clear", "items": [{"producto": "...", "cantidad": N}], "confirmation": boolean }`;
```

---

*Este documento define el plan de mejoras para el SRS v4, basado en el análisis exhaustivo de los resultados de las pruebas AI Judge (Langfuse) realizadas al SRS v3. El enfoque prioriza la resolución de problemas críticos que bloquean la funcionalidad core del MVP, con un plan de implementación estructurado en 3 sprints de 2-2-1 semanas respectivamente.*
