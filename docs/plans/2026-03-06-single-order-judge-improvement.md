# Single Order Judge Compatibility Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recuperar la categoría `single_order` del AI judge (actualmente 0/4) evitando fallbacks técnicos causados por desalineación de validadores Convex.

**Architecture:** Mantener la lógica del asistente y agregar compatibilidad hacia atrás en el repositorio Convex: si una mutación falla por `extra field`, reintentar automáticamente sin ese campo. Esto desacopla el runtime del estado de despliegue Convex y evita romper pedidos/checkpoints.

**Tech Stack:** TypeScript, Vitest, Convex HTTP client, LangGraph checkpointer.

---

### Task 1: Confirmar baseline de falla en single_order

**Files:**
- Test: `apps/restaurant-hours-api/src/judge/test-battery.ts`

**Step 1: Ejecutar baseline de judge por categoría**

Run: `cd apps/restaurant-hours-api && npm run test:judge -- --category single_order --verbose --json /tmp/single-order-before.json`
Expected: `0/4` o score < 75 en los casos `O1..O4`.

**Step 2: Validar causa en logs**

Run: revisar logs del servidor en ejecución para `ArgumentValidationError`.
Expected: errores por `extra field` en `saveCheckpoint` y/o `upsertPedidoForSession`.

### Task 2: Escribir tests que fallen para compatibilidad de mutaciones

**Files:**
- Create: `apps/restaurant-hours-api/src/services/convex-conversation-repository.test.ts`
- Modify: `apps/restaurant-hours-api/src/services/convex-conversation-repository.ts`

**Step 1: Test RED para retry de checkpoint**

Escribir un test donde la primera mutación falle por `extra field metadata` y la segunda pase.
Verificar que el segundo intento excluya `metadata`.

**Step 2: Test RED para retry de pedido**

Escribir un test donde `upsertPedidoForSession` falle por `extra field montoAbono` y reintente sin ese campo.
Verificar que el retorno normalice `montoAbono` a `null` si el backend no lo devuelve.

**Step 3: Ejecutar tests y confirmar falla inicial**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/convex-conversation-repository.test.ts`
Expected: FAIL antes del fix.

### Task 3: Implementar fallback compatible en ConvexConversationRepository

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/convex-conversation-repository.ts`

**Step 1: Agregar parser de campo inválido**

Implementar helper que detecte `Object contains extra field \`<field>\`` desde errores de Convex.

**Step 2: Agregar wrapper de retry por mutación**

Implementar método interno que:
- intente mutación normal,
- si hay `extra field`, elimine ese campo del payload,
- reintente hasta agotar campos removibles.

**Step 3: Aplicar wrapper a `saveCheckpoint` y `upsertOrderForSession`**

Usar compatibilidad sólo en esas mutaciones.
Normalizar respuesta de pedido para siempre exponer `montoAbono` (`number | null`).

### Task 4: Verificar unit tests del fix

**Files:**
- Test: `apps/restaurant-hours-api/src/services/convex-conversation-repository.test.ts`
- Test: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`

**Step 1: Ejecutar tests target**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/convex-conversation-repository.test.ts src/services/conversation-assistant.test.ts`
Expected: PASS.

### Task 5: Verificar impacto en AI judge

**Files:**
- Test: `apps/restaurant-hours-api/src/judge/test-battery.ts`

**Step 1: Reejecutar single_order**

Run: `cd apps/restaurant-hours-api && npm run test:judge -- --category single_order --verbose --json /tmp/single-order-after.json`
Expected: mejora clara versus baseline; objetivo mínimo `>= 3/4`.

**Step 2: Comparar before/after**

Comparar `summary` y `failedTests` entre `/tmp/single-order-before.json` y `/tmp/single-order-after.json`.

### Task 6: Cierre

**Files:**
- Modify: `docs/plans/2026-03-06-single-order-judge-improvement.md`

**Step 1: Registrar resultados reales**

Anotar pass rate final, casos resueltos y riesgos residuales.

**Step 2: Commit**

Run:
```bash
git add docs/plans/2026-03-06-single-order-judge-improvement.md \
  apps/restaurant-hours-api/src/services/convex-conversation-repository.ts \
  apps/restaurant-hours-api/src/services/convex-conversation-repository.test.ts
git commit -m "fix: add convex mutation compatibility for single-order flow"
```

---

## Execution Results (2026-03-06)

- Baseline (`/tmp/single-order-before.json`):
  - `single_order`: `0/4` passed
  - `passRate`: `0%`
  - `avgScore`: `43`
  - Respuesta observada: fallback técnico por errores de validación Convex.

- Fix aplicado:
  - Compatibilidad de mutaciones Convex en runtime con retry automático cuando aparece:
    - `Object contains extra field \`metadata\``
    - `Object contains extra field \`montoAbono\``
  - Reintento con payload sin el campo incompatible.
  - Normalización de retorno de pedido con `montoAbono: null` cuando backend legado no lo devuelve.

- Validación (`/tmp/single-order-after.json`):
  - `single_order`: `4/4` passed
  - `passRate`: `100%`
  - `avgScore`: `94`
  - Casos: `O1=95`, `O2=95`, `O3=90`, `O4=95`.

- Tests locales:
  - `npm test -- src/services/convex-conversation-repository.test.ts` ✅
  - `npm test -- src/services/conversation-assistant.test.ts` ✅
