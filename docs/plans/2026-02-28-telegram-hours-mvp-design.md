# Telegram Restaurant Hours MVP Design

**Date:** 2026-02-28
**Status:** Assumption-based implementation

## Goal

Extend the standalone TypeScript app so Telegram can deliver inbound messages to the service and the bot responds back in the same chat with the restaurant open/closed status.

## Assumptions

- The integration will use the Telegram Bot API webhook model.
- Telegram will POST updates to this service.
- The app will reply by calling Telegram `sendMessage`.
- No local polling or background worker is needed.
- The current business logic remains unchanged: the response depends only on the local time in `America/Argentina/Buenos_Aires`.

## Scope

This change adds:

- A `POST /telegram/webhook` route for Telegram updates.
- Telegram payload parsing for text messages.
- Outbound message delivery through the Telegram Bot API.

Out of scope:

- Webhook registration via `setWebhook`
- Commands, keyboards, images, voice, or rich formatting
- Persistence, retries, deduplication, or bot state

## Architecture

The current service keeps its existing `POST /message` endpoint. A new Telegram-specific route will be added:

- `src/routes/telegram-webhook.ts`: parse update, compute availability, send reply, return `200`.
- `src/services/telegram.ts`: Telegram sender wrapper and request typing.
- `src/config.ts`: add Telegram API base URL and token lookup.

The route will accept injected dependencies for testability:

- `now()` to control the evaluated time.
- `telegramSender()` to avoid real network calls in tests.

## Request and Response Flow

1. Telegram sends an update to `POST /telegram/webhook`.
2. The route extracts `message.chat.id`.
3. The route computes open/closed status using the existing restaurant-hours service.
4. The app sends the resulting text back to Telegram using `sendMessage`.
5. The route returns a simple acknowledgement JSON to the webhook caller.

## Error Handling

- If the webhook payload is not a JSON object, return `400`.
- If the update does not contain a usable `message.chat.id`, return `400`.
- If the Telegram token is missing or sending fails, return `500`.
- Non-message Telegram updates are accepted with `200` and ignored to avoid webhook churn.

## Testing Strategy

Automated tests will cover:

- Telegram route sends the correct message when the restaurant is open.
- Telegram route ignores non-message updates.
- Telegram route rejects invalid payloads.
- Telegram sender builds the expected Bot API request shape.
