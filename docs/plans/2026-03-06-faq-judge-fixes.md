# FAQ Judge Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Subir la categoría `faq` del AI Judge de 20% a >=75% evitando respuestas fuera de foco, preservando datos del catálogo y eliminando desvíos por fallback de pago.

**Architecture:** El fix se centra en 3 capas: (1) ruteo/intención para que preguntas FAQ de pago no entren al flujo transaccional cuando no hay pedido activo, (2) salida final para FAQ sin reescritura creativa que agregue menú/tono no deseado, y (3) tests de regresión para bloquear futuras caídas en FAQ. Se mantiene el flujo LangGraph actual y se ajustan nodos y guardrails de composición.

**Tech Stack:** TypeScript, LangGraph (`StateGraph`), Vitest, AI Judge runner (`tsx src/scripts/run-judge-tests.ts`).

---

### Task 1: Reproducir y congelar regresiones FAQ en tests

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`
- Test: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`

**Step 1: Write the failing test**

```ts
it("returns FAQ answer without appending menu content", async () => {
  const { repository } = createMemoryRepository({
    menu: [
      {
        item: "Bacon King",
        descripcion: "Burger",
        precio: 11200,
        categoria: "burger",
        disponible: true
      }
    ],
    faq: [
      {
        tema: "horario",
        pregunta: "hora, horario, abierto",
        respuesta: "Lunes a Viernes 11:00-22:00"
      }
    ]
  });

  const composeResponse = vi.fn(async () =>
    "¡Che! Hoy estamos abiertos. Tenemos estas opciones: Bacon King ($11200)."
  );

  const assistant = createConversationAssistant({ repository, composeResponse });

  const reply = await assistant.handleIncomingMessage({
    chatId: "faq-1",
    text: "Cual es el horario?"
  });

  expect(reply).toBe("Lunes a Viernes 11:00-22:00");
  expect(reply.toLowerCase()).not.toContain("tenemos estas opciones");
});

it("answers payment FAQ from catalog when there is no active order", async () => {
  const { repository } = createMemoryRepository({
    faq: [
      {
        tema: "pago",
        pregunta: "metodos de pago, mercado pago",
        respuesta: "Aceptamos efectivo, tarjeta y Mercado Pago."
      }
    ]
  });

  const assistant = createConversationAssistant({
    repository,
    composeResponse: async (input) => input.draftReply
  });

  const reply = await assistant.handleIncomingMessage({
    chatId: "faq-2",
    text: "Aceptan mercado pago?"
  });

  expect(reply).toContain("Mercado Pago");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts`
Expected: FAIL en al menos 1 test nuevo (respuesta FAQ contaminada con menú o flujo de pago no FAQ).

**Step 3: Write minimal implementation**

No aplicar aún en este task.

**Step 4: Run test to verify it passes**

No aplica en este task.

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "test: add FAQ regression coverage for judge failures"
```

### Task 2: Evitar reescritura LLM en respuestas FAQ focalizadas

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.ts`
- Test: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`

**Step 1: Write the failing test**

Usar el test de `Task 1` que valida que no se agregue menú ni tono extra a una respuesta FAQ directa.

**Step 2: Run test to verify it fails**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts -t "returns FAQ answer without appending menu content"`
Expected: FAIL

**Step 3: Write minimal implementation**

En `formatResponseNode(...)`, ampliar bypass de `composeResponse` para FAQ puro:

```ts
const isFaqDirectAnswer =
  intent === "faq" &&
  state.requestedActions.includes("answer_faq") &&
  !state.wantsMenu;

if (state.isDuplicate || intent === "order" || intent === "payment" || isFaqDirectAnswer) {
  return buildResponseUpdate(state.draftReply);
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts -t "returns FAQ answer without appending menu content"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/services/conversation-assistant.ts apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "fix: keep FAQ responses focused and deterministic"
```

### Task 3: Desambiguar FAQ de pago vs flujo transaccional de pago

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.ts`
- Test: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`

**Step 1: Write the failing test**

Agregar test que simule pregunta de método de pago sin pedido activo y asegure respuesta de FAQ sin depender de configuración transaccional.

```ts
it("does not require active payment config for standalone payment FAQ", async () => {
  const { repository } = createMemoryRepository({
    faq: [
      {
        tema: "pago",
        pregunta: "mercado pago, medios de pago",
        respuesta: "Aceptamos efectivo, transferencia y Mercado Pago."
      }
    ]
  });

  const assistant = createConversationAssistant({
    repository,
    composeResponse: async (input) => input.draftReply
  });

  const reply = await assistant.handleIncomingMessage({
    chatId: "faq-3",
    text: "Aceptan mercado pago?"
  });

  expect(reply).toBe("Aceptamos efectivo, transferencia y Mercado Pago.");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts -t "standalone payment FAQ"`
