# SRS v2 - Sistema de Asistente Conversacional para Restaurantes
## Plan de Construcción Progresiva para MVP

**Versión:** 2.0  
**Fecha:** 2026-02-28  
**Estado:** Roadmap de Implementación Incremental

---

## 1. Introducción

### 1.1 Propósito
Este documento especifica los requerimientos de software para un **asistente conversacional automatizado** orientado a restaurantes de comida rápida, junto con un **plan de construcción progresiva** que permite evolucionar desde el prototipo actual hacia un MVP funcional de producción de manera incremental.

### 1.2 Alcance
El sistema cubre:
- Atención automatizada de consultas frecuentes (menú, horarios, métodos de pago)
- Toma y validación de pedidos por chat
- Mantenimiento de contexto conversacional por cliente
- Derivación a operador humano cuando sea necesario

**Estrategia de Implementación:**
Este SRS define un roadmap de **4 fases** que permite construir el sistema de manera incremental:
- **Fase 0:** Fundación técnica (stack actual + Convex)
- **Fase 1:** Lógica conversacional (apertura + toma de pedidos)
- **Fase 2:** Producción parcial (handoff humano + soft launch)
- **Fase 3:** Go-live y optimización

**Alcance Fase 1 (MVP Inicial):**
- Mantener Telegram como canal (sin migrar a WhatsApp aún)
- Implementar orquestación con LangGraph
- Integrar Convex para persistencia
- Implementar flujos: apertura de conversación + toma de pedidos

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

### 1.4 Referencias
- `SRS-v1.md` - Especificación de requerimientos v1.0
- `informes/03-gemini-deepsearch.md` - Investigación técnica de industrialización
- `apps/restaurant-hours-api/` - Implementación actual (pre-MVP)
- Flujos n8n: `MVP copy-2.json`, `Apertura-2.json`, `Preguntas.json`

---

## 2. Descripción General

### 2.1 Perspectiva del Sistema (Arquitectura Objetivo)

El sistema evoluciona desde un prototipo n8n hacia una arquitectura de microservicios con orquestación de agentes basada en código:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              CANAL (Fase 0-1)                                │
│  ┌─────────────────┐                    ┌─────────────────┐                 │
│  │  Telegram       │                    │  WhatsApp       │ (Fase 2+)       │
│  │  (Actual)       │                    │  (Kapso.ai)     │                 │
│  └────────┬────────┘                    └────────┬────────┘                 │
│           │                                      │                          │
│           ▼                                      ▼                          │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    WEBHOOK GATEWAY (Express)                     │        │
│  │  - Validación de firmas                                          │        │
│  │  - Extracción de chat_id/contact_id                              │        │
│  │  - Rate limiting básico                                          │        │
│  └────────────────────────────┬────────────────────────────────────┘        │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    AGENT ORCHESTRATOR (LangGraph)                │        │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐       │        │
│  │  │ Clasificador │───▶│  Subflujo    │───▶│   Redactor   │       │        │
│  │  │ de Intención │    │  (FAQ/Pedido)│    │   (Response) │       │        │
│  │  └──────────────┘    └──────────────┘    └──────────────┘       │        │
│  │                              │                                   │        │
│  │                              ▼                                   │        │
│  │                    ┌──────────────┐                             │        │
│  │                    │   Handoff    │ (Fase 2)                    │        │
│  │                    │    Node      │                             │        │
│  │                    └──────────────┘                             │        │
│  └────────────────────────────┬────────────────────────────────────┘        │
│                               │                                              │
│                               ▼                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    CONVEX (Database + Functions)                 │        │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │        │
│  │  │ Pedidos  │ │  Menu    │ │ Precios  │ │ Sessions │           │        │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    LLM PROVIDER (Gemini 3 Flash)                 │        │
│  └─────────────────────────────────────────────────────────────────┘        │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────┐        │
│  │                    OBSERVABILIDAD (Langfuse) (Fase 1+)           │        │
│  └─────────────────────────────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Estado Actual (Pre-MVP)

El código existente en `apps/restaurant-hours-api/` proporciona:

