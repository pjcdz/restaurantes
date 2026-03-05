# SRS v3 - Sistema de Asistente Conversacional para Restaurantes
## MVP Definitivo - Workflow End-to-End

**Versión:** 3.8 
**Fecha:** 2026-03-02  
**Estado:** MVP Definitivo para Implementación

---

## 1. Introducción

### 1.1 Propósito
Este documento especifica los requerimientos de software para un **asistente conversacional automatizado** orientado a restaurantes de comida rápida, con un **MVP ultra-enfocado** que elimina complejidades innecesarias (pasarelas de pago, OCR de transferencias) para lograr un sistema determinista, robusto y altamente escalable.

### 1.2 Alcance del MVP
El sistema cubre:
- Atención automatizada de consultas frecuentes (menú, horarios)
- Toma y validación de pedidos por chat
- Mantenimiento de contexto conversacional por cliente
- **Pago únicamente en efectivo** (contra entrega o al retirar)
- Derivación a operador humano mediante **whatsapp-cloud-inbox**

**Decisiones de Producto para el MVP:**
- ❌ Sin pasarelas de pago (Stripe, MercadoPago)
- ❌ Sin validación de imágenes/OCR (comprobantes de transferencia)
- ✅ Solo pago en efectivo con cálculo de vuelto
- ✅ Handoff humano integrado en `/admin` con whatsapp-cloud-inbox

**Canales:**
- **Telegram:** Canal público principal (MVP)
- **API Directa (`/message`):** Testing interno con AI Judge Agent
- **WhatsApp:** Futuro (post-MVP via whatsapp-cloud-inbox)

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
| whatsapp-cloud-inbox | Inbox open-source para gestión de conversaciones WhatsApp |

### 1.4 Referencias
- `SRS-v1.md` - Especificación de requerimientos v1.0
- `SRS-v2-kilo.md` - Plan de construcción progresiva v2.0
- `apps/restaurant-hours-api/` - Implementación actual
- https://github.com/gokapso/whatsapp-cloud-inbox - Inbox para handoff
- Flujos n8n: `MVP copy-2.json`, `Apertura-2.json`, `Preguntas.json` (referencia)

---

## 2. Descripción General

### 2.1 Arquitectura de Canales (Entrada/Salida)

Toda la comunicación entra al servidor Express (`apps/restaurant-hours-api/src/`), pero a través de dos puertas distintas que convergen en el mismo "Cerebro" (LangGraph):

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                           CANALES DE ENTRADA                                     │
│  ┌─────────────────────┐              ┌─────────────────────┐                   │
│  │  Telegram           │              │  API Directa        │                   │
│  │  (/telegram/webhook)│              │  (/message)         │                   │
│  │  Clientes reales    │              │  AI Judge Testing   │                   │
│  └──────────┬──────────┘              └──────────┬──────────┘                   │
│             │                                    │                              │
│             └────────────────┬───────────────────┘                              │
│                              ▼                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    WEBHOOK GATEWAY (Express 5.1)                          │  │
│  │  - Validación de firmas                                                    │  │
│  │  - Extracción de chat_id/contact_id                                        │  │
│  │  - Rate limiting básico                                                    │  │
│  └───────────────────────────────────┬───────────────────────────────────────┘  │
│                                      ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                AGENT ORCHESTRATOR (LangGraph StateGraph)                  │  │
│  │                                                                            │  │
│  │  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐                 │  │
│  │  │ load_session │───▶│analyze_msg   │───▶│ route_intent │                 │  │
│  │  │ (Convex)     │    │ (Gemini)     │    │              │                 │  │
│  │  └──────────────┘    └──────────────┘    └──────┬───────┘                 │  │
│  │                                                  │                        │  │
│  │         ┌────────────────┬───────────────────────┼────────────────┐       │  │
│  │         ▼                ▼                       ▼                ▼       │  │
│  │  ┌────────────┐   ┌────────────┐         ┌────────────┐  ┌────────────┐  │  │
│  │  │ greeting_  │   │   faq_     │         │  order_    │  │  handoff_  │  │  │
│  │  │ handler    │   │  handler   │         │  handler   │  │   node     │  │  │
│  │  └─────┬──────┘   └─────┬──────┘         └─────┬──────┘  └─────┬──────┘  │  │
│  │        │                │                      │               │         │  │
│  │        └────────────────┴──────────────────────┘               │         │  │
│  │                                 │                              │         │  │
│  │                                 ▼                              ▼         │  │
│  │                        ┌────────────────┐              ┌────────────┐    │  │
│  │                        │validate_order  │              │ whatsapp-  │    │  │
│  │                        │(Zod + TS)      │              │ cloud-inbox│    │  │
│  │                        └───────┬────────┘              └────────────┘    │  │
│  │                                │                                         │  │
│  │                                ▼                                         │  │
│  │                        ┌────────────────┐                                │  │
│  │                        │format_response │                                │  │
│  │                        │(Gemma Composer)│                                │  │
│  │                        └───────┬────────┘                                │  │
│  └────────────────────────────────┼─────────────────────────────────────────┘  │
│                                   ▼                                             │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    CONVEX (Database + Functions)                          │  │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐        │  │
│  │  │ sessions │ │pedidos   │ │  menu    │ │ precios  │ │   faq    │        │  │
│  │  │checkpoints│ │         │ │          │ │          │ │          │        │  │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘        │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    LLM PROVIDER (Google Gemini)                           │  │
│  │  - Modelo: gemma-3-27b-it                                                 │  │
│  │  - Vercel AI SDK + @ai-sdk/google                                         │  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
│                                                                                  │
│  ┌───────────────────────────────────────────────────────────────────────────┐  │
│  │                    OBSERVABILIDAD (Langfuse) [Opcional]                   │  │
│  │  - Solo activa si LANGFUSE_PUBLIC_KEY y LANGFUSE_SECRET_KEY están seteadas│  │
│  └───────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Stack Tecnológico Implementado

#### Core Technologies (Actively Used)

| Layer | Technology | Implementation |
|-------|------------|----------------|
| **Runtime & Language** | TypeScript 5.9 | All source code in `src/`, compiled to ES2022 |
| | Node.js | Runtime environment |
| **HTTP Server** | Express 5.1 | Routes: `/admin`, `/message`, `/telegram/webhook` |
| **AI/ML - Production** | LangGraph (`@langchain/langgraph`) | StateGraph orchestrates conversation flow |
| | Vercel AI SDK (`ai`) | `generateText()` for LLM calls |
| | `@ai-sdk/google` | Gemini model integration |
| | Google Gemini API | Uses `gemma-3-27b-it` model |
| **Database** | Convex 1.32 | Primary database - ConvexHttpClient connects to Convex cloud |
| | Convex Functions | Schema defines tables: `sessions`, `checkpoints`, `pedidos`, `menu`, `precios`, `faq` |
| **Validation** | Zod 4.3 | Schema validation for order extraction |
| **Communication** | Telegram Bot API | Webhook handler - primary channel |
| **Testing** | Vitest 3.2 | Test framework - 8 test files covering routes, services |
| | Supertest 7.1 | HTTP integration tests |

