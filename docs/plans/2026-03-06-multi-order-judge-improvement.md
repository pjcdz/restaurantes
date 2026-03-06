# Multi-Item Order Judge Quality Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Mejorar la calidad de `multi_order` en AI judge, específicamente el caso MO3 (acumulación de item repetido) para hacer la respuesta más clara y menos ambigua.

**Architecture:** Mantener el flujo de carrito actual y ajustar únicamente el formateo de respuesta cuando se agrega un item ya existente: reportar explícitamente la suma incremental y la cantidad acumulada en carrito.

**Tech Stack:** TypeScript, Vitest, LangGraph conversation assistant, AI Judge runner.

---

### Task 1: Baseline y diagnóstico

**Files:**
- Test: `apps/restaurant-hours-api/src/judge/test-battery.ts`

**Step 1: Ejecutar baseline multi_order**

Run: `cd apps/restaurant-hours-api && node dist/scripts/run-judge-tests.js --category multi_order --verbose --json /tmp/multi-order-before.json`
Expected: capturar score actual de `MO1..MO3`.

**Step 2: Detectar punto débil**

Revisar `actualResponses` y `reasoning` de `MO3`.
Expected: identificar falta de claridad sobre cantidad acumulada tras agregar item repetido.

### Task 2: TDD para respuesta acumulativa

**Files:**
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.test.ts`
- Modify: `apps/restaurant-hours-api/src/services/conversation-assistant.ts`

**Step 1: RED - ajustar test existente de incremento de cantidad**

Actualizar expectativa para exigir mensaje que explicite:
- cantidad agregada,
- cantidad acumulada,
- total parcial.

**Step 2: Ejecutar test y confirmar falla**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts`
Expected: FAIL por mensaje aún antiguo.

**Step 3: GREEN - implementar mensaje acumulativo**

Cambiar `buildOrderReply` para que cuando un producto ya existía y se agregan unidades, responda con formato tipo:
`Anotado: +1 X. Ahora llevas 2 X. Total parcial: $...`

**Step 4: Ejecutar tests y confirmar PASS**

Run: `cd apps/restaurant-hours-api && npm test -- src/services/conversation-assistant.test.ts`
Expected: PASS.

### Task 3: Revalidación con AI judge

**Files:**
- Test: `apps/restaurant-hours-api/src/judge/test-battery.ts`

**Step 1: Ejecutar judge post-fix**

Run: `cd apps/restaurant-hours-api && node dist/scripts/run-judge-tests.js --category multi_order --verbose --json /tmp/multi-order-after.json`
Expected: `3/3` mantenido y mejora de score en `MO3`.

**Step 2: Comparar before/after**

Comparar `avgScore` y score de `MO3` entre `/tmp/multi-order-before.json` y `/tmp/multi-order-after.json`.

### Task 4: Cierre

**Files:**
- Modify: `docs/plans/2026-03-06-multi-order-judge-improvement.md`

**Step 1: Registrar resultados reales**

Anotar baseline, score final y cambios aplicados.

**Step 2: Commit**

Run:
```bash
git add docs/plans/2026-03-06-multi-order-judge-improvement.md \
  apps/restaurant-hours-api/src/services/conversation-assistant.ts \
  apps/restaurant-hours-api/src/services/conversation-assistant.test.ts
git commit -m "fix: improve multi-order accumulated item reply clarity"
```

---

## Execution Results (2026-03-06)

- Baseline (`/tmp/multi-order-before.json`):
  - `multi_order`: `3/3` passed
  - `passRate`: `100%`
  - `avgScore`: `92`
  - Debilidad detectada: `MO3` en `85` por respuesta ambigua al sumar item repetido.

- Fix aplicado:
  - Ajuste de `buildOrderReply` para incrementos sobre item existente:
    - Antes: `Anotado: 1 X ($...). Total parcial...`
    - Después: `Anotado: +1 X. Ahora llevas 2 X. Total parcial...`
  - Se mantiene el formato anterior para altas no acumulativas.

- Validación (`/tmp/multi-order-after.json`):
  - `multi_order`: `3/3` passed
  - `passRate`: `100%`
  - `avgScore`: `95`
  - `MO3`: `85 -> 95`

- Tests locales:
  - `npm test -- src/services/conversation-assistant.test.ts` ✅