| Componente | Estado | Descripción |
|------------|--------|-------------|
| Express Server | ✅ Implementado | Servidor básico con middleware de errores |
| Telegram Webhook | ✅ Implementado | Recepción de mensajes entrantes |
| Restaurant Hours Service | ✅ Implementado | Lógica de disponibilidad horaria |
| Convex | ⚠️ Configurado | Dependencia instalada, esquemas pendientes |
| LangGraph | ❌ No implementado | Pendiente para Fase 1 |
| LLM Integration | ❌ No implementado | Pendiente para Fase 1 |

### 2.3 Usuarios y Stakeholders
| Stakeholder | Descripción |
|-------------|-------------|
| Cliente final | Usuario de Telegram que consulta y realiza pedidos |
| Operador del restaurante | Recibe pedidos validados para preparación |
| Dueño/administrador | Objetivo comercial: aumentar conversiones |
| Equipo de desarrollo | Mantiene código, prompts e infraestructura |

### 2.4 Objetivos de Negocio (SMART)
1. **Reducir fricción** en toma de pedidos por chat (medible: menos mensajes para completar pedido)
2. **Aumentar conversión** de consultas a pedidos concretos
3. **Estandarizar respuestas** usando datos reales sin invención
4. **Mantener trazabilidad** del estado de pedidos por teléfono/chat

### 2.5 Supuestos y Dependencias
- Stack actual: Express + TypeScript + Telegram Bot API
- Convex disponible y configurado
- OpenAI/Gemini API disponible para Fase 1
- n8n disponible como referencia funcional durante migración

### 2.6 Restricciones
- Calidad de respuestas depende de prompts y datos
- Handoff humano se implementa en Fase 2
- Canal actual: solo Telegram (WhatsApp en Fase 2+)
- Evolución incremental sin big-bang migration

---

## 3. Plan de Construcción Progresiva

### 3.1 Visión General del Roadmap

```
Fase 0                Fase 1                Fase 2                Fase 3
Fundación            MVP Funcional         Soft Launch           Go-Live
   │                     │                     │                     │
   ▼                     ▼                     ▼                     ▼
┌──────┐            ┌──────┐            ┌──────┐            ┌──────┐
│ 3-4  │            │  6-8 │            │  4   │            │  3   │
│semanas│           │semanas│           │semanas│           │semanas│
└──────┘            └──────┘            └──────┘            └──────┘
   │                     │                     │                     │
   ├─ Convex Setup       ├─ LangGraph          ├─ Kapso.ai          ├─ WhatsApp
   ├─ Esquemas DB        ├─ Clasificador       ├─ Handoff           ├─ Pública
   ├─ Tests Base         ├─ Subflujo FAQ       ├─ Inbox             ├─ Monitoreo
   └─ Docker/ngrok       ├─ Toma Pedidos       ├─ Beta testers      └─ Optimización
                         ├─ Memoria Convex
                         └─ Langfuse
```

### 3.2 Fase 0: Fundación Técnica (3-4 semanas)

**Objetivo:** Establecer la base técnica sobre la cual construir el MVP.

#### 3.2.1 Alcance

| ID | Tarea | Descripción | Criterio de Aceptación |
|----|-------|-------------|------------------------|
| F0-01 | Configurar esquemas Convex | Definir tablas `pedidos`, `menu`, `precios`, `sessions` | Esquemas desplegados en dashboard Convex |
| F0-02 | Implementar mutaciones básicas | CRUD para cada entidad | Tests pasando con cobertura >80% |
| F0-03 | Configurar variables de entorno | Migrar config a Convex env vars | Deploy funciona sin .env hardcodeado |
| F0-04 | Setup de testing | Vitest configurado para tests de integración Convex | `npm test` ejecuta suite completa |
| F0-05 | Documentar arquitectura | README actualizado con nuevo stack | Onboarding de nuevo dev <30min |

#### 3.2.2 Esquema de Datos Convex

