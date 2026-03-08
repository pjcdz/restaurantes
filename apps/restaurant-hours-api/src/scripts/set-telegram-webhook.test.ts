import { describe, expect, it } from "vitest";

import { buildSetWebhookPayload } from "./set-telegram-webhook.js";

describe("buildSetWebhookPayload", () => {
  it("includes secret_token when webhook secret is configured", () => {
    const payload = buildSetWebhookPayload(
      "https://example.ngrok.io/telegram/webhook",
      "my-secret"
    );

    expect(payload).toEqual({
      url: "https://example.ngrok.io/telegram/webhook",
      secret_token: "my-secret"
    });
  });

  it("omits secret_token when webhook secret is not configured", () => {
    const payload = buildSetWebhookPayload(
      "https://example.ngrok.io/telegram/webhook",
      undefined
    );

    expect(payload).toEqual({
      url: "https://example.ngrok.io/telegram/webhook"
    });
  });
});
