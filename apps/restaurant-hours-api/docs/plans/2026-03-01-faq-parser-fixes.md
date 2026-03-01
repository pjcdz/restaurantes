# FAQ And Parser Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make FAQ horario queries use the loaded Convex data and allow order parsing to resolve full product names plus partial aliases.

**Architecture:** Keep the existing Convex schema and improve the local assistant logic only. The fix removes the hardcoded horario shortcut, adds keyword-aware FAQ matching, and changes order resolution to match catalog prices by normalized phrases and derived aliases.

**Tech Stack:** TypeScript, Vitest, LangGraph, Convex client

---

### Task 1: Lock The Broken Behavior In Tests

**Files:**
- Modify: `src/services/conversation-assistant.test.ts`

**Step 1: Write the failing tests**
- Add a test proving `horarios` returns the FAQ answer stored in the catalog.
- Add a test proving `Quiero 2 bacon king` creates an order from a multi-word product name.
- Add a test proving `Quiero 1 bacon` resolves the same product through a partial alias.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: FAIL on the new assertions because horarios is intercepted by a hardcoded response and the parser only keeps the last token.

### Task 2: Implement The Minimal Assistant Fix

**Files:**
- Modify: `src/services/conversation-assistant.ts`

**Step 1: Replace the hardcoded horario shortcut**
- Remove the early horario response in the FAQ handler.
- Add keyword-aware FAQ matching that checks normalized topic text and comma-separated keyword phrases.

**Step 2: Improve product parsing and lookup**
- Change order parsing to preserve the product phrase instead of only the last token.
- Add helper logic to normalize phrases word-by-word.
- Resolve price entries by exact full-name match first, then phrase containment, then partial aliases derived from product tokens.

**Step 3: Run the focused test suite**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: PASS

### Task 3: Verify End To End

**Files:**
- No code changes required

**Step 1: Run full verification**

Run:
- `npm test`
- `npm run build`

**Step 2: Run a real conversation in the `api` container**
- Exercise `horarios`, a full product name, and a partial alias in one session.

**Step 3: Confirm the transcript matches expected behavior**
- `horarios` must return the loaded FAQ answer.
- `bacon king` and `bacon` must both resolve to the stored price entry.