```typescript
// convex/schema.ts
export default defineSchema({
  // Sesiones conversacionales
  sessions: defineTable({
    chatId: v.string(),           // Telegram chat_id
    phoneNumber: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.string(),           // "active" | "paused" | "handed_off"
  }).index("by_chatId", ["chatId"]),

  // Checkpoints de LangGraph (memoria)
  checkpoints: defineTable({
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(),       // JSON serializado
    createdAt: v.number(),
  }).index("by_session", ["sessionId"]),

  // Pedidos
  pedidos: defineTable({
    sessionId: v.id("sessions"),
    telefono: v.string(),
    items: v.array(v.object({
      producto: v.string(),
      cantidad: v.number(),
      precioUnitario: v.number(),
    })),
    direccion: v.optional(v.string()),
    tipoEntrega: v.string(),      // "delivery" | "pickup"
    metodoPago: v.optional(v.string()),
    nombreCliente: v.optional(v.string()),
    total: v.number(),
    estado: v.string(),           // "incompleto" | "completo" | "confirmado"
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_telefono", ["telefono"]),

  // Menú
  menu: defineTable({
    item: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    categoria: v.string(),
    disponible: v.boolean(),
  }).index("by_categoria", ["categoria"]),

  // Precios (para validación rápida)
  precios: defineTable({
    producto: v.string(),
    precioUnitario: v.number(),
  }).index("by_producto", ["producto"]),

  // FAQ
  faq: defineTable({
    tema: v.string(),
    pregunta: v.string(),
    respuesta: v.string(),
  }),
});
```

#### 3.2.3 Entregables
- [ ] Repositorio con esquemas Convex desplegados
- [ ] Suite de tests para mutaciones/queries
- [ ] Documentación de arquitectura actualizada
- [ ] Pipeline CI básico (lint + test)

#### 3.2.4 Riesgos y Mitigación
| Riesgo | Mitigación |
|--------|------------|
| Curva de aprendizaje Convex | Usar templates oficiales y documentación |
| Migración de datos existentes | Mantener n8n como fuente de verdad temporalmente |

---

### 3.3 Fase 1: MVP Funcional - Lógica Conversacional (6-8 semanas)

**Objetivo:** Implementar la lógica conversacional completa usando LangGraph, manteniendo Telegram como canal.

#### 3.3.1 Alcance

| ID | Tarea | Descripción | Criterio de Aceptación |
|----|-------|-------------|------------------------|
| F1-01 | Integrar LangGraph | StateGraph básico con nodos de clasificación | Grafo ejecuta flujo mínimo end-to-end |
| F1-02 | Implementar Clasificador de Intenciones | Nodo que categoriza: FAQ, Pedido, Queja | Precisión >90% en dataset de prueba |
| F1-03 | Implementar Subflujo FAQ | Consulta a tablas Menu/FAQ, respuesta sin alucinación | Respuestas basadas 100% en datos |
| F1-04 | Implementar Subflujo Apertura/Pedidos | Máquina de estados para toma de pedidos | Pedido completo persistido en Convex |
| F1-05 | Implementar Memoria Conversacional | Checkpoints de LangGraph en Convex | Contexto preservado entre mensajes |
| F1-06 | Integrar LLM (Gemini 3 Flash) | Conexión con Vertex AI o AI Studio | Latencia P95 <10s |
| F1-07 | Configurar Langfuse | Observabilidad de trazas y tokens | Dashboard visible con métricas |
| F1-08 | Tests de integración | Suite completa de escenarios conversacionales | Cobertura >85% |

#### 3.3.2 Arquitectura LangGraph (Fase 1)

