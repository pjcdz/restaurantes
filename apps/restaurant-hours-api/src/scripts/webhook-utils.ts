import { TELEGRAM_API_BASE_URL } from "../config.js";

type NgrokTunnel = {
  proto?: string;
  public_url?: string;
};

type NgrokTunnelsResponse = {
  tunnels?: NgrokTunnel[];
};

export function findNgrokHttpsTunnelUrl(payload: NgrokTunnelsResponse): string {
  const tunnel = payload.tunnels?.find(
    (item) =>
      item.proto === "https" &&
      typeof item.public_url === "string" &&
      item.public_url.startsWith("https://")
  );

  if (!tunnel?.public_url) {
    throw new Error("No HTTPS ngrok tunnel is active.");
  }

  return tunnel.public_url;
}

export function buildTelegramWebhookUrl(publicUrl: string): string {
  const normalizedUrl = publicUrl.endsWith("/")
    ? publicUrl.slice(0, -1)
    : publicUrl;

  return `${normalizedUrl}/telegram/webhook`;
}

export function buildTelegramSetWebhookApiUrl(token: string): string {
  return `${TELEGRAM_API_BASE_URL}/bot${token}/setWebhook`;
}

export function getNgrokApiTunnelsUrl(): string {
  return process.env.NGROK_API_URL?.trim() || "http://127.0.0.1:4040/api/tunnels";
}
