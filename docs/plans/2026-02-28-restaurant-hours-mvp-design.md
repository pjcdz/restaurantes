# Restaurant Hours MVP Design

**Date:** 2026-02-28
**Status:** Approved

## Goal

Build a new standalone TypeScript app in this repository that answers whether the restaurant is open or closed based only on local time in `America/Argentina/Buenos_Aires`.

## Scope

The MVP only needs to:

- Expose one HTTP endpoint.
- Evaluate the current local time.
- Return `open` when the local hour is within business hours.
- Return `closed` otherwise.

Out of scope for this MVP:

- n8n integration
- WhatsApp, Telegram, or Kapso integration
- AI or LLM usage
- Database storage
- Menu, orders, delivery, payments, or human handoff

## Architecture

The app will be a small HTTP service built with TypeScript and Express.

It will be organized into:

- `src/server.ts`: server bootstrap.
- `src/app.ts`: Express app factory and route registration.
- `src/routes/message.ts`: `POST /message` endpoint.
- `src/services/restaurant-hours.ts`: business logic for availability.
- `src/config.ts`: timezone and business-hour constants.

## Request and Response

The endpoint will accept a JSON body. The request payload is intentionally minimal because the message content does not affect the decision in this MVP.

Example request:

```json
{
  "message": "hola"
}
```

Example response when open:

```json
{
  "open": true,
  "status": "open",
  "message": "El restaurante esta abierto."
}
```

Example response when closed:

```json
{
  "open": false,
  "status": "closed",
  "message": "El restaurante esta cerrado."
}
```

## Business Rules

- Timezone: `America/Argentina/Buenos_Aires`
- Opening time: `09:00`
- Closing time: `23:00`
- Rule: `09:00 <= current time < 23:00`
- At exactly `09:00`, the restaurant is considered open.
- At exactly `23:00`, the restaurant is considered closed.

## Error Handling

- Invalid JSON body or non-object payload: return `400`.
- Unexpected internal error: return `500` with a controlled message.

## Testing Strategy

Automated tests will cover:

- Open time within the valid window
- Closed time before opening
- Closed time at the closing boundary
- Open state exactly at `09:00`
- Closed state exactly at `23:00`
- Endpoint contract for `POST /message`

## Implementation Notes

- The new app will be independent from the existing `n8n` assets.
- The service will include deterministic tests by injecting a reference date into the availability logic.
- Default response strings will be hardcoded for the MVP to keep the app simple and predictable.