```typescript
// Estructura del StateGraph para Fase 1
const graph = new StateGraph<AgentState>({
  channels: {
    messages: { value: [], reduce: appendMessages },
    intent: { value: null },
    cart: { value: {} },
    customerData: { value: {} },
    response: { value: "" },
  }
});

// Nodos
graph.addNode("classify_intent", classifyIntentNode);
graph.addNode("faq_handler", faqHandlerNode);
graph.addNode("order_handler", orderHandlerNode);
graph.addNode("validate_order", validateOrderNode);
graph.addNode("format_response", formatResponseNode);

// Edges
graph.setEntryPoint("classify_intent");
graph.addConditionalEdges("classify_intent", routeByIntent, {
  "faq": "faq_handler",
  "order": "order_handler",
  "complaint": "format_response", // Placeholder para Fase 2
});
graph.addEdge("faq_handler", "format_response");
graph.addEdge("order_handler", "validate_order");
graph.addConditionalEdges("validate_order", checkOrderComplete, {
  "complete": "format_response",
  "incomplete": "format_response",
});
graph.addEdge("format_response", END);
```

#### 3.3.3 Flujos Conversacionales

**Flujo 1: Apertura de Conversación**
```
Usuario: "Hola"
Sistema: [Clasifica como "saludo"]
Sistema: "¡Hola! Bienvenido a [Restaurante]. ¿En qué puedo ayudarte?"
```

**Flujo 2: Consulta FAQ (Menú)**
```
Usuario: "¿Qué tienen?"
Sistema: [Clasifica como "faq"]
Sistema: [Consulta tabla Menu en Convex]
Sistema: "Tenemos: Hamburguesas ($X), Papas ($Y), Bebidas ($Z)..."
```

**Flujo 3: Toma de Pedido**
```
Usuario: "Quiero 2 hamburguesas"
Sistema: [Clasifica como "order"]
Sistema: [Valida producto en Precios]
Sistema: [Actualiza carrito en Convex]
Sistema: "Anotado: 2 hamburguesas ($X c/u = $Y). ¿Para entrega o retiro?"

Usuario: "Delivery"
Sistema: [Actualiza tipoEntrega]
Sistema: "Perfecto. ¿Dirección de entrega?"

Usuario: "Calle Falsa 123"
Sistema: [Actualiza direccion]
Sistema: "¿Método de pago? (efectivo/tarjeta)"

Usuario: "Efectivo"
Sistema: [Actualiza metodoPago]
Sistema: [Verifica pedido completo]
Sistema: "¡Listo! Tu pedido: 2 hamburguesas, delivery a Calle Falsa 123. Total: $Y. ¿Confirmás?"
```

#### 3.3.4 Requerimientos Funcionales (Fase 1)

##### Recepción y Contexto
| ID | Requerimiento | Prioridad | Fase |
|----|---------------|-----------|------|
| RF-001 | El sistema debe recibir mensajes entrantes desde Telegram | Alta | 0 ✅ |
| RF-002 | El sistema debe extraer identificador del cliente (`chat_id`) | Alta | 0 ✅ |
| RF-003 | El sistema debe buscar sesión existente por chat_id | Alta | 1 |
| RF-004 | Si no existe sesión, el sistema debe crear registro inicial | Alta | 1 |
| RF-005 | El sistema debe mantener memoria conversacional via checkpoints | Alta | 1 |

##### Orquestación de Intenciones
| ID | Requerimiento | Prioridad | Fase |
|----|---------------|-----------|------|
| RF-006 | El sistema debe clasificar la consulta en: FAQ, gestión de pedido, queja | Alta | 1 |
| RF-007 | El sistema debe enrutar al subflujo FAQ para menú/consultas | Alta | 1 |
| RF-008 | El sistema debe enrutar al subflujo Pedidos para intenciones de compra | Alta | 1 |
| RF-009 | El sistema debe derivar a humano ante queja (placeholder Fase 2) | Media | 2 |

##### Consultas (Subflujo FAQ)
| ID | Requerimiento | Prioridad | Fase |
|----|---------------|-----------|------|
| RF-010 | El sistema debe consultar tablas `Menu` y `FAQ` según la intención | Alta | 1 |
| RF-011 | Ante consulta compuesta, debe poder consultar múltiples fuentes | Media | 1 |
| RF-012 | Si no hay datos, debe retornar señal `DATO_NO_ENCONTRADO` sin inventar | Alta | 1 |

