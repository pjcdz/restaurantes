export const RESTAURANT_TIMEZONE = "America/Argentina/Buenos_Aires";
export const OPENING_HOUR = 9;
export const CLOSING_HOUR = 23;
export const TELEGRAM_API_BASE_URL = "https://api.telegram.org";

export const OPEN_MESSAGE = "El restaurante esta abierto.";
export const CLOSED_MESSAGE = "El restaurante esta cerrado.";

export function getTelegramBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();

  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is required.");
  }

  return token;
}
