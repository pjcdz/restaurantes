# Docker Ngrok Design

## Goal

Run both the API and `ngrok` through Docker so the Telegram webhook flow no longer depends on a local `ngrok` binary.

## Scope

- Add a Docker image for the API.
- Add a `docker compose` stack with `api` and `ngrok` services.
- Reuse `.env` for both `TELEGRAM_BOT_TOKEN` and `NGROK_AUTHTOKEN`.
- Update the webhook registration script so it can read the `ngrok` admin API from a configurable base URL.
- Provide repo-managed scripts for bringing the stack up and registering the webhook.

## Proposed Flow

1. The developer starts the stack with `docker compose up`.
2. The `api` container serves the Express app on port `3000`.
3. The `ngrok` container tunnels traffic to `api:3000` and exposes its admin API on port `4040`.
4. A repo-managed script reads the active HTTPS tunnel URL from the `ngrok` admin API.
5. The script registers `<public-ngrok-url>/telegram/webhook` with Telegram.

## Implementation Notes

- Add a `Dockerfile` for the Node app.
- Add `docker-compose.yml` with two services:
  - `api`: builds from the local Dockerfile
  - `ngrok`: uses the official `ngrok/ngrok` image and targets `api:3000`
- Keep the webhook registration logic in TypeScript, but make the admin API base URL configurable through `NGROK_API_URL`.
- Replace the local-tunnel npm script with Docker-oriented scripts.

## Verification

- Unit test the admin API URL resolution logic.
- Run the test suite and TypeScript build.
- Validate the compose file syntax with `docker compose config` if Docker is available.