##### Gestión de Pedidos (Subflujo Apertura)
| ID | Requerimiento | Prioridad | Fase |
|----|---------------|-----------|------|
| RF-013 | El sistema debe construir estado acumulado del pedido | Alta | 1 |
| RF-014 | El sistema debe validar productos contra tabla `Precios` | Alta | 1 |
| RF-015 | El sistema debe inferir "Retiro en sucursal" cuando detecte intención pickup | Media | 1 |
| RF-016 | Si no se especifica cantidad, asumir cantidad = 1 | Media | 1 |
| RF-017 | El sistema debe calcular total = precio_unitario × cantidad | Alta | 1 |
| RF-018 | El sistema debe marcar pedido como `completo`, `incompleto` o `error_producto` | Alta | 1 |
| RF-019 | El sistema debe identificar campos faltantes y solicitarlos | Alta | 1 |
| RF-020 | Solo con estado `completo`, actualizar tabla `Pedidos` | Alta | 1 |

##### Redacción y Respuesta
| ID | Requerimiento | Prioridad | Fase |
|----|---------------|-----------|------|
| RF-021 | El sistema debe transformar salida técnica en respuesta legible | Alta | 1 |
| RF-022 | La redacción debe respetar instrucciones del agente de control | Alta | 1 |
| RF-023 | El sistema debe enviar respuesta al mismo chat de origen | Alta | 0 ✅ |

#### 3.3.5 Entregables
- [ ] LangGraph StateGraph implementado y testeado
- [ ] Nodos de clasificación, FAQ y pedidos funcionales
- [ ] Integración LLM (Gemini 3 Flash)
- [ ] Memoria conversacional con checkpoints en Convex
- [ ] Langfuse configurado con trazas visibles
- [ ] Suite de tests con >85% cobertura
- [ ] Documentación de flujos conversacionales

#### 3.3.6 Riesgos y Mitigación
| Riesgo | Mitigación |
|--------|------------|
| Pérdida de contexto en conversaciones largas | Checkpoints frecuentes + LangGraph Studio para debug |
| Alucinaciones del LLM | RAG estricto sobre datos Convex, validación post-generación |
| Latencia excesiva | Gemini 3 Flash (optimizado para velocidad), timeout handling |

---

### 3.4 Fase 2: Producción Parcial - Handoff Humano (4 semanas)

**Objetivo:** Implementar derivación a operadores humanos y realizar soft launch con beta testers.

#### 3.4.1 Alcance

| ID | Tarea | Descripción | Criterio de Aceptación |
|----|-------|-------------|------------------------|
| F2-01 | Integrar Kapso.ai | Configurar cuenta y número WhatsApp de prueba | Webhook recibiendo mensajes de WhatsApp |
| F2-02 | Implementar HandoffNode | Derivación a Inbox de Kapso | Conversación pausada y visible en Inbox |
| F2-03 | Detección de frustración | Clasificador de sentimiento para quejas | Precisión >80% en detección |
| F2-04 | Capacitación operadores | Training sobre uso de Inbox | Operadores pueden tomar conversaciones |
| F2-05 | Beta testing | Grupo cerrado de testers (10-20 personas) | Feedback recolectado y analizado |
| F2-06 | Métricas de negocio | Dashboard con conversiones, tiempos, errores | Métricas visibles en tiempo real |

#### 3.4.2 Entregables
- [ ] Kapso.ai integrado con WhatsApp
- [ ] Handoff funcional
- [ ] Grupo de beta testers activo
- [ ] Dashboard de métricas

---

### 3.5 Fase 3: Go-Live y Optimización (3 semanas)

**Objetivo:** Lanzamiento público y optimización basada en datos reales.

#### 3.5.1 Alcance

| ID | Tarea | Descripción | Criterio de Aceptación |
|----|-------|-------------|------------------------|
| F3-01 | Migrar a WhatsApp público | Número de WhatsApp Business activo | Clientes pueden contactar vía WhatsApp |
| F3-02 | Deprecar Telegram (opcional) | Migrar usuarios o mantener dual | Decisión documentada |
| F3-03 | Monitoreo activo | Alertas en Grafana para P95 >10s | Alertas funcionando |
| F3-04 | Optimización de prompts | Reducción de tokens basada en análisis | Costo por conversación reducido 20% |
| F3-05 | Hypercare | Soporte intensivo post-lanzamiento | SLA de respuesta <1h |

