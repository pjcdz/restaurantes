# Admin Catalog Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a simple internal `/admin` page so staff can view and edit menu, FAQ, and prices from the browser.

**Architecture:** Add a small admin repository over existing Convex list/upsert functions, create an Express route that renders HTML on GET and accepts form POSTs, and mount it into the app. Keep the page server-rendered and minimal.

**Tech Stack:** Express, TypeScript, Convex HTTP client, server-rendered HTML

---

### Task 1: Lock the admin route contract with failing tests

**Files:**
- Create: `src/admin.test.ts`

**Step 1: Write the failing tests**

- `GET /admin` returns HTML containing sample menu/price/faq rows.
- `POST /admin/menu` redirects after saving.
- `POST /admin/prices` normalizes aliases.
- `POST /admin/faq` redirects after saving.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/admin.test.ts`

Expected: FAIL because the admin route does not exist.

### Task 2: Add the admin repository

**Files:**
- Create: `src/services/convex-admin-repository.ts`

**Step 1: Implement minimal repository**

- List catalog snapshot from Convex.
- Upsert menu item.
- Upsert price entry.
- Upsert FAQ entry.

### Task 3: Add the admin route

**Files:**
- Create: `src/routes/admin.ts`
- Modify: `src/app.ts`

**Step 1: Implement GET `/admin`**

- Load catalog from the admin repository.
- Render HTML with sections for menu, prices, and FAQ.

**Step 2: Implement POST handlers**

- `/admin/menu`
- `/admin/prices`
- `/admin/faq`

Each should validate required form fields, call the repository, and redirect back to `/admin`.

**Step 3: Wire the route into the app**

- Add `express.urlencoded`
- Mount `/admin`

### Task 4: Verify the project

**Files:**
- No code changes expected

**Step 1: Run verification**

Run: `npm test`

Run: `npm run build`

**Step 2: Rebuild and smoke test**

Run: `docker compose up -d --build api`

Expected: `GET http://localhost:3001/admin` serves the admin page
