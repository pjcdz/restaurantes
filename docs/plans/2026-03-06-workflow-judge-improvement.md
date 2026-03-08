# Workflow Judge Stability Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Recuperar la categoría `workflow` del AI judge corrigiendo el bucle conversacional en el flujo de retiro (`pickup`).

**Architecture:** Mantener el flujo actual y corregir detección semántica de follow-up para variantes de lenguaje natural (`para retirar`). Se valida con test unitario dirigido + re-ejecución del judge por categoría.

**Tech Stack:** TypeScript, Vitest, LangGraph conversation assistant, AI Judge runner.

---

### Task 1: Baseline y diagnóstico

**Files:**
- Test: `apps/restaurant-hours-api/src/judge/test-battery.ts`

**Step 1: Ejecutar baseline de workflow**

Run: `cd apps/restaurant-hours-api && node dist/scripts/run-judge-tests.js --category workflow --verbose --json /tmp/workflow-before.json`
Expected: obtener score por caso (`W1..W3`).

**Step 2: Identificar causa raíz**

Revisar `actualResponses` de `W2`.
Expected: loop repitiendo `¿Es para delivery o retiro?` tras `Para retirar`.

### Task 2: TDD para flujo pickup con lenguaje natural

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.ts`

**Step 1: RED - agregar test de pickup workflow con `Para retirar`**

Secuencia:
1. `Mándame dos bacon king`
2. `Para retirar`
3. `Te pago con efectivo`
4. `Soy Maria`

El test debe validar que el flujo avance y no repita la misma pregunta.

**Step 2: Ejecutar test y confirmar falla**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts`
Expected: FAIL antes del fix.

**Step 3: GREEN - ampliar detección de follow-up**

Agregar soporte para `retirar` en:
- `isOrderFollowUpMessage`
- `updateOrderDraftWithMessage`
- `looksLikeNameOnlyMessage` (palabras excluidas)

**Step 4: Ejecutar tests y confirmar PASS**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts`
Expected: PASS.

### Task 3: Revalidación en AI judge

**Files:**
- Test: `apps/restaurant-hours-api/src/judge/test-battery.ts`

**Step 1: Ejecutar workflow post-fix**

Run: `cd apps/restaurant-hours-api && node dist/scripts/run-judge-tests.js --category workflow --verbose --json /tmp/workflow-after.json`
Expected: `3/3` pass.

**Step 2: Comparar before/after**

Comparar `passRate`, `avgScore` y score `W2` entre `/tmp/workflow-before.json` y `/tmp/workflow-after.json`.

### Task 4: Cierre

**Files:**
- Modify: `docs/plans/2026-03-06-workflow-judge-improvement.md`

**Step 1: Registrar resultados reales**

Anotar baseline, fix aplicado y métricas finales.

**Step 2: Commit**

Run:
```bash
git add docs/plans/2026-03-06-workflow-judge-improvement.md \
  apps/restaurant-hours-api/src/services/conversation-assistant.ts \
  apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "fix: resolve workflow loop for pickup phrasing"
```

---

## Execution Results (2026-03-06)

- Baseline (`/tmp/workflow-before.json`):
  - `workflow`: `2/3` passed
  - `passRate`: `67%`
  - `avgScore`: `57`
  - Falla crítica: `W2=10` por loop en `¿Es para delivery o retiro?`.

- Fix aplicado:
  - Se agregó reconocimiento explícito de `retirar` en follow-up de pedido.
  - Se validó con test unitario nuevo de workflow pickup (`Para retirar`).

- Validación (`/tmp/workflow-after.json`):
  - `workflow`: `3/3` passed
  - `passRate`: `100%`
  - `avgScore`: `82`
  - `W2`: `10 -> 75`

- Tests locales:
  - `npm test -- src/services/conversation-assistant.test.ts` ✅
