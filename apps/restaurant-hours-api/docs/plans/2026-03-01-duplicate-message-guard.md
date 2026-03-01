# Duplicate Message Guard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stop duplicate conversational requests from reapplying the same order on the same session.

**Architecture:** Persist a tiny dedupe fingerprint in the conversation checkpoint, detect duplicates before routing, and short-circuit to the previous response without mutating the order draft.

**Tech Stack:** TypeScript, LangGraph state machine, existing checkpoint persistence

---

### Task 1: Lock the duplicate-order case with a failing test

**Files:**
- Modify: `src/services/conversation-assistant.test.ts`

**Step 1: Write the failing test**

- Repeat the same order message on the same `chatId` inside a short fake-timer window.
- Assert the second response equals the first.
- Assert the order total stays unchanged.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/conversation-assistant.test.ts`

Expected: FAIL with the doubled total.

### Task 2: Add duplicate detection to persisted conversation state

**Files:**
- Modify: `src/services/conversation-assistant.ts`

**Step 1: Extend persisted state**

- Add last normalized message
- Add last handled timestamp
- Add last response text

**Step 2: Detect duplicates before routing**

- Compare the current normalized text with the last handled message.
- If it is the same and within the dedupe window, short-circuit.

**Step 3: Return the previous response without mutating state**

- Reuse the stored response text
- Do not merge items again

### Task 3: Verify the project

**Files:**
- No code changes expected

**Step 1: Run verification**

Run: `npm test`

Run: `npm run build`

**Step 2: Rebuild and smoke test**

Run: `docker compose up -d --build api`

Expected: duplicate order request on same `chatId` returns the original `$20700`, not `$41400`
