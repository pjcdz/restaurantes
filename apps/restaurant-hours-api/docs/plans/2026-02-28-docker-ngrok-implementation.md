# Docker Ngrok Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the local `ngrok` workflow with a Docker-based stack that runs both the API and `ngrok`, while keeping webhook registration inside the repo.

**Architecture:** Add a Docker image for the API and a `docker compose` stack with `api` and `ngrok`. Keep webhook registration in TypeScript, but make the `ngrok` admin API URL configurable so the same script works with the Docker stack.

**Tech Stack:** Node.js, TypeScript, Express, Docker, Docker Compose, `tsx`, built-in `fetch`, Vitest

---

### Task 1: Extend webhook utility coverage for configurable ngrok API URLs

**Files:**
- Modify: `src/scripts/webhook-utils.test.ts`
- Modify: `src/scripts/webhook-utils.ts`

**Step 1: Write the failing test**

Add a test covering the default `ngrok` admin API URL and a second test covering an override from `process.env.NGROK_API_URL`.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: FAIL because the URL resolver does not exist yet.

**Step 3: Write minimal implementation**

Add a helper that returns:
- `process.env.NGROK_API_URL` when present
- otherwise `http://127.0.0.1:4040/api/tunnels`

**Step 4: Run test to verify it passes**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add src/scripts/webhook-utils.ts src/scripts/webhook-utils.test.ts
git commit -m "test: cover configurable ngrok api url"
```

### Task 2: Rework runtime scripts for Docker-based ngrok

**Files:**
- Delete: `src/scripts/start-ngrok.ts`
- Modify: `src/scripts/set-telegram-webhook.ts`
- Modify: `package.json`

**Step 1: Write the failing test**

Expand `src/scripts/webhook-utils.test.ts` if needed for any missing helper used by the runtime script.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: FAIL for the new assertion.

**Step 3: Write minimal implementation**

Update the webhook registration script to:
- load `.env`
- use the configurable `ngrok` admin API URL helper
- keep registering the Telegram webhook exactly as before

Update npm scripts to:
- remove the local `tunnel` command
- add `docker:up` for `docker compose up --build`
- add `docker:down` for `docker compose down`
- add `docker:webhook:set` for the existing TypeScript webhook registration script with `NGROK_API_URL=http://127.0.0.1:4040/api/tunnels`

**Step 4: Run test to verify it passes**

Run: `npm test -- src/scripts/webhook-utils.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add package.json src/scripts/set-telegram-webhook.ts src/scripts/webhook-utils.ts src/scripts/webhook-utils.test.ts
git commit -m "feat: switch webhook scripts to docker-based ngrok"
```

### Task 3: Add Docker assets and update docs

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker-compose.yml`
- Modify: `.env`
- Modify: `README.md`
- Modify: `package-lock.json`

**Step 1: Add container assets**

Create:
- a `Dockerfile` for the API container
- a `.dockerignore`
- a `docker-compose.yml` with `api` and `ngrok`

**Step 2: Add environment requirements**

Update `.env` to include a placeholder for `NGROK_AUTHTOKEN`.

**Step 3: Document the Docker workflow**

Document:
- `npm run docker:up`
- `npm run docker:webhook:set`
- `npm run docker:down`
- the need for `NGROK_AUTHTOKEN`

**Step 4: Verify project**

Run:
- `npm test`
- `npm run build`
- `docker compose config`

Expected:
- all tests pass
- TypeScript build succeeds
- compose configuration is valid

**Step 5: Commit**

```bash
git add Dockerfile .dockerignore docker-compose.yml .env README.md package-lock.json
git commit -m "chore: add docker compose ngrok workflow"
```
