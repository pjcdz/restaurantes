# Message Conversation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make `POST /message` use the same conversational assistant as Telegram instead of the restaurant-hours response.

**Architecture:** Reuse the existing `ConversationAssistant` boundary already used by the Telegram webhook. The `/message` route will validate the request body, resolve the assistant, invoke `handleIncomingMessage`, and return `{ reply }`.

**Tech Stack:** Express, TypeScript, existing conversation assistant service

---

### Task 1: Lock the new HTTP contract with tests

**Files:**
- Modify: `src/app.test.ts`

**Step 1: Write the failing test**

- Change the happy-path expectation so `/message` returns the assistant reply payload.
- Inject a fake `assistantService` into `createApp`.
- Add a new test for invalid or empty `message`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app.test.ts`

Expected: FAIL because `/message` still returns the legacy availability payload.

### Task 2: Swap `/message` to the assistant

**Files:**
- Modify: `src/routes/message.ts`

**Step 1: Implement minimal route change**

- Remove the `restaurant-hours` dependency from the route.
- Resolve the default assistant when one is not injected.
- Validate `body.message` as a non-empty string.
- Pass `chatId` if supplied, otherwise use a stable HTTP fallback id.
- Return `200` with `{ reply }`.

**Step 2: Run focused tests**

Run: `npm test -- src/app.test.ts`

Expected: PASS

### Task 3: Verify the app still works

**Files:**
- No code changes expected

**Step 1: Run verification**

Run: `npm test`

Expected: PASS

Run: `npm run build`

Expected: PASS

**Step 2: Rebuild the API container**

Run: `docker compose up -d --build api`

Expected: container recreated and healthy
