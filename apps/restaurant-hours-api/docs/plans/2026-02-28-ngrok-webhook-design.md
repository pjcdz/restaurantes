# Ngrok Webhook Design

## Goal

Allow local Telegram webhook testing by exposing the API through `ngrok` and providing a repo-managed script that registers the active public URL with Telegram.

## Scope

- Add a reproducible `npm` script to start an `ngrok` tunnel for the local API port.
- Add a reproducible `npm` script to register the Telegram webhook using the active `ngrok` tunnel URL.
- Reuse the existing `TELEGRAM_BOT_TOKEN` environment variable.
- Fail with explicit errors when prerequisites are missing.

## Proposed Flow

1. The developer starts the API locally.
2. `npm run tunnel` starts `ngrok` against the API port.
3. `npm run webhook:set` reads the active tunnel URL from the local `ngrok` API.
4. The script appends `/telegram/webhook` and calls Telegram `setWebhook`.

## Implementation Notes

- Install `ngrok` as a dev dependency so the workflow is local to this repo.
- Use small Node scripts under `scripts/` instead of shell one-liners to keep behavior cross-platform.
- The webhook registration script should validate:
  - `TELEGRAM_BOT_TOKEN` is present
  - the `ngrok` local API is reachable
  - an HTTPS tunnel exists
- The script should print the registered webhook URL on success.

## Verification

- Unit test the URL resolution and validation logic where practical.
- Run the full test suite and TypeScript build after implementation.
