# Telegram Restaurant Hours MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Telegram webhook endpoint to the existing restaurant-hours API so Telegram messages receive an open/closed reply in the same chat.

**Architecture:** Keep the existing HTTP service and business-hour logic intact, then add a Telegram-specific route and sender service. The route parses Telegram updates, reuses the deterministic availability service, and posts a plain text reply through the Bot API.

**Tech Stack:** TypeScript, Node.js, Express, Vitest, Supertest, native fetch

---

### Task 1: Add failing tests for the Telegram sender

**Files:**
- Create: `apps/restaurant-hours-api/src/services/telegram.test.ts`

**Step 1: Write the failing test**

Create a test that asserts `sendTelegramTextMessage` posts to the correct `sendMessage` endpoint with `chat_id` and `text`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/telegram.test.ts`
Expected: FAIL because the module does not exist

**Step 3: Write minimal implementation**

Create `src/services/telegram.ts` with a small sender wrapper using injected `fetch`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/services/telegram.test.ts`
Expected: PASS

### Task 2: Add failing tests for the Telegram webhook route

**Files:**
- Create: `apps/restaurant-hours-api/src/telegram-webhook.test.ts`
- Modify: `apps/restaurant-hours-api/src/app.ts`

**Step 1: Write the failing test**

Create a route-level test that POSTs a Telegram update to `/telegram/webhook` and asserts the app sends the computed reply using an injected sender.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/telegram-webhook.test.ts`
Expected: FAIL because the route does not exist

**Step 3: Write minimal implementation**

Create the Telegram webhook route, register it in the app, and ignore unsupported updates with `200`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/telegram-webhook.test.ts`
Expected: PASS

### Task 3: Verify the full service

**Files:**
- Modify: `apps/restaurant-hours-api/src/config.ts`

**Step 1: Run the full suite**

Run: `npm test`
Expected: PASS

**Step 2: Run the build**

Run: `npm run build`
Expected: PASS

**Step 3: Smoke test the webhook**

Run the server and POST a Telegram-shaped payload to `/telegram/webhook`.

Expected: `200` response and outbound send attempt with the availability message.
