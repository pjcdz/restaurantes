import { TELEGRAM_API_BASE_URL } from "../config.js";

export type TelegramFetch = typeof fetch;

export type SendTelegramTextMessageInput = {
  chatId: number;
  text: string;
};

export type SendTelegramBotApiTextMessageInput = SendTelegramTextMessageInput & {
  token: string;
};

export type TelegramSender = (
  input: SendTelegramTextMessageInput
) => Promise<void>;

export async function sendTelegramTextMessage(
  input: SendTelegramBotApiTextMessageInput,
  fetchImpl: TelegramFetch = fetch
) {
  const response = await fetchImpl(
    `${TELEGRAM_API_BASE_URL}/bot${input.token}/sendMessage`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        chat_id: input.chatId,
        text: input.text
      })
    }
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with status ${response.status}.`);
  }
}
