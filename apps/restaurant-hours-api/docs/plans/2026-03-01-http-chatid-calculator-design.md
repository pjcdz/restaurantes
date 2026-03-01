# HTTP ChatId And Calculator Design

**Goal:** Make `/message` issue a server-generated `chatId` for new HTTP conversations and centralize order math in a deterministic calculator helper.

## Context

`POST /message` currently falls back to a fixed `http:anonymous` conversation id when the client does not send `chatId`. That causes unrelated HTTP requests to share memory and accumulate old items. The user-visible symptom looks like "wrong totals", but the root cause is state bleed across requests.

At the same time, order math is currently spread across the conversation assistant. Even when the totals are correct, the calculation path is implicit instead of encapsulated.

## Chosen Approach

1. `POST /message` will always return a `chatId`.
2. If the client omits `chatId`, the server generates a new one and returns it.
3. If the client provides `chatId`, the server reuses it and returns the same id.
4. Order totals will be computed through a dedicated calculator helper used as the single source of truth.

## HTTP Contract

Request:

```json
{
  "message": "quiero una bacon king y una veggie power",
  "chatId": "http:123"
}
```

Response:

```json
{
  "chatId": "http:123",
  "reply": "Anotado: 1 Bacon King ($11200), 1 Veggie Power ($9500). Total parcial: $20700. ¿Es para delivery o retiro?"
}
```

If `chatId` is omitted, the server generates a fresh one such as `http:<uuid>`.

## Calculator Tool

Create a deterministic helper that receives normalized order items and returns:

- per-item subtotal
- accumulated total

The conversation assistant will use this helper for:

- recalculating totals after merges
- building confirmation text that depends on the current total

This avoids ad hoc math in multiple places and keeps future extensions (discounts, fees, combos) in one boundary.

## Testing

- `/message` returns a generated `chatId` when missing.
- `/message` reuses and echoes a provided `chatId`.
- Two HTTP requests without `chatId` do not reuse the same conversation id.
- The calculator returns `$20700` for `Bacon King + Veggie Power`.
- The assistant uses the calculator result when building order totals.