#### Optional/Conditional

| Technology | Status |
|------------|--------|
| Langfuse + OpenTelemetry | Optional - only activates if `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` env vars are set |
| Docker Compose | Local development stack with Langfuse dependencies |
| ngrok | Tunnel for Telegram webhook in development |

#### Internal Tools

| Tool | Implementation |
|------|----------------|
| **Judge System** | AI Judge Agent in `src/judge/` - uses LangGraph + Gemini to evaluate conversation quality |

### 2.3 Panel de Administración (`/admin`)

El panel de administración está definido en `admin.ts` y montado en `/admin`.

#### Rutas del Admin

| Method | Path | Function |
|--------|------|----------|
| GET | `/admin` | Renders HTML admin panel |
| GET | `/admin/data` | Returns JSON catalog snapshot |
| POST | `/admin/products` | Create/update product |
| POST | `/admin/products/delete` | Delete product |
| POST | `/admin/faq` | Create/update FAQ entry |
| POST | `/admin/faq/delete` | Delete FAQ entry |

#### Arquitectura del Admin

```
Browser → Express Router → ConvexAdminRepository → Convex Cloud DB
                ↓
         HTML (SSR)
```

#### Características UI
- Inline Editing: Click "Editar" to reveal edit form in table row
- Delete Confirmation: JavaScript `confirm()` dialog
- Responsive CSS Grid: Auto-fit columns for forms
- Custom Styling: Warm color scheme (`#c44e24` accent, `#fffdf8` cards)
- **Handoff Inbox:** Integración con whatsapp-cloud-inbox para gestión de conversaciones derivadas

### 2.4 Usuarios y Stakeholders
| Stakeholder | Descripción |
|-------------|-------------|
| Cliente final | Usuario de Telegram que consulta y realiza pedidos |
| Operador del restaurante | Recibe pedidos validados para preparación y gestiona conversaciones derivadas |
| Dueño/administrador | Objetivo comercial: aumentar conversiones, gestiona menú y precios |
| Equipo de desarrollo | Mantiene código, prompts e infraestructura |

### 2.5 Objetivos de Negocio (SMART)
1. **Reducir fricción** en toma de pedidos por chat (medible: menos mensajes para completar pedido)
2. **Aumentar conversión** de consultas a pedidos concretos
3. **Estandarizar respuestas** usando datos reales sin invención
4. **Mantener trazabilidad** del estado de pedidos por teléfono/chat
5. **Cálculo preciso de vuelto** para transacciones en efectivo

### 2.6 Supuestos y Dependencias
- Stack actual: Express + TypeScript + Telegram Bot API + Convex + LangGraph
- Google Gemini API disponible (modelo `gemma-3-27b-it`)
- whatsapp-cloud-inbox configurado para handoff
- n8n disponible como referencia funcional (no runtime)

### 2.7 Restricciones
- Calidad de respuestas depende de prompts y datos
- **Solo pago en efectivo** (sin pasarelas de pago)
- Canal actual: Telegram (WhatsApp post-MVP)
- Sin validación de imágenes/comprobantes

---

## 3. El Estado del Agente (AgentState)

El motor de todo el sistema. Cada vez que entra un mensaje, este objeto viaja por los nodos de LangGraph:

```typescript
interface AgentState {
  messages: BaseMessage[];       // Historial completo de la conversación
  intent: "greeting" | "faq" | "order" | "complaint" | null;  // Intención detectada
  cart: { 
    producto: string, 
    cantidad: number, 
    precioUnitario: number 
  }[];                           // Carrito de compras
  customerData: { 
    tipoEntrega?: "delivery" | "pickup",   // Tipo de entrega
    direccion?: string,                     // Dirección de delivery
    montoAbono?: number                     // Con qué billete paga (para cálculo de vuelto)
  }; 
  orderStatus: "incompleto" | "completo" | "confirmado";  // Estado del pedido
  response: string;              // Respuesta final generada para el usuario
}
```

### 3.1 Campos Clave para el MVP

| Campo | Propósito | Validación |
|-------|-----------|------------|
| `cart` | Lista de productos con cantidad y precio | Validado contra tabla `precios` |
| `customerData.tipoEntrega` | Delivery o Pickup | Enum estricto |
| `customerData.direccion` | Requerido solo si `delivery` | String no vacío |
| `customerData.montoAbono` | Con cuánto paga el cliente | Debe ser >= total |
| `orderStatus` | Control de flujo del pedido | Estados definidos |

---

## 4. Workflow End-to-End (Paso a Paso)

### 4.1 Fase 0: Recepción y Recuperación de Memoria

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Cliente        │────▶│  Express Server  │────▶│  load_session   │
│  Telegram       │     │  /telegram/      │     │  (Convex)       │
│  "Hola"         │     │  webhook         │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │  Recuperar      │
                                                │  checkpoint     │
                                                │  de Convex      │
                                                └────────┬────────┘
                                                          │
                                    ┌─────────────────────┴─────────────────────┐
                                    │                                           │
                                    ▼                                           ▼
                          ┌─────────────────┐                         ┌─────────────────┐
                          │  Sesión nueva   │                         │  Sesión existe  │
                          │  Crear en DB    │                         │  Restaurar      │
                          └────────┬────────┘                         └────────┬────────┘
                                   │                                           │
                                   └─────────────────────┬─────────────────────┘
                                                         │
                                                         ▼
                                               ┌─────────────────┐
                                               │  status:        │
                                               │  "handed_off"?  │
                                               └────────┬────────┘
                                                        │
                                           ┌────────────┴────────────┐
                                           │                         │
                                           ▼                         ▼
                                    ┌────────────┐           ┌────────────┐
                                    │   SÍ       │           │    NO      │
                                    │  Ignorar   │           │  Continuar │
                                    │  mensaje   │           │  flujo     │
                                    └────────────┘           └────────────┘
