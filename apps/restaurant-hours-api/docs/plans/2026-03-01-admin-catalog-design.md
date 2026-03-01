# Admin Catalog Page Design

**Goal:** Add a simple internal page for staff to view and edit menu, FAQ, and prices directly from this service.

## Context

This project is an Express API without a frontend stack. Convex already exposes list and upsert functions for:

- `menu`
- `faq`
- `precios`

So the fastest safe path is to serve a basic internal HTML page from Express and reuse those existing Convex functions.

## Chosen Approach

Serve a simple server-rendered admin page at `/admin`.

- `GET /admin` renders the current menu, FAQ, and prices.
- `POST /admin/menu` upserts a menu item.
- `POST /admin/prices` upserts a price entry plus aliases.
- `POST /admin/faq` upserts an FAQ entry.
- Each POST redirects back to `/admin`.

This keeps the first version simple, inspectable, and easy to improve later.

## UX

The page will include:

- a menu section with current rows and a form
- a prices section with current rows and a form
- an FAQ section with current rows and a form

The page is internal and intentionally minimal, but still readable:

- one page
- no login
- light styling
- success and error feedback through query params and inline messages

## Data Flow

1. The route loads the current catalog from Convex.
2. It renders HTML with the current rows.
3. A form submit posts to one of the admin endpoints.
4. The endpoint validates and normalizes the payload.
5. The endpoint calls the matching Convex upsert function.
6. The route redirects back to `/admin`.

## Out Of Scope

- authentication
- delete actions
- rich frontend interactivity
- audit log

## Testing

- `GET /admin` returns HTML and lists known records.
- `POST /admin/menu` validates and redirects.
- `POST /admin/prices` writes aliases correctly.
- `POST /admin/faq` validates and redirects.
