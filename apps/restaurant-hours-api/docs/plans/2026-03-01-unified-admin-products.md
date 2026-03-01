# Unified Admin Products Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify admin product management so one save updates both `menu` and `precios`, and one delete removes both.

**Architecture:** Add new Convex product-level admin functions, expose them through the admin repository, and refactor `/admin` to render a single `Productos` section plus FAQ. Keep chatbot reads unchanged so updates reflect automatically from Convex.

**Tech Stack:** Express, TypeScript, Convex, Vitest, Supertest

---

### Task 1: Lock behavior with tests

**Files:**
- Modify: `src/admin.test.ts`

1. Write failing tests for a single `Productos` section, unified save/delete routes, aliases in the product form, and FAQ still editable.
2. Run `npm test -- src/admin.test.ts` and confirm failure for missing unified behavior.

### Task 2: Add unified Convex admin functions

**Files:**
- Modify: `convex/conversations.ts`

1. Add `listCatalogItemsForAdmin` query that merges `menu` and `precios`.
2. Add `upsertCatalogItem` mutation that writes both tables in one transaction.
3. Add `deleteCatalogItem` mutation that removes both records.

### Task 3: Update admin repository

**Files:**
- Modify: `src/services/convex-admin-repository.ts`

1. Replace separate product methods with unified product methods.
2. Keep FAQ methods unchanged.

### Task 4: Refactor `/admin`

**Files:**
- Modify: `src/routes/admin.ts`

1. Replace separate menu/price sections with one `Productos` section.
2. Route product create/update/delete through the unified repository methods.
3. Keep flash messages, inline editing, and delete confirmation.

### Task 5: Verify end to end

**Files:**
- Test: `src/admin.test.ts`

1. Run `npm test`.
2. Run `npm run build`.
3. Run `npx convex dev --once --tail-logs disable`.
4. Run `docker compose up -d --build api`.
5. Smoke test `/admin` and a real `POST /message` menu request.