#### 3.5.2 Entregables
- [ ] WhatsApp Business activo
- [ ] Monitoreo y alertas configurados
- [ ] Prompts optimizados
- [ ] Documentación de runbooks operativos

---

## 4. Requerimientos No Funcionales (RNF)

### 4.1 Seguridad y Privacidad
| ID | Requerimiento | Clasificación | Fase |
|----|---------------|---------------|------|
| RNF-001 | Las credenciales API no deben exponerse en respuestas | Restricción Externa | 0 |
| RNF-002 | Minimizar exposición de datos personales | Restricción Externa | 1 |
| RNF-003 | Las respuestas no deben filtrar estructura interna | Restricción del Producto | 1 |

### 4.2 Calidad de Información
| ID | Requerimiento | Clasificación | Fase |
|----|---------------|---------------|------|
| RNF-004 | El sistema NO debe inventar productos, precios, horarios | Restricción del Producto | 1 |
| RNF-005 | Las respuestas deben ser consistentes con datos de Convex | Restricción del Producto | 1 |
| RNF-006 | Mantener formato estructurado intermedio | Restricción Organizacional | 1 |

### 4.3 Rendimiento y Disponibilidad
| ID | Requerimiento | Clasificación | Fase |
|----|---------------|---------------|------|
| RNF-007 | Tiempo de respuesta ≤10s (P95) | Restricción del Producto | 1 |
| RNF-008 | Tolerar mensajes consecutivos sin corromper estado | Restricción del Producto | 1 |

### 4.4 Mantenibilidad
| ID | Requerimiento | Clasificación | Fase |
|----|---------------|---------------|------|
| RNF-009 | Prompts versionados en Git | Restricción Organizacional | 1 |
| RNF-010 | Requerimientos trazables hasta pruebas | Restricción Organizacional | 1 |
| RNF-011 | Infraestructura como código (Terraform) | Restricción Organizacional | 3 |

### 4.5 Observabilidad (Nuevos)
| ID | Requerimiento | Clasificación | Fase |
|----|---------------|---------------|------|
| RNF-012 | Cada invocación al LLM debe registrar traza en Langfuse | Restricción del Producto | 1 |
| RNF-013 | Métricas de latencia y errores visibles en dashboard | Restricción del Producto | 2 |

---

## 5. Reglas de Negocio

| ID | Regla | Fase |
|----|-------|------|
| RN-001 | Un pedido es `completo` solo si tiene: producto válido, cantidad > 0, dirección o retiro, método de pago, nombre | 1 |
| RN-002 | Si el usuario corrige un dato, se sobrescribe el valor previo | 1 |
| RN-003 | Si el usuario no menciona un campo, se conserva el valor previo en memoria | 1 |
| RN-004 | Si el producto no matchea con `Precios`, se marca `error_producto` | 1 |
| RN-005 | Ante detección de frustración, derivar a humano | 2 |

---

## 6. Modelo de Datos (Conceptual)

### 6.1 Entidades Principales

**SESSION** (Nueva - Fase 1)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ID | Identificador único Convex |
| chatId | string | Telegram chat_id |
| phoneNumber | string? | Teléfono del cliente |
| status | string | "active" \| "paused" \| "handed_off" |
| createdAt | number | Timestamp de creación |
| updatedAt | number | Timestamp de última actualización |

**CHECKPOINT** (Nueva - Fase 1)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ID | Identificador único Convex |
| sessionId | ID | Referencia a SESSION |
| threadId | string | Thread ID de LangGraph |
| checkpoint | string | Estado serializado (JSON) |
| createdAt | number | Timestamp |