```

**Pasos detallados:**

1. **Ingreso del Request:** El cliente escribe por Telegram (ej. "Hola, quiero pedir")
2. **Gateway (Express):** El servidor recibe el webhook en `/telegram/webhook`
3. **Carga de Sesión (Convex):** 
   - LangGraph usa `ConvexHttpClient` para buscar el `chatId` en la tabla `sessions`
   - Recupera el estado anterior desde la tabla `checkpoints`
4. **Manejo de Pausas:** Si la sesión tiene `status: "handed_off"` (un humano tomó el control), el bot ignora silenciosamente el mensaje y aborta el grafo

### 4.2 Fase 1: Enrutamiento e Intención (analyze_message)

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Mensaje        │────▶│  Vercel AI SDK   │────▶│  Gemini 3       │
│  "Quiero 2      │     │  generateText()  │     │  gemma-27b      │
│  hamburguesas"  │     │                  │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                ┌─────────────────┐
                                                │  Clasificación  │
                                                │  de Intención   │
                                                └────────┬────────┘
                                                          │
                     ┌────────────────┬───────────────────┼───────────────────┬────────────────┐
                     │                │                   │                   │                │
                     ▼                ▼                   ▼                   ▼                ▼
            ┌────────────┐    ┌────────────┐     ┌────────────┐      ┌────────────┐   ┌────────────┐
            │  greeting  │    │    faq     │     │   order    │      │ complaint  │   │  unknown   │
            │  "Hola"    │    │  "¿Horario?"│    │"2 hamburg" │      │ "Estoy     │   │            │
            │            │    │            │     │            │      │  enojado"  │   │            │
            └─────┬──────┘    └─────┬──────┘     └─────┬──────┘      └─────┬──────┘   └─────┬──────┘
                  │                 │                  │                   │                │
                  ▼                 ▼                  ▼                   ▼                ▼
         greeting_handler    faq_handler      order_handler       handoff_node      format_response
```

**Clasificación de Intenciones:**

| Intención | Ejemplo | Ruta |
|-----------|---------|------|
| `greeting` | "Hola", "Buenas" | `greeting_handler` |
| `faq` | "¿A qué hora cierran?", "¿Qué tienen?" | `faq_handler` |
| `order` | "Quiero 2 hamburguesas", "Me das una pizza" | `order_handler` |
| `complaint` | "Estoy molesto", "Quiero hablar con alguien" | `handoff_node` |

**FAQ Específico - Métodos de Pago:**
Si el cliente pregunta: "¿Aceptan transferencia?", Gemma lo clasifica como `faq`. El nodo `faq_handler` lee la base de datos y responde: "Por el momento, en nuestro MVP solo aceptamos pago en efectivo al momento de recibir tu pedido."

### 4.3 Fase 2: Consolidación del Carrito (Cero Alucinaciones)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         ORDER HANDLER NODE                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. INYECCIÓN DE MENÚ REAL                                                   │
│     Query a Convex (tabla menu)                                              │
│     Solo ítems donde disponible === true                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. EXTRACCIÓN ESTRUCTURADA (Vercel AI SDK + Zod)                           │
│                                                                              │
│     Cliente: "Quiero 2 hamburguesas clásicas"                               │
│                                                                              │
│     Se fuerza a Gemini a responder con JSON estricto mediante Zod:          │
│     { producto: "Hamburguesa Clásica", cantidad: 2 }                        │
│                                                                              │
│     ⚠️ Si la IA intenta inventar "Pizza", Zod arroja error                  │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. VALIDACIÓN Y CÁLCULO (validate_order)                                    │
│                                                                              │
│     - Cruza JSON con tabla precios en Convex                                 │
│     - Calcula subtotal: 2 × $7.000 = $14.000                                │
│     - Verifica campos faltantes en AgentState                               │
│     - Marca orderStatus como "incompleto"                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Esquema Zod para Extracción:**

```typescript
const OrderItemSchema = z.object({
  producto: z.string(),
  cantidad: z.number().int().positive().default(1),
});

const OrderExtractionSchema = z.object({
  items: z.array(OrderItemSchema),
});
```

### 4.4 Fase 3: Logística y Cálculo de Efectivo (Flujo Lineal)

Como no hay links de pago, esta fase es una simple recolección de datos obligatorios.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    FLUJO DE LOGÍSTICA Y PAGO                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Paso 1: Solicitud de Tipo de Entrega
┌─────────────────────────────────────────────────────────────────────────────┐
│  Bot: "Anoté 2 clásicas (Total: $14.000). ¿Prefieres delivery o pasar a    │
│        retirar?"                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 2a: Si es Delivery
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cliente: "Delivery a Calle Falsa 123"                                      │
│  Sistema: Extrae dirección, calcula envío ($2.000)                          │
│  Total actualizado: $16.000                                                 │
└─────────────────────────────────────────────────────────────────────────────┘

Paso 2b: Si es Pickup
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cliente: "Paso a retirar"                                                  │
│  Sistema: No suma envío                                                     │
│  Total: $14.000                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 3: Pregunta de Pago en Efectivo
┌─────────────────────────────────────────────────────────────────────────────┐
│  Bot: "Perfecto. El total con envío es $16.000. El pago es únicamente      │
│        en efectivo al recibir. ¿Con qué billete vas a pagar para enviarte  │
│        el vuelto?"                                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 4: Extracción Numérica y Validación
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cliente: "Con 20 mil"                                                      │
│                                                                              │
│  Zod extrae: montoAbono: 20000                                              │
│                                                                              │
│  Validación TypeScript:                                                     │
│  if (montoAbono < total) {                                                  │
│    return "El monto no alcanza. El total es $16.000"                       │
│  }                                                                           │
│                                                                              │
│  Cálculo de vuelto: 20000 - 16000 = $4.000                                  │
│  orderStatus → "completo"                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 4.5 Fase 4: Confirmación Final y Commit a Base de Datos

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      CONFIRMACIÓN Y CIERRE                                   │
└─────────────────────────────────────────────────────────────────────────────┘

Paso 1: Resumen de Cierre
┌─────────────────────────────────────────────────────────────────────────────┐
│  Bot: "Resumen: 2 Clásicas a Calle Falsa 123.                              │
│        Total: $16.000. Pagas con $20.000 (vuelto: $4.000).                 │
│        ¿Confirmo tu pedido?"                                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 2: Confirmación del Cliente
┌─────────────────────────────────────────────────────────────────────────────┐
│  Cliente: "Sí, confirmo"                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 3: Persistencia en Convex
┌─────────────────────────────────────────────────────────────────────────────┐
│  Mutación en tabla pedidos:                                                  │
│                                                                              │
│  {                                                                           │
│    "sessionId": "jd7k...",                                                  │
│    "items": [{"producto": "Hamburguesa Clásica", "cantidad": 2}],          │
│    "tipoEntrega": "delivery",                                               │
│    "direccion": "Calle Falsa 123",                                          │
│    "metodoPago": "efectivo",                                                │
│    "total": 16000,                                                          │
│    "montoAbonado": 20000,                                                   │
│    "vuelto": 4000,                                                          │
│    "estado": "confirmado",                                                  │
│    "createdAt": 1709123456                                                  │
│  }                                                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 4: Limpieza de Memoria
┌─────────────────────────────────────────────────────────────────────────────┐
│  - Se borra el carrito en el checkpoint de Convex                           │
│  - El bot despide al cliente con ETA                                        │
│  Bot: "¡Pedido confirmado! Estará listo en ~30 min. Te avisamos cuando     │
│        esté en camino."                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Casos Transversales

