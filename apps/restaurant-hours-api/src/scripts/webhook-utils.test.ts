import { describe, expect, it } from "vitest";

import {
  getNgrokApiTunnelsUrl,
  buildTelegramSetWebhookApiUrl,
  buildTelegramWebhookUrl,
  findNgrokHttpsTunnelUrl
} from "./webhook-utils";

describe("findNgrokHttpsTunnelUrl", () => {
  it("returns the first HTTPS ngrok tunnel URL", () => {
    expect(
      findNgrokHttpsTunnelUrl({
        tunnels: [
          {
            public_url: "http://example.ngrok-free.app",
            proto: "http"
          },
          {
            public_url: "https://example.ngrok-free.app",
            proto: "https"
          }
        ]
      })
    ).toBe("https://example.ngrok-free.app");
  });

  it("throws when no HTTPS ngrok tunnel is available", () => {
    expect(() =>
      findNgrokHttpsTunnelUrl({
        tunnels: [
          {
            public_url: "http://example.ngrok-free.app",
            proto: "http"
          }
        ]
      })
    ).toThrow("No HTTPS ngrok tunnel is active.");
  });
});

describe("buildTelegramWebhookUrl", () => {
  it("appends the Telegram webhook path to the public ngrok URL", () => {
    expect(
      buildTelegramWebhookUrl("https://example.ngrok-free.app")
    ).toBe("https://example.ngrok-free.app/telegram/webhook");
  });
});

describe("buildTelegramSetWebhookApiUrl", () => {
  it("builds the Telegram setWebhook endpoint for the configured bot token", () => {
    expect(
      buildTelegramSetWebhookApiUrl("123:test-token")
    ).toBe("https://api.telegram.org/bot123:test-token/setWebhook");
  });
});

describe("getNgrokApiTunnelsUrl", () => {
  it("returns the default local ngrok admin API URL", () => {
    const originalNgrokApiUrl = process.env.NGROK_API_URL;

    try {
      delete process.env.NGROK_API_URL;

      expect(getNgrokApiTunnelsUrl()).toBe("http://127.0.0.1:4040/api/tunnels");
    } finally {
      if (originalNgrokApiUrl === undefined) {
        delete process.env.NGROK_API_URL;
      } else {
        process.env.NGROK_API_URL = originalNgrokApiUrl;
      }
    }
  });

  it("returns the configured ngrok admin API URL override", () => {
    const originalNgrokApiUrl = process.env.NGROK_API_URL;

    try {
      process.env.NGROK_API_URL = "http://ngrok:4040/api/tunnels";

      expect(getNgrokApiTunnelsUrl()).toBe("http://ngrok:4040/api/tunnels");
    } finally {
      if (originalNgrokApiUrl === undefined) {
        delete process.env.NGROK_API_URL;
      } else {
        process.env.NGROK_API_URL = originalNgrokApiUrl;
      }
    }
  });
});
