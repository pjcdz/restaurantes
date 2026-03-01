# Convex Aliases And Natural Language Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Store editable product aliases in Convex and improve the assistant so it understands more natural user phrasing for menu, ordering, payment, and order completion.

**Architecture:** Extend the `precios` data model to persist aliases per product, normalize those aliases on read/write, and make the assistant resolve products from explicit aliases before falling back to product-name phrase matching. Keep the conversation graph structure, but broaden the deterministic intent and entity extraction rules to cover more realistic Spanish phrasing.

**Tech Stack:** TypeScript, Vitest, Convex, LangGraph

---

### Task 1: Lock The New Behavior In Tests

**Files:**
- Modify: `src/services/conversation-assistant.test.ts`

**Step 1: Write failing tests**
- Add a test that uses a stored alias like `bk` to resolve `Bacon King`.
- Add a test that menu-style natural language like `que me recomendas?` returns the menu summary.
- Add a test that an order can be completed with `para delivery`, `mi direccion es ...`, `te pago con mercado pago`, and `soy ...`.

**Step 2: Run the focused test file**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: FAIL because aliases are not persisted in the catalog type and some natural-language phrases are not recognized.

### Task 2: Add Editable Aliases In Convex

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/conversations.ts`

**Step 1: Extend the `precios` schema**
- Add an optional `aliases` array to keep compatibility with existing records already stored in Convex.

**Step 2: Update public Convex functions**
- Return normalized `aliases` arrays from `listPriceEntries`.
- Allow `upsertPriceEntry` to receive aliases, normalize them, and persist them.

**Step 3: Push the schema and functions**

Run: `npx convex dev --once --tail-logs disable`

Expected: success

### Task 3: Update Assistant Matching And Natural Language Handling

**Files:**
- Modify: `src/services/conversation-assistant.ts`

**Step 1: Update catalog types**
- Include `aliases` in `CatalogPriceRecord`.

**Step 2: Use explicit aliases from Convex**
- Match by stored aliases first-class, then by product-name phrase containment.

**Step 3: Broaden natural-language handling**
- Recognize menu requests like `que me recomendas`.
- Parse order phrases like `mandame`, `dame`, `traeme`.
- Recognize `mercado pago` and cleaner delivery-address phrasing.

**Step 4: Run the focused test file**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: PASS

### Task 4: Backfill Real Aliases And Verify End To End

**Files:**
- No code changes required

**Step 1: Update the 4 current products in Convex**
- Call `conversations:upsertPriceEntry` with aliases for each product.

**Step 2: Run full verification**

Run:
- `npm test`
- `npm run build`
- `npx convex run conversations:listPriceEntries '{}'`

**Step 3: Run a real conversation in the `api` container**
- Exercise `que me recomendas?`, `mandame una clasica`, `para delivery`, `mi direccion es ...`, `te pago con mercado pago`, and `soy ...`.

**Step 4: Confirm the transcript is coherent**
- Menu is shown.
- Alias-based order works.
- Payment and address are understood.
- Final order summary is returned.
