# Restaurant Hours MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a standalone TypeScript HTTP app that returns whether the restaurant is open or closed using the local Buenos Aires time.

**Architecture:** A small Express service exposes `POST /message` and delegates business-hour evaluation to a deterministic service module. Tests cover both the pure availability logic and the HTTP contract so the behavior stays stable as integrations are added later.

**Tech Stack:** TypeScript, Node.js, Express, Vitest, Supertest

---

### Task 1: Bootstrap the TypeScript app

**Files:**
- Create: `apps/restaurant-hours-api/package.json`
- Create: `apps/restaurant-hours-api/tsconfig.json`
- Create: `apps/restaurant-hours-api/vitest.config.ts`
- Create: `apps/restaurant-hours-api/.gitignore`

**Step 1: Write the failing setup expectation**

Document the required scripts:

```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc -p tsconfig.json",
    "start": "node dist/server.js",
    "test": "vitest run"
  }
}
```

**Step 2: Run setup command to verify the app does not exist yet**

Run: `ls apps/restaurant-hours-api`
Expected: missing directory / failure

**Step 3: Write the minimal project scaffolding**

Create the package manifest, TypeScript config, Vitest config, and ignore `node_modules` and `dist`.

**Step 4: Install dependencies**

Run: `npm install`
Expected: packages installed without audit blockers

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api
git commit -m "chore: bootstrap restaurant hours api"
```

### Task 2: Add failing tests for business-hour logic

**Files:**
- Create: `apps/restaurant-hours-api/src/services/restaurant-hours.test.ts`
- Create: `apps/restaurant-hours-api/src/config.ts`

**Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { getRestaurantAvailability } from "./restaurant-hours";

describe("getRestaurantAvailability", () => {
  it("returns open during business hours", () => {
    const result = getRestaurantAvailability(new Date("2026-02-28T15:00:00.000Z"));
    expect(result.status).toBe("open");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- restaurant-hours.test.ts`
Expected: FAIL because `restaurant-hours` module does not exist

**Step 3: Write minimal implementation**

Create configuration constants and a service that converts the input date to `America/Argentina/Buenos_Aires`, derives hour/minute, and returns `{ open, status, message }`.

**Step 4: Run test to verify it passes**

Run: `npm test -- restaurant-hours.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/config.ts apps/restaurant-hours-api/src/services/restaurant-hours.test.ts apps/restaurant-hours-api/src/services/restaurant-hours.ts
git commit -m "feat: add restaurant availability logic"
```

### Task 3: Add failing tests for the HTTP endpoint

**Files:**
- Create: `apps/restaurant-hours-api/src/app.test.ts`
- Create: `apps/restaurant-hours-api/src/routes/message.ts`

**Step 1: Write the failing test**

```ts
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";

describe("POST /message", () => {
  it("returns the availability payload", async () => {
    const response = await request(createApp()).post("/message").send({ message: "hola" });
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("status");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npm test -- app.test.ts`
Expected: FAIL because `createApp` does not exist

**Step 3: Write minimal implementation**

Create the Express app factory, JSON middleware, and the route that validates a JSON object body and returns the availability payload.

**Step 4: Run test to verify it passes**

Run: `npm test -- app.test.ts`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/app.test.ts apps/restaurant-hours-api/src/app.ts apps/restaurant-hours-api/src/routes/message.ts
git commit -m "feat: add message endpoint"
```

### Task 4: Add the server entrypoint and verify the full suite

**Files:**
- Create: `apps/restaurant-hours-api/src/server.ts`

**Step 1: Write the failing runtime expectation**

Document the startup contract:

```ts
const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => {
  console.log(`Restaurant hours API listening on port ${port}`);
});
```

**Step 2: Run the build to verify the entrypoint is missing**

Run: `npm run build`
Expected: FAIL because `src/server.ts` does not exist

**Step 3: Write minimal implementation**

Create the server file that imports `createApp`, resolves the port, and starts the HTTP server.

**Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/restaurant-hours-api/src/server.ts
git commit -m "feat: add server entrypoint"
```

### Task 5: Verify production readiness for the MVP

**Files:**
- Modify: `docs/plans/2026-02-28-restaurant-hours-mvp-design.md`

**Step 1: Run the build**

Run: `npm run build`
Expected: PASS and `dist/` generated

**Step 2: Run the endpoint locally**

Run: `npm start`
Expected: server starts on the configured port

**Step 3: Exercise the endpoint**

Run: `curl -s -X POST http://localhost:3000/message -H 'content-type: application/json' -d '{"message":"hola"}'`
Expected: JSON payload with `open`, `status`, and `message`

**Step 4: Confirm the design doc still matches the behavior**

Verify that the documented contract and business rules match the implementation.

**Step 5: Commit**

```bash
git add docs/plans/2026-02-28-restaurant-hours-mvp-design.md apps/restaurant-hours-api
git commit -m "docs: finalize restaurant hours mvp"
```
