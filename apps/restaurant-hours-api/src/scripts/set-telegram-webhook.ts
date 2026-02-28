import { getTelegramBotToken } from "../config.js";
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

async function registerTelegramWebhook(fetchImpl: typeof fetch = fetch) {
  loadEnvironmentFile();

  const token = getTelegramBotToken();
  const webhookUrl = await readNgrokWebhookUrl(fetchImpl);
  const response = await fetchImpl(buildTelegramSetWebhookApiUrl(token), {
    method: "POST",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      url: webhookUrl
    })
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

registerTelegramWebhook().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown error.";
  console.error(message);
  process.exit(1);
});