Expected: FAIL

**Step 3: Write minimal implementation**

En `paymentHandlerNode(...)`:

1. No pedir `getActivePaymentConfig()` al inicio.
2. Si no hay pedido activo y el mensaje es consulta de métodos, intentar `findFaqMatch(...)` con `catalog.faq` primero.
3. Solo consultar `getActivePaymentConfig()` cuando realmente se necesite flujo de pago transaccional.

Snippet objetivo:

```ts
const orderDraft = state.orderDraft ? cloneOrderDraft(state.orderDraft, state.chatId) : null;
const hasActiveOrder = Boolean(orderDraft && orderDraft.items.length > 0);
const paymentIntent = detectPaymentIntent(state.messageText);

if (!hasActiveOrder && (paymentIntent === "payment_methods" || paymentIntent === "payment_question")) {
  const catalog = requireCatalog(state.catalog);
  const faqMatch = findFaqMatch(catalog.faq, normalizeText(state.messageText));
  if (faqMatch) {
    return { draftReply: faqMatch.respuesta };
  }
}

const paymentConfig = repository.getActivePaymentConfig
  ? await repository.getActivePaymentConfig()
  : null;
```

**Step 4: Run test to verify it passes**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts -t "standalone payment FAQ"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/services/conversation-assistant.ts apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "fix: route standalone payment questions through FAQ first"
```

### Task 4: Endurecer matching FAQ y cobertura de variantes lingüísticas

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.ts`
- Test: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`

**Step 1: Write the failing test**

```ts
it("matches FAQ when question field is natural sentence (not comma keywords)", async () => {
  const { repository } = createMemoryRepository({
    faq: [
      {
        tema: "ubicacion",
        pregunta: "¿Dónde están ubicados?",
        respuesta: "Av. Corrientes 1234, CABA"
      }
    ]
  });

  const assistant = createConversationAssistant({
    repository,
    composeResponse: async (input) => input.draftReply
  });

  const reply = await assistant.handleIncomingMessage({
    chatId: "faq-4",
    text: "Donde estan ubicados?"
  });

  expect(reply).toContain("Corrientes");
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts -t "natural sentence"`
Expected: FAIL (si el dataset usa `pregunta` no tokenizada).

**Step 3: Write minimal implementation**

Mejorar `buildFaqTerms(...)` para incluir:

1. `tema` normalizado.
2. `pregunta` completa normalizada.
3. Keywords extraídas por separadores `,`, `?`, `.`, `;`, `:` y espacios (tokens >= 4 chars).

**Step 4: Run test to verify it passes**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts -t "natural sentence"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/services/conversation-assistant.ts apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "fix: improve FAQ matching for natural language questions"
```

### Task 5: Validación de impacto con AI Judge (FAQ)

**Files:**
- Modify: `apps/restaurant-hours-api/src/scripts/run-judge-tests.ts` (solo si se necesita logging extra)
- Test: `/tmp/faq-judge-after.json` (artifact)

**Step 1: Write the failing test**

No aplica (se usa benchmark judge existente).

**Step 2: Run test to verify it fails**

Run baseline ya observado: `faq` pass rate = 20%.

**Step 3: Write minimal implementation**

No aplica (implementado en tasks anteriores).

**Step 4: Run test to verify it passes**

1. Levantar API:
```bash
cd apps/restaurant-hours-api
set -a; source .env.local; set +a
npm run build && npm run start
```

2. Ejecutar judge FAQ:
```bash
cd apps/restaurant-hours-api
npm run test:judge -- --category faq --verbose --json /tmp/faq-judge-after.json
```

3. Criterio de aceptación:
- `passRate >= 75`
- Ninguna respuesta FAQ debe incluir menú salvo pregunta explícita de menú.
- Preguntas de pago FAQ deben incluir método pedido si está en catálogo (ej. Mercado Pago).

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/services/conversation-assistant.ts apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "fix: improve FAQ judge performance and response focus"
```

### Task 6: Verificación final completa (no solo FAQ)

**Files:**
- Test: `apps/restaurant-hours-api/src/services/*.test.ts`
- Test: judge suite completa

**Step 1: Write the failing test**

No aplica.

**Step 2: Run test to verify it fails**

No aplica.

**Step 3: Write minimal implementation**

No aplica.

**Step 4: Run test to verify it passes**

```bash
cd apps/restaurant-hours-api
npm test
npm run test:judge -- --verbose --json /tmp/judge-full-after.json
```

Expected:
- No regresiones en `order/payment/handoff/security/resilience`.
- FAQ >= 75% y mejora del average global.

**Step 5: Commit**

```bash
git add .
git commit -m "chore: validate FAQ fixes against full AI judge suite"
```
