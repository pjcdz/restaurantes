# Ngrok Webhook Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add repo-managed scripts to start an `ngrok` tunnel for the local API and register the current tunnel as the Telegram webhook.

**Architecture:** Keep the existing Express app unchanged and add a small scripting layer under `scripts/`. Use the local `ngrok` binary from project dependencies for tunneling, and a TypeScript utility script to read the active tunnel URL from `ngrok`'s local API before calling Telegram `setWebhook`.

**Tech Stack:** Node.js, TypeScript, `tsx`, `ngrok`, built-in `fetch`, Vitest

---

### Task 1: Add webhook utility tests

**Files:**
- Create: `src/scripts/webhook-utils.test.ts`
- Create: `src/scripts/webhook-utils.ts`

**Step 1: Write the failing test**

Add tests for:
- selecting the first HTTPS tunnel from an `ngrok` API payload
- building the final Telegram webhook URL with `/telegram/webhook`
- throwing when no HTTPS tunnel exists

**Step 2: Run test to verify it fails**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: FAIL because the new utility module does not exist yet.

**Step 3: Write minimal implementation**

Implement the smallest parser/helpers needed to satisfy the tests in `src/scripts/webhook-utils.ts`.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/scripts/webhook-utils.ts src/scripts/webhook-utils.test.ts
git commit -m "test: add ngrok webhook utility coverage"
```

### Task 2: Add runtime scripts for tunneling and webhook registration

**Files:**
- Create: `scripts/set-telegram-webhook.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Expand `src/scripts/webhook-utils.test.ts` if needed to cover any missing behavior required by the runtime script.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: FAIL for the newly added assertion.

**Step 3: Write minimal implementation**

Create a script that:
- validates `TELEGRAM_BOT_TOKEN`
- requests `http://127.0.0.1:4040/api/tunnels`
- resolves an HTTPS tunnel URL
- calls `https://api.telegram.org/bot<TOKEN>/setWebhook`
- prints the registered webhook URL

Update `package.json` with:
- a `tunnel` script that starts `ngrok http ${PORT:-3000}`
- a `webhook:set` script that runs the new TypeScript helper through `tsx`

**Step 4: Run test to verify it passes**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json scripts/set-telegram-webhook.ts src/scripts/webhook-utils.ts src/scripts/webhook-utils.test.ts
git commit -m "feat: add ngrok tunnel and webhook scripts"
```

### Task 3: Install dependency and document usage

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `README.md`

**Step 1: Add dependency**

Install `ngrok` as a dev dependency so the local binary is available through `npm run`.

**Step 2: Document the workflow**

Add concise instructions for:
- starting the API
- starting the tunnel
- registering the webhook
- optional webhook inspection

**Step 3: Verify project**

Run:
- `npm test`
- `npm run build`

Expected:
- all tests pass
- TypeScript build succeeds

**Step 4: Commit**

```bash
git add package.json package-lock.json README.md
git commit -m "docs: document local Telegram webhook workflow"
```
