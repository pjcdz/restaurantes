import { fileURLToPath } from "node:url";

import { getTelegramBotToken, getTelegramWebhookSecret } from "../config.js";
import { loadEnvironmentFile } from "../environment.js";
import {
  getNgrokApiTunnelsUrl,
  buildTelegramSetWebhookApiUrl,
  buildTelegramWebhookUrl,
  findNgrokHttpsTunnelUrl
} from "./webhook-utils.js";

type NgrokApiResponse = {
  tunnels?: Array<{
    proto?: string;
    public_url?: string;
  }>;
};

type TelegramApiResponse = {
  ok?: boolean;
  description?: string;
};

async function readNgrokWebhookUrl(fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(getNgrokApiTunnelsUrl());

  if (!response.ok) {
    throw new Error(`ngrok API request failed with status ${response.status}.`);
  }

  const payload = (await response.json()) as NgrokApiResponse;
  const publicUrl = findNgrokHttpsTunnelUrl(payload);

  return buildTelegramWebhookUrl(publicUrl);
}

export function buildSetWebhookPayload(
  webhookUrl: string,
  webhookSecret: string | undefined
): {
  url: string;
  secret_token?: string;
} {
  return webhookSecret
    ? { url: webhookUrl, secret_token: webhookSecret }
    : { url: webhookUrl };
}

async function registerTelegramWebhook(fetchImpl: typeof fetch = fetch) {
  loadEnvironmentFile();

  const token = getTelegramBotToken();
  const webhookSecret = getTelegramWebhookSecret();
  const webhookUrl = await readNgrokWebhookUrl(fetchImpl);
  const webhookPayload = buildSetWebhookPayload(webhookUrl, webhookSecret);
  const response = await fetchImpl(buildTelegramSetWebhookApiUrl(token), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify(webhookPayload)
  });

  let payload: TelegramApiResponse | undefined;

  try {
    payload = (await response.json()) as TelegramApiResponse;
  } catch {
    payload = undefined;
  }

  if (!response.ok || payload?.ok !== true) {
    const details = payload?.description
      ? ` ${payload.description}`
      : "";

    throw new Error(
      `Telegram setWebhook failed with status ${response.status}.${details}`
    );
  }

  console.log(`Telegram webhook registered: ${webhookUrl}`);
}

function isDirectExecution(): boolean {
  if (!process.argv[1]) {
    return false;
  }

  return fileURLToPath(import.meta.url) === process.argv[1];
}

if (isDirectExecution()) {
  registerTelegramWebhook().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error(message);
    process.exit(1);
  });
}
