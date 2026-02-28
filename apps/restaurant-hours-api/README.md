# Restaurant Hours API

## Telegram Webhook Docker Flow

1. Set both secrets in `.env`:

```bash
NGROK_AUTHTOKEN=your-ngrok-authtoken
TELEGRAM_BOT_TOKEN=your-telegram-bot-token
```

2. Start the Docker stack:

```bash
npm run docker:up
```

3. Register the current public tunnel as the Telegram webhook:

```bash
npm run docker:webhook:set
```

4. Stop the stack when you are done:

```bash
npm run docker:down
```

## Notes

- `npm run docker:up` runs both the API and `ngrok` in containers.
- `npm run docker:webhook:set` runs inside the API container and reads the `ngrok` admin API from the `ngrok` service.
- The webhook URL that gets registered is `<ngrok-https-url>/telegram/webhook`.
- `npm run webhook:set` still works for non-Docker cases and defaults to `http://127.0.0.1:4040/api/tunnels`, but the intended workflow is the Docker one.