**PEDIDO** (Actualizado)
| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ID | Identificador único Convex |
| sessionId | ID | Referencia a SESSION |
| telefono | string | Identificador del cliente |
| items | Item[] | Lista de productos |
| direccion | string? | Dirección de entrega |
| tipoEntrega | string | "delivery" \| "pickup" |
| metodoPago | string? | Método de pago |
| nombreCliente | string? | Nombre del cliente |
| total | number | Monto total |
| estado | string | "incompleto" \| "completo" \| "confirmado" |
| createdAt | number | Timestamp |
| updatedAt | number | Timestamp |

**MENU**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ID | Identificador único Convex |
| item | string | Nombre del item |
| descripcion | string | Descripción detallada |
| precio | number | Precio |
| categoria | string | Categoría del producto |
| disponible | boolean | Disponibilidad |

**PRECIOS**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ID | Identificador único Convex |
| producto | string | Nombre del producto |
| precioUnitario | number | Precio individual |

**FAQ**
| Campo | Tipo | Descripción |
|-------|------|-------------|
| _id | ID | Identificador único Convex |
| tema | string | Tema de la pregunta |
| pregunta | string | Pregunta específica |
| respuesta | string | Respuesta estándar |

---

## 7. Interfaces Externas

| ID | Interfaz | Descripción | Fase |
|----|----------|-------------|------|
| IE-001 | Telegram Bot API | Trigger y envío de mensajes | 0 ✅ |
| IE-002 | Google Gemini API | Modelo de lenguaje (Gemini 3 Flash) | 1 |
| IE-003 | Convex | Base de datos y funciones | 0 |
| IE-004 | Langfuse | Observabilidad de IA | 1 |
| IE-005 | Kapso.ai | WhatsApp + Handoff | 2 |
| IE-006 | Google Cloud Run | Runtime de producción | 3 |

---

## 8. Criterios de Aceptación por Fase

### 8.1 Fase 0
| ID | Criterio |
|----|----------|
| CA-001 | Esquemas Convex desplegados y accesibles desde el código |
| CA-002 | Mutaciones básicas funcionando (create, read, update) |
| CA-003 | Tests ejecutándose en CI con cobertura >80% |

### 8.2 Fase 1
| ID | Criterio |
|----|----------|
| CA-004 | Dada consulta de menú, el bot responde con items/precios reales sin inventar |
| CA-005 | Dado pedido parcial, el bot solicita exactamente los campos faltantes |
| CA-006 | Dado pedido completo, el bot confirma y persiste en `Pedidos` |
| CA-007 | Dada pregunta fuera de base de conocimiento, responde con "no encontrado" |
| CA-008 | Trazas visibles en Langfuse con latencia y tokens |
| CA-009 | Latencia P95 <10s en pruebas de carga |

### 8.3 Fase 2
| ID | Criterio |
|----|----------|
| CA-010 | Dada queja detectada, la conversación se deriva al Inbox |
| CA-011 | Operadores pueden ver y responder conversaciones derivadas |
| CA-012 | Beta testers completan flujos de pedido exitosamente |

### 8.4 Fase 3
| ID | Criterio |
|----|----------|
| CA-013 | WhatsApp Business operativo y recibiendo mensajes |
| CA-014 | Alertas configuradas para P95 >10s |
| CA-015 | Dashboard de métricas de negocio visible |

---

## 9. Matriz de Trazabilidad

### 9.1 Objetivos de Negocio → Requerimientos

| Objetivo de Negocio | RF Relacionados | Fase |
|---------------------|-----------------|------|
| Responder consultas automáticamente | RF-006, RF-007, RF-010, RF-011 | 1 |
| Convertir conversaciones en pedidos | RF-008, RF-013 a RF-020 | 1 |
| Mantener contexto por cliente | RF-005, RF-013 | 1 |
| Escalar a handoff humano | RF-009 | 2 |

### 9.2 Requerimientos → Tests

| RF | Test | Fase |
|----|------|------|
| RF-006 | `classifyIntent.test.ts` - 20 intents predefinidos | 1 |
| RF-010 | `faqHandler.test.ts` - consultas Menu/FAQ | 1 |
| RF-013-020 | `orderFlow.test.ts` - escenarios de pedido | 1 |
| RF-005 | `memory.test.ts` - checkpoints en Convex | 1 |

