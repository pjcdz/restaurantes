# HTTP ChatId And Calculator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prevent `/message` from leaking memory across requests by issuing a unique server-generated `chatId`, and move order math into a dedicated calculator helper.

**Architecture:** Keep `/message` on the existing assistant boundary, but replace the fixed anonymous id with an injected id factory. Add a small calculator module that becomes the single source of truth for order totals and line subtotals.

**Tech Stack:** Express, TypeScript, existing conversation assistant service

---

### Task 1: Lock the `/message` response contract with tests

**Files:**
- Modify: `src/app.test.ts`

**Step 1: Write the failing test**

- Update the happy-path test so the response includes both `chatId` and `reply`.
- Add a deterministic `createChatId` test double.
- Verify that a provided `chatId` is echoed back.
- Verify that missing `chatId` uses the generated id.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/app.test.ts`

Expected: FAIL because the route does not return `chatId`.

### Task 2: Add the calculator helper with tests

**Files:**
- Create: `src/services/order-calculator.ts`
- Create: `src/services/order-calculator.test.ts`

**Step 1: Write the failing test**

- Cover `Bacon King ($11200) + Veggie Power ($9500) = $20700`.
- Cover duplicate quantities for the same product.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/services/order-calculator.test.ts`

Expected: FAIL because the module does not exist.

**Step 3: Implement minimal calculator**

- Export a deterministic helper that returns subtotals and total from normalized items.

### Task 3: Wire `/message` and the assistant

**Files:**
- Modify: `src/routes/message.ts`
- Modify: `src/services/conversation-assistant.ts`

**Step 1: Implement `/message`**

- Add `createChatId` injection support.
- Generate `http:<id>` when no `chatId` is provided.
- Return `{ chatId, reply }`.

**Step 2: Use the calculator helper in the assistant**

- Replace inline total math with the calculator helper.
- Keep response strings aligned with calculator output.

**Step 3: Run focused tests**

Run: `npm test -- src/app.test.ts`

Run: `npm test -- src/services/order-calculator.test.ts`

Expected: PASS

### Task 4: Verify the full project

**Files:**
- No code changes expected

**Step 1: Run verification**

Run: `npm test`

Expected: PASS

Run: `npm run build`

Expected: PASS

**Step 2: Rebuild and smoke test**

Run: `docker compose up -d --build api`

Expected: API container recreated

Run: `curl -s -X POST http://localhost:3001/message -H 'content-type: application/json' -d '{"message":"quiero una bacon king y una veggie power"}'`

Expected: reply with `Total parcial: $20700` and a generated `chatId`