### 5.1 Handoff a Humano (Integración whatsapp-cloud-inbox)

El MVP utiliza [whatsapp-cloud-inbox](https://github.com/gokapso/whatsapp-cloud-inbox) integrado en `/admin` para gestionar las conversaciones derivadas.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    HANDOFF FLOW                                              │
└─────────────────────────────────────────────────────────────────────────────┘

Trigger: analyze_message detecta intención "complaint"
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. DETECCIÓN                                                                │
│     Cliente: "¡Mi comida está fría!" o "Quiero hablar con alguien"          │
│     Gemini clasifica como "complaint"                                        │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. ACTUALIZACIÓN DE ESTADO                                                  │
│     handoff_node actualiza sesión en Convex:                                │
│     status: "handed_off"                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. NOTIFICACIÓN AL ADMIN                                                    │
│     Express envía alerta a whatsapp-cloud-inbox:                            │
│     "⚠️ ALERTA: El usuario @clienteX necesita atención humana.             │
│      La IA ha sido pausada para este chat."                                 │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  4. GESTIÓN EN INBOX                                                         │
│     - Operador ve conversación en /admin (whatsapp-cloud-inbox)             │
│     - Puede leer historial completo desde Convex                            │
│     - Responde manualmente al cliente                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  5. REACTIVACIÓN DE IA                                                       │
│     Admin actualiza status en Convex a "active"                             │
│     El bot reanuda atención automática                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Características del Inbox (whatsapp-cloud-inbox):**
- Bandeja de entrada compartida para operadores
- Historial completo de conversaciones
- Asignación de conversaciones a operadores específicos
- Etiquetado y categorización
- Búsqueda de conversaciones pasadas
- Integración nativa con WhatsApp Business API (preparado para Fase 2)

### 5.2 Sistema AI Judge (Testing Interno)

El sistema AI Judge permite validar el comportamiento del bot antes de deploy.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AI JUDGE TESTING FLOW                                     │
└─────────────────────────────────────────────────────────────────────────────┘

Paso 1: Vitest dispara test automatizado
┌─────────────────────────────────────────────────────────────────────────────┐
│  Script (cliente falso) envía JSON POST a /message:                         │
│  { "message": "Quiero 1 hamburguesa y pago con 5 mil" }                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 2: Procesamiento
┌─────────────────────────────────────────────────────────────────────────────┐
│  - LangGraph procesa usando bases de datos efímeras (o mocks de Convex)    │
│  - Devuelve respuesta por la API                                            │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
Paso 3: Evaluación
┌─────────────────────────────────────────────────────────────────────────────┐
│  AI Judge Agent (otro flujo de LangGraph independiente) evalúa:             │
│  - ¿Calculó bien el vuelto?                                                 │
│  - ¿Mencionó que era solo en efectivo?                                      │
│  - ¿Solicitó dirección correctamente?                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                           ┌──────────┴──────────┐
                           │                     │
                           ▼                     ▼
                    ┌────────────┐        ┌────────────┐
                    │   PASS     │        │   FAIL     │
                    │  Test OK   │        │  Bloquea   │
                    │            │        │  deploy    │
                    └────────────┘        └────────────┘
```

**Ubicación:** `src/judge/`
- `judge-agent.ts` - Agente evaluador
- `judge-types.ts` - Tipos para evaluación
- `test-battery.ts` - Batería de tests
- `test-runner.ts` - Ejecutor de tests
- `report-generator.ts` - Generador de reportes

### 5.3 Backoffice y Observabilidad

#### Panel de Administración (`/admin`)

Los dueños del restaurante gestionan todo desde `/admin`:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ADMIN PANEL (/admin)                                      │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │   GESTIÓN MENÚ      │  │   GESTIÓN FAQ       │  │   INBOX HANDOFF     │ │
│  │                     │  │                     │  │                     │ │
│  │  - Productos        │  │  - Preguntas        │  │  - Conversaciones   │ │
│  │  - Precios          │  │  - Respuestas       │  │    derivadas        │ │
│  │  - Disponibilidad   │  │  - Temas            │  │  - Asignación       │ │
│  │                     │  │                     │  │  - Historial        │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │   CONTROL DE STOCK EN TIEMPO REAL                                       ││
│  │                                                                          ││
│  │   Si se quedan sin pan → Cambian disponible a false en /admin           ││
│  │   Efecto inmediato: order_handler ya no inyecta hamburguesa al LLM      ││
│  │   El cliente nunca sabe que existió ese producto hoy                    ││
│  └─────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Observabilidad (Langfuse)

Si las variables de entorno están configuradas:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LANGFUSE DASHBOARD                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  Cada ejecución de Gemini registra:                                         │
│  - Latencia: "La fase de extracción con Zod tardó 1.2s"                    │
│  - Tokens: "150 tokens de input, 15 de output"                              │
│  - Costo estimado por conversación                                          │
│  - Trazas completas del flujo LangGraph                                     │
│  - Entorno por traza (`langfuse.environment`: `dev` | `prod` | `judge`)     │
└─────────────────────────────────────────────────────────────────────────────┘
```

Convención vigente de tags para trazas del judge:
- `ai-judge`
- `category:<categoria>`

El tag `judge-agent` queda deprecado y no debe usarse.

---

## 6. Requerimientos Funcionales (RF)

### 6.1 Recepción y Contexto
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-001 | El sistema debe recibir mensajes entrantes desde Telegram | Alta | ✅ Implementado |
| RF-002 | El sistema debe extraer identificador del cliente (`chat_id`) | Alta | ✅ Implementado |
| RF-003 | El sistema debe buscar sesión existente por chat_id en Convex | Alta | ✅ Implementado |
| RF-004 | Si no existe sesión, el sistema debe crear registro inicial en Convex | Alta | ✅ Implementado |
| RF-005 | El sistema debe mantener memoria conversacional via checkpoints en Convex | Alta | ✅ Implementado |
| RF-006 | Si la sesión tiene status "handed_off", el bot debe ignorar el mensaje | Alta | Pendiente |

### 6.2 Orquestación de Intenciones
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-007 | El sistema debe clasificar la consulta en: greeting, FAQ, order, complaint | Alta | ✅ Implementado |
| RF-008 | El sistema debe enrutar al subflujo FAQ para menú/consultas | Alta | ✅ Implementado |
| RF-009 | El sistema debe enrutar al subflujo Pedidos para intenciones de compra | Alta | ✅ Implementado |
| RF-010 | El sistema debe derivar a humano ante queja (handoff_node) | Alta | Pendiente |

### 6.3 Consultas (Subflujo FAQ)
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-011 | El sistema debe consultar tablas `Menu` y `FAQ` según la intención | Alta | ✅ Implementado |
| RF-012 | Ante consulta compuesta, debe poder consultar múltiples fuentes | Media | ✅ Implementado |
| RF-013 | Si no hay datos, debe retornar señal `DATO_NO_ENCONTRADO` sin inventar | Alta | ✅ Implementado |
| RF-014 | El sistema debe informar que solo acepta efectivo ante consultas de pago | Alta | ✅ Implementado |

### 6.4 Gestión de Pedidos (Subflujo Order)
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-015 | El sistema debe construir estado acumulado del pedido | Alta | ✅ Implementado |
| RF-016 | El sistema debe validar productos contra tabla `Precios` con Zod | Alta | ✅ Implementado |
| RF-017 | El sistema debe inferir "Retiro en sucursal" cuando detecte intención pickup | Media | ✅ Implementado |
| RF-018 | Si no se especifica cantidad, asumir cantidad = 1 | Media | ✅ Implementado |
| RF-019 | El sistema debe calcular total = precio_unitario × cantidad | Alta | ✅ Implementado |
| RF-020 | El sistema debe marcar pedido como `completo`, `incompleto` o `error_producto` | Alta | ✅ Implementado |
| RF-021 | El sistema debe identificar campos faltantes y solicitarlos | Alta | ✅ Implementado |
| RF-022 | Solo con estado `completo`, actualizar tabla `Pedidos` | Alta | ✅ Implementado |

### 6.5 Logística y Pago en Efectivo
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-023 | El sistema debe solicitar tipo de entrega (delivery/pickup) | Alta | ✅ Implementado |
| RF-024 | Si es delivery, el sistema debe solicitar dirección | Alta | ✅ Implementado |
| RF-025 | El sistema debe calcular costo de envío si aplica | Media | Pendiente |
| RF-026 | El sistema debe preguntar con cuánto va a pagar el cliente | Alta | Pendiente |
| RF-027 | El sistema debe validar que montoAbono >= total | Alta | Pendiente |
| RF-028 | El sistema debe calcular vuelto = montoAbono - total | Alta | Pendiente |

### 6.6 Redacción y Respuesta
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-029 | El sistema debe transformar salida técnica en respuesta legible | Alta | ✅ Implementado |
| RF-030 | La redacción debe respetar instrucciones del agente de control | Alta | ✅ Implementado |
| RF-031 | El sistema debe enviar respuesta al mismo chat de origen | Alta | ✅ Implementado |

### 6.7 Handoff y Administración
| ID | Requerimiento | Prioridad | Estado |
|----|---------------|-----------|--------|
| RF-032 | El sistema debe integrar whatsapp-cloud-inbox en /admin para handoff | Alta | Pendiente |
| RF-033 | Los operadores deben poder ver historial de conversaciones derivadas | Alta | Pendiente |
| RF-034 | Los operadores deben poder reactivar la IA después de handoff | Media | Pendiente |
| RF-035 | El admin debe poder gestionar productos (CRUD) desde /admin | Alta | ✅ Implementado |
| RF-036 | El admin debe poder gestionar FAQ (CRUD) desde /admin | Alta | ✅ Implementado |

---

## 7. Requerimientos No Funcionales (RNF)

### 7.1 Seguridad y Privacidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-001 | Las credenciales API no deben exponerse en respuestas | Restricción Externa |
| RNF-002 | Minimizar exposición de datos personales | Restricción Externa |
| RNF-003 | Las respuestas no deben filtrar estructura interna | Restricción del Producto |

### 7.2 Calidad de Información
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-004 | El sistema NO debe inventar productos, precios, horarios | Restricción del Producto |
| RNF-005 | Las respuestas deben ser consistentes con datos de Convex | Restricción del Producto |
| RNF-006 | Validación estricta con Zod para evitar alucinaciones | Restricción del Producto |

### 7.3 Rendimiento y Disponibilidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-007 | Tiempo de respuesta ≤10s (P95) | Restricción del Producto |
| RNF-008 | Tolerar mensajes consecutivos sin corromper estado | Restricción del Producto |
| RNF-009 | Checkpoints frecuentes para preservar contexto | Restricción del Producto |

### 7.4 Mantenibilidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-010 | Prompts versionados en Git | Restricción Organizacional |
| RNF-011 | Requerimientos trazables hasta pruebas | Restricción Organizacional |
| RNF-012 | Tests automatizados con AI Judge | Restricción Organizacional |

### 7.5 Observabilidad
| ID | Requerimiento | Clasificación |
|----|---------------|---------------|
| RNF-013 | Trazas en Langfuse (si está configurado) | Restricción del Producto |
| RNF-014 | Métricas de latencia y tokens visibles | Restricción del Producto |
| RNF-015 | Cada traza debe incluir `langfuse.environment` con valores `dev`, `prod` o `judge` según resolución por request | Restricción del Producto |

---

## 8. Reglas de Negocio

| ID | Regla |
|----|-------|
| RN-001 | Un pedido es `completo` solo si tiene: producto válido, cantidad > 0, dirección o retiro, montoAbono >= total |
| RN-002 | Si el usuario corrige un dato, se sobrescribe el valor previo |
| RN-003 | Si el usuario no menciona un campo, se conserva el valor previo en memoria |
| RN-004 | Si el producto no matchea con `Precios`, se marca `error_producto` |
| RN-005 | Ante detección de frustración/queja, derivar a humano via whatsapp-cloud-inbox |
| RN-006 | El pago es únicamente en efectivo (sin pasarelas de pago) |
| RN-007 | El vuelto se calcula como montoAbono - total, y debe ser >= 0 |
| RN-008 | Solo productos con `disponible: true` se muestran al cliente |

---

## 9. Modelo de Datos (Convex Schema)

### 9.1 Entidades Principales

```typescript
// convex/schema.ts
export default defineSchema({
  // Sesiones conversacionales
  sessions: defineTable({
    chatId: v.string(),
    phoneNumber: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    status: v.string(), // "active" | "handed_off"
  }).index("by_chatId", ["chatId"]),

  // Checkpoints de LangGraph (memoria)
  checkpoints: defineTable({
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(), // JSON serializado del AgentState
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
    tipoEntrega: v.string(), // "delivery" | "pickup"
    metodoPago: v.string(), // Siempre "efectivo" en MVP
    montoAbonado: v.number(), // Con cuánto paga
    vuelto: v.number(), // Cambio a devolver
    nombreCliente: v.optional(v.string()),
    total: v.number(),
    estado: v.string(), // "incompleto" | "completo" | "confirmado"
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
    aliases: v.optional(v.array(v.string())), // Nombres alternativos
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

---

## 10. Interfaces Externas

| ID | Interfaz | Descripción | Estado |
|----|----------|-------------|--------|
| IE-001 | Telegram Bot API | Webhook para mensajes entrantes y salientes | ✅ Activo |
| IE-002 | Google Gemini API | Modelo `gemma-3-27b-it` via Vercel AI SDK | ✅ Activo |
| IE-003 | Convex | Base de datos y funciones serverless | ✅ Activo |
| IE-004 | Langfuse | Observabilidad de IA (opcional) | ⚠️ Condicional |
| IE-005 | whatsapp-cloud-inbox | Inbox para handoff humano | 🔄 Pendiente |

---

## 11. Criterios de Aceptación

| ID | Criterio | Estado |
|----|----------|--------|
| CA-001 | Dada consulta de menú, el bot responde con items/precios reales sin inventar | ✅ |
| CA-002 | Dado pedido parcial, el bot solicita exactamente los campos faltantes | ✅ |
| CA-003 | Dado pedido completo, el bot confirma y persiste en `Pedidos` | ✅ |
| CA-004 | Dada pregunta fuera de base de conocimiento, responde con "no encontrado" | ✅ |
| CA-005 | Dada queja o solicitud de humano, inicia flujo de handoff | 🔄 |
| CA-006 | El sistema calcula correctamente el vuelto para pagos en efectivo | 🔄 |
| CA-007 | El sistema rechaza montos de pago menores al total | 🔄 |
| CA-008 | AI Judge valida flujos antes de deploy | ✅ |
| CA-009 | Handoff permite a operadores ver y responder conversaciones | 🔄 |
| CA-010 | Admin puede activar/desactivar productos en tiempo real | ✅ |

---

## 12. Matriz de Trazabilidad

### 12.1 Objetivos de Negocio → Requerimientos

| Objetivo de Negocio | RF Relacionados |
|---------------------|-----------------|
| Responder consultas automáticamente | RF-007, RF-008, RF-011, RF-012 |
| Convertir conversaciones en pedidos | RF-009, RF-015 a RF-022 |
| Mantener contexto por cliente | RF-003, RF-004, RF-005 |
| Escalar a handoff humano | RF-010, RF-032, RF-033 |
| Gestionar pagos en efectivo | RF-026, RF-027, RF-028 |

### 12.2 Requerimientos → Tests

| RF | Test | Archivo |
|----|------|---------|
| RF-007 | Clasificación de intenciones | `conversation-assistant.test.ts` |
| RF-011 | Consultas Menu/FAQ | `conversation-assistant.test.ts` |
| RF-015-022 | Flujos de pedido | `conversation-assistant.test.ts` |
| RF-005 | Checkpoints en Convex | `convex-conversation-repository.ts` |
| RF-026-028 | Cálculo de vuelto | `order-calculator.test.ts` |

---

## 13. Backlog de Implementación

### 13.1 Prioridad Alta (MVP Core)

| Prio | ID | Título | Descripción | Estado |
|------|----|----|-------------|--------|
| 1 | MVP-01 | Cálculo de vuelto | Implementar lógica de montoAbono y vuelto | 🔄 Pendiente |
| 2 | MVP-02 | Validación de monto | Rechazar montos menores al total | 🔄 Pendiente |
| 3 | MVP-03 | Handoff node | Implementar handoff_node en LangGraph | 🔄 Pendiente |
| 4 | MVP-04 | whatsapp-cloud-inbox | Integrar inbox en /admin | 🔄 Pendiente |
| 5 | MVP-05 | Estado handed_off | Ignorar mensajes cuando sesión está derivada | 🔄 Pendiente |

### 13.2 Prioridad Media (Mejoras)

| Prio | ID | Título | Descripción | Estado |
|------|----|----|-------------|--------|
| 6 | MED-01 | Costo de envío | Cálculo automático según zona | 🔄 Pendiente |
| 7 | MED-02 | Notificaciones admin | Alertas en tiempo real para handoff | 🔄 Pendiente |
| 8 | MED-03 | Métricas dashboard | KPIs en /admin | 🔄 Pendiente |

### 13.3 Prioridad Baja (Post-MVP)

| Prio | ID | Título | Descripción | Estado |
|------|----|----|-------------|--------|
| 9 | LOW-01 | WhatsApp channel | Migrar de Telegram a WhatsApp | 🔄 Pendiente |
| 10 | LOW-02 | Multi-idioma | Soporte para otros idiomas | 🔄 Pendiente |

---

## 14. Estimación de Costos

### 14.1 MVP (Desarrollo + Testing)

| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Developer) | $0/mes |
| Gemini API (dev) | $10-30/mes |
| Langfuse (Hobby) | $0/mes |
| Telegram Bot | $0/mes |
| **Total** | **$10-30/mes** |

### 14.2 Producción (50k interacciones/mes)

| Servicio | Costo Estimado |
|----------|----------------|
| Convex (Pro) | $50-100/mes |
| Gemini API | $50-150/mes |
| Langfuse (Pro) | $199/mes |
| Hosting (Cloud Run) | $50-150/mes |
| **Total** | **$350-600/mes** |

---

## 15. Pendientes y TBD

| ID | Descripción | Responsable |
|----|-------------|-------------|
| TBD-001 | Integración completa de whatsapp-cloud-inbox en /admin | Dev Team |
| TBD-002 | Definir políticas de retención de datos en Convex | Dev Team |
| TBD-003 | Documentar runbooks operativos para handoff | Ops |
| TBD-004 | Configurar alertas de monitoreo | Dev Team |
| TBD-005 | Decisión sobre migración a WhatsApp vs mantener Telegram | Product |

---

## 16. Hardening de Producción (2026-03-04)

### 16.1 Resumen de Mejoras

Se implementó un conjunto completo de mejoras de seguridad, resiliencia y observabilidad para preparar el sistema para producción:

| Categoría | Componentes | Estado |
|-----------|-------------|--------|
| Seguridad | JWT Auth, CORS, Helmet, Rate Limiting, Signature Validation | ✅ Implementado |
| Resiliencia | Circuit Breakers, Graceful Degradation | ✅ Implementado |
| Observabilidad | Langfuse Tracing, Structured Logging | ✅ Implementado |
| Operaciones | Graceful Shutdown, Health Checks | ✅ Implementado |

### 16.2 Detalle de Componentes de Seguridad

#### SEC-1: Validación de Firma de Telegram
- **Archivo:** `src/routes/telegram-webhook.ts`
- **Propósito:** Validar que las peticiones provienen realmente de Telegram
- **Implementación:** Comparación timing-safe del header `X-Telegram-Bot-Api-Secret-Token`
- **Corrección aplicada:** Se corrigió el uso de `??` por `||` en la comparación timing-safe porque `charCodeAt()` retorna `NaN` (no `undefined`) para índices fuera de rango. El operador `??` no detecta `NaN`, mientras que `||` sí lo convierte a `0`.

```typescript
// Antes (bug):
result |= (a.charCodeAt(i) ?? 0) ^ (b.charCodeAt(i) ?? 0);

// Después (corregido):
result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
```

#### SEC-2: CORS Configurable
- **Archivo:** `src/middleware/cors.ts`
- **Propósito:** Prevenir acceso no autorizado desde orígenes no permitidos
- **Configuración:** Variable de entorno `ALLOWED_ORIGINS` (lista separada por comas)
- **Comportamiento:** En producción, rechaza todas las peticiones si no hay orígenes configurados

#### SEC-3: Rate Limiting
- **Archivo:** `src/middleware/rate-limiter.ts`
- **Propósito:** Proteger contra ataques de fuerza bruta
- **Limitadores pre-configurados:**
  - `authRateLimiter`: 10 req/min por IP, bloqueo de 15 min
  - `telegramRateLimiter`: 60 req/min por chat ID
  - `apiRateLimiter`: 100 req/min por IP

**Limitación conocida:** El store en memoria no coordina entre múltiples instancias. Para deployments con múltiples instancias, considerar:
1. Redis-based distributed rate limiter
2. Sticky sessions en el load balancer
3. Single instance con auto-scaling groups

#### SEC-5: JWT con Token Revocation
- **Archivo:** `src/middleware/jwt-auth.ts`
- **Propósito:** Autenticación de rutas admin con soporte para revocación de tokens
- **Mejora aplicada:** Se agregó cache local al `ConvexTokenVersionStore` para manejar fallas de Convex. Durante una interrupción de Convex, el cache local preserva la versión más alta conocida de cada usuario, evitando que tokens revocados sean aceptados.

```typescript
// Antes: Retornaba 0 en error (aceptaba todos los tokens durante outage)
async getVersion(userId: string): Promise<number> {
  try {
    return await this.convex.query(...);
  } catch (error) {
    return 0; // ❌ Problemático
  }
}

// Después: Usa cache local como fallback
async getVersion(userId: string): Promise<number> {
  try {
    const version = await this.convex.query(...);
    this.localCache.set(userId, version); // Actualiza cache
    return version;
  } catch (error) {
    return this.localCache.get(userId) ?? 0; // ✅ Respeta revocaciones previas
  }
}
```

### 16.3 Componentes de Resiliencia

#### Circuit Breakers
- **Archivo:** `src/resilience/circuit-breaker.ts`
- **Propósito:** Prevenir fallos en cascada cuando servicios externos no están disponibles
- **Instancias configuradas:**
  - `GeminiCircuitBreaker`: Threshold de 5 fallos, reset de 30s
  - `ConvexCircuitBreaker`: Threshold de 3 fallos, reset de 15s

#### Graceful Degradation
- **Archivo:** `src/resilience/graceful-degradation.ts`
- **Propósito:** Proporcionar respuestas de fallback cuando servicios están degradados
- **Respuestas de fallback:** Mensajes en español para FAQs, pedidos, y errores generales

### 16.4 Observabilidad

#### Langfuse Tracing Mejorado
- **Archivo:** `src/services/langfuse.ts`
- **Nuevas capacidades:**
  - `LangfuseTracingService` class con manejo de spans
  - Trazas para nodos de LangGraph, llamadas LLM, operaciones de BD
  - Soporte para atributos personalizados y eventos

#### Resolución de Entorno de Tracing por Request (finalizado)
- **Archivos:** `src/routes/tracing-environment.ts`, `src/routes/message.ts`, `src/routes/telegram-webhook.ts`
- **Comportamiento implementado:**
  - `judge`: para flujos AI-as-a-Judge (override explícito del flujo de evaluación).
  - `dev`: para requests con host local (`localhost`, `127.0.0.1`, `0.0.0.0`, `::1`).
  - `prod`: para requests con host no local.
- **Detalle técnico:** el resolver compartido `tracing-environment.ts` calcula el entorno por request y se aplica en ambas rutas de entrada (`/message` y `/telegram/webhook`).

#### Conteo de Tokens y Costos (ajuste 2026-03-04)
- **Archivos:** `src/services/token-usage.ts`, `src/services/conversation-tracing.ts`, `src/judge/judge-agent.ts`
- **Problema detectado:** En algunos modelos Gemini, `outputTokens` podia llegar como `0` o con formatos no estandar (ej. wrappers tipo `{intValue: ...}`), subestimando costo en Langfuse.
- **Mejora aplicada:**
  - Normalizacion robusta de usage (`input/output/total`) con soporte para campos alternativos y anidados.
  - Fallback por estimacion de tokens de salida cuando el proveedor no reporta completion tokens.
  - Acumulacion por traza (no solo ultimo span) para evitar perdida de tokens en flujos multi-nodo.
  - Atributos OTel/Langfuse saneados para evitar payloads no escalares en metadata.
  - Hotfix 2026-03-05: `withLlmTracing` ahora infiere texto de salida tambien desde objetos (`output.text`/`output.content`) para poder estimar `outputTokens` cuando el proveedor devuelve `0`.
  - `token-usage` ahora parsea wrappers OTel stringificados (ej. `"{\"intValue\": 123}"`).

#### AI-as-a-Judge integrado con Langfuse
- **Archivos:** `src/services/langfuse-evals.ts`, `src/judge/test-runner.ts`, `src/scripts/run-judge-tests.ts`
- **Capacidades nuevas:**
  - Upload automatico de scores por test (`judge.overall`, criterios, `judge.pass`).
  - Provision automatica de `Score Configs` y asociacion por `configId` para estandarizar metricas.
  - Creacion/actualizacion de Dataset + Dataset Items para la bateria del judge.
  - Vinculacion de ejecuciones a Dataset Run Items para comparacion de runs en Langfuse.
  - Flush explicito de telemetry + eval queue al finalizar el runner.
  - Hotfix 2026-03-05: `score-create` envia siempre `traceId` y usa `observationId` solo cuando hay `traceId` valido.
  - Se agregaron tests de regresion en `src/services/langfuse-evals.test.ts` para prevenir HTTP 207/400 por payloads invalidos.
  - Auto-sync de model pricing en Langfuse para modelos custom/no listados, evitando costos vacios cuando hay tokens.
  - Optimizacion de prompt del judge: elimina duplicacion del ultimo reply, resume instrucciones del sistema y usa FAQ relevante por categoria para bajar tokens/costo.
  - Limpieza semántica de tags del judge: se conservan solo `ai-judge` y `category:<categoria>`; se elimina el uso del tag `judge-agent`.

#### Trazabilidad E2E en `/message`
- **Archivos:** `src/services/conversation-assistant.ts`, `src/routes/message.ts`
- **Mejora aplicada:**
  - Cada request HTTP ahora retorna `traceId`/`observationId` y `metrics.tokens` cuando el assistant detallado esta disponible.
  - El grafo principal de conversacion queda instrumentado por nodo con `conversation-tracing`.
  - Se registra `trace input/output` y manejo de errores con fallback, preservando trazabilidad de degradacion.
  - El assistant recibe `tracingEnvironment` y lo propaga al servicio de tracing para mantener consistencia de entorno por request.

#### Atributo `langfuse.environment` en spans raíz e hijos
- **Archivo:** `src/services/conversation-tracing.ts`
- **Comportamiento implementado:**
  - Se setea `langfuse.environment` en el span raíz de la conversación.
  - Se replica `langfuse.environment` en spans hijos para mantener segmentación consistente en toda la traza.

#### Structured Logging
- **Archivo:** `src/utils/logger.ts`
- **Características:**
  - Output JSON en producción, pretty-print en desarrollo
  - Niveles configurables via `LOG_LEVEL`
  - Trace ID propagation para correlación de requests

### 16.5 Configuración de Variables de Entorno

Ver `.env.example` para la configuración completa. Variables clave:

| Variable | Propósito | Default |
|----------|-----------|---------|
| `TELEGRAM_WEBHOOK_SECRET` | Validación de webhooks | (required in prod) |
| `JWT_SECRET` | Firma de tokens | (required) |
| `ALLOWED_ORIGINS` | CORS origins | (required in prod) |
| `GEMINI_CIRCUIT_FAILURE_THRESHOLD` | Fallos antes de abrir circuito | 5 |
| `CONVEX_CIRCUIT_FAILURE_THRESHOLD` | Fallos antes de abrir circuito | 3 |
| `LOG_LEVEL` | Nivel de logging | INFO |
| `TOKEN_STORE_BACKEND` | Backend para token versions | memory |
| `LANGFUSE_TRACING_ENVIRONMENT` | Entorno de tracing Langfuse (`auto` para resolver dinámicamente por request) | `auto` |
| `LANGFUSE_JUDGE_DATASET_NAME` | Nombre del dataset usado por AI Judge en Langfuse | `judge-test-battery` |
| `LANGFUSE_MODEL_PRICING_MODEL_NAME` | Nombre del modelo para pricing custom en Langfuse | (opcional) |
| `LANGFUSE_MODEL_PRICING_MATCH_PATTERN` | Regex de matching para aplicar pricing al modelo | `(?i)^(<model>)$` |
| `LANGFUSE_MODEL_PRICING_UNIT` | Unidad de pricing en Langfuse (`TOKENS`, etc.) | `TOKENS` |
| `LANGFUSE_MODEL_PRICING_INPUT_PRICE_PER_1M` | Precio de input por 1M tokens (USD) | (opcional) |
| `LANGFUSE_MODEL_PRICING_OUTPUT_PRICE_PER_1M` | Precio de output por 1M tokens (USD) | (opcional) |
| `LANGFUSE_MODEL_PRICING_JSON` | Lista JSON de pricing para multiples modelos custom | (opcional) |

### 16.6 Operación de UI Langfuse

Para evitar confusiones en la consola de Langfuse:

- Scores y costos aparecen en `Scores` y en detalle de `Tracing/Observations`.
- Dataset runs del judge aparecen en `Datasets` (dataset `judge-test-battery` o el configurado).
- La pantalla `LLM-as-a-Judge` lista Evaluators de Langfuse creados desde UI.
- Los uploads por API de este proyecto (`scores` + `datasets`) no crean evaluators UI automaticamente; por eso esa vista puede verse vacia aunque haya datos.
- El runner imprime una guia de navegacion al terminar para ubicar rapido cada artefacto.

### 16.7 Estado de Validación de Implementación

- `npm run build` ✅
- `npm test` ✅

---

## 17. Control de Versiones

| Versión | Fecha | Autor | Cambios |
|---------|-------|-------|---------|
| 1.0 | 2026-02-27 | Equipo | Versión inicial (SRS-v1.md) |
| 2.0 | 2026-02-28 | Equipo | Plan de construcción progresiva, Fase 0-1 detalladas |
| 3.0 | 2026-03-02 | Equipo | MVP definitivo: solo efectivo, cálculo de vuelto, whatsapp-cloud-inbox para handoff, workflow end-to-end completo |
| 3.1 | 2026-03-04 | Equipo | Hardening de producción: seguridad (JWT, CORS, rate limiting), resiliencia (circuit breakers, graceful degradation), observabilidad (tracing, logging estructurado) |
| 3.2 | 2026-03-04 | Equipo | Langfuse AI quality loop: normalización robusta de tokens/costos, métricas de trazas en `/message`, y upload nativo de scores/dataset-runs para AI-as-a-Judge |
| 3.3 | 2026-03-05 | Equipo | Hotfix Langfuse Judge: corrección de payloads de `score` (sin `observationId` huérfano), deduplicación de targets y tests de regresión |
| 3.4 | 2026-03-05 | Equipo | Hotfix de costos/tokens: estimación de `outputTokens` cuando `extractOutput` es objeto, soporte de wrappers OTel stringificados y tests de regresión en tracing/token usage |
| 3.5 | 2026-03-05 | Equipo | Auto-sincronización de pricing de modelos en Langfuse para habilitar cálculo de costos en modelos custom (ej. gemma) |
| 3.6 | 2026-03-05 | Equipo | Optimización de prompts del AI Judge: menos contexto redundante y selección de FAQ relevante por categoría para reducir tokens y latencia |
| 3.7 | 2026-03-05 | Equipo | Estandarización de Score Configs + runbook de navegación UI (explica por qué `LLM-as-a-Judge` puede verse vacío) |
| 3.8 | 2026-03-05 | Equipo | Alineación SRS con implementación actual: resolver compartido de `tracingEnvironment`, clasificación `dev/prod/judge`, propagación de `langfuse.environment`, tags del judge (`ai-judge` + `category:<categoria>`) y validación build/test |

---

*Este documento define el MVP definitivo basado en el stack tecnológico implementado (LangGraph, Convex, Vercel AI SDK, Gemini, Zod) e integra whatsapp-cloud-inbox para la gestión de conversaciones derivadas a operadores humanos.*
