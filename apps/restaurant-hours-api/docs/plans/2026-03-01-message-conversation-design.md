# Message Conversation Endpoint Design

**Goal:** Replace the legacy `/message` availability response with the same conversational assistant used by Telegram so HTTP clients can go straight into ordering.

## Context

Today `/message` is wired to the restaurant-hours service and always returns the open/closed payload. That behavior conflicts with the conversational ordering flow already exposed through `/telegram/webhook`.

## Chosen Approach

Reuse the existing `ConversationAssistant` for `POST /message`.

- Keep the route path as `/message`.
- Keep the existing request body object validation.
- Read the user's text from `body.message`.
- Optionally accept `body.chatId` to preserve conversation state across HTTP requests.
- Return JSON with the assistant reply instead of the legacy availability payload.

## Request / Response

Request body:

```json
{
  "message": "quiero una clasica",
  "chatId": "web-123"
}
```

Response body:

```json
{
  "reply": "Anotado: 1 La Clásica Smash ($8500 c/u = $8500). ¿Es para delivery o retiro?"
}
```

If `chatId` is omitted, the route uses a safe fallback HTTP conversation id.

## Testing

- Update `src/app.test.ts` so `/message` expects a conversational reply instead of the availability payload.
- Add coverage for invalid body objects and invalid/missing `message`.
- Inject a fake assistant in tests so route behavior stays deterministic.