---

## 10. Backlog Ejecutable (Fase 0 y 1)

### 10.1 Fase 0 - Sprint 1-2

| Prio | ID | Título | Criterio de Aceptación | Est. (pts) | Deps |
|------|----|----|------------------------|------------|------|
| 1 | F0-01 | Configurar esquemas Convex | Esquemas desplegados en dashboard | 3 | - |
| 2 | F0-02 | Implementar mutaciones básicas | CRUD para pedidos, menu, precios | 5 | F0-01 |
| 3 | F0-03 | Configurar variables de entorno | Deploy sin .env hardcodeado | 2 | F0-01 |
| 4 | F0-04 | Setup de testing Convex | `npm test` ejecuta suite | 3 | F0-02 |
| 5 | F0-05 | Documentar arquitectura | README actualizado | 2 | F0-04 |

**Total Fase 0:** 15 pts (~3-4 semanas)

### 10.2 Fase 1 - Sprint 3-6

| Prio | ID | Título | Criterio de Aceptación | Est. (pts) | Deps |
|------|----|----|------------------------|------------|------|
| 6 | F1-01 | Integrar LangGraph | Grafo ejecuta flujo mínimo | 5 | F0-05 |
| 7 | F1-02 | Clasificador de Intenciones | Precisión >90% en test set | 8 | F1-01 |
| 8 | F1-03 | Subflujo FAQ | Respuestas sin alucinación | 8 | F1-02 |
| 9 | F1-04 | Subflujo Pedidos | Pedido completo persistido | 13 | F1-02 |
| 10 | F1-05 | Memoria Conversacional | Checkpoints en Convex | 8 | F1-01 |
| 11 | F1-06 | Integrar Gemini 3 Flash | Latencia P95 <10s | 5 | F1-01 |
| 12 | F1-07 | Configurar Langfuse | Trazas visibles | 3 | F1-06 |
| 13 | F1-08 | Tests de integración | Cobertura >85% | 8 | F1-04 |

**Total Fase 1:** 58 pts (~6-8 semanas)

---

## 11. Pendientes y TBD

| ID | Descripción | Fase Resolución |
|----|-------------|-----------------|
| TBD-001 | Implementación final de Handoff con Kapso.ai | 2 |
| TBD-002 | Decisión sobre migración total a WhatsApp vs dual | 3 |
| TBD-003 | Políticas de retención y anonimizado de datos | 2 |
| TBD-004 | SLAs formales de disponibilidad | 3 |
| TBD-005 | Terraform para infraestructura GCP | 3 |
| TBD-006 | Protocolo de purga de PII en Convex | 2 |

---

## 12. Estimación de Costos

### 12.1 Fase 0-1 (Desarrollo)
| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Developer) | $0/mes |
| Gemini 3 Flash (dev) | $10-30/mes |
| Langfuse (Hobby) | $0/mes |
| **Total** | **$10-30/mes** |

### 12.2 Fase 2 (Soft Launch)
| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Pro) | $25/mes |
| Gemini 3 Flash | $50/mes |
| Kapso.ai | $50-100/mes |
| Langfuse (Core) | $29/mes |
| **Total** | **$150-200/mes** |

### 12.3 Fase 3 (Producción - 50k interacciones/mes)
| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Pro) | $50-100/mes |
| Gemini 3 Flash | $50-150/mes |
| Kapso.ai + WhatsApp | $100-300/mes |
| Langfuse (Pro) | $199/mes |
| GCP Cloud Run | $50-150/mes |
| **Total** | **$450-900/mes** |

---

## 13. Control de Versiones

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 2026-02-27 | Equipo | Versión inicial (SRS-v1.md) |
| 2.0 | 2026-02-28 | Equipo | Plan de construcción progresiva, Fase 0-1 detalladas, integración Convex+LangGraph |

---

*Este documento extiende SRS-v1.md siguiendo las recomendaciones de `informes/03-gemini-deepsearch.md` y define un roadmap incremental para evolucionar desde el prototipo actual hacia un MVP de producción.*
