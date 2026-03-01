# Multi-Item Order Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add structured extraction and multi-item order state so the assistant supports multiple products in one or many messages while preserving valid items and asking clarification only for invalid ones.

**Architecture:** Introduce a small AI extraction layer that returns structured order lines, then process those lines through deterministic helpers that validate against Convex aliases, merge quantities, recalculate totals, and build clarification responses. Keep LangGraph as the state machine, but expand state to track extracted and invalid lines explicitly.

**Tech Stack:** TypeScript, Vitest, LangGraph, AI SDK, Convex

---

### Task 1: Lock New Behavior In Tests

**Files:**
- Modify: `src/services/conversation-assistant.test.ts`

**Step 1: Write the failing tests**
- Add a test for multiple valid products in one message.
- Add a test for adding products across separate messages.
- Add a test for summing quantity when the same product is added twice.
- Add a test for partial-valid / partial-invalid extraction keeping valid items.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: FAIL because current logic only supports one parsed line and overwrites `orderDraft.items`.

### Task 2: Introduce Structured Extraction Boundary

**Files:**
- Modify: `src/services/conversation-assistant.ts`
- Modify: `src/services/default-conversation-assistant.ts` (only if wiring changes require it)

**Step 1: Add new state and types**
- Add multi-line extracted order state, invalid lines, and validation result structures.

**Step 2: Add extraction abstraction**
- Create a small structured extraction function for order lines.
- In this iteration, keep it locally callable so it can later be backed by a model while remaining testable.

**Step 3: Add deterministic tools/helpers**
- Validate extracted lines against Convex aliases.
- Merge valid items into draft.
- Sum duplicate product quantities.
- Recompute totals and missing fields.
- Build clarification prompts for invalid lines only.

**Step 4: Update order handler flow**
- Stop replacing `orderDraft.items`.
- Apply the new merge rules and partial-failure behavior.

**Step 5: Run focused tests**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: PASS

### Task 3: Verify Whole App

**Files:**
- No additional code required

**Step 1: Run full verification**

Run:
- `npm test`
- `npm run build`

**Step 2: Rebuild local API container**

Run: `docker compose up -d --build api`

**Step 3: Exercise a real multi-item conversation**
- Test same-message multi-item: `quiero una clasica y una veggie`
- Test incremental add: `agregame una bacon`
- Test partial invalid: `sumame una crispy y una cosa rara`

**Step 4: Confirm expected behavior**
- Valid items remain persisted.
- Invalid item is the only thing that triggers clarification.
- Quantities and totals stay correct.
