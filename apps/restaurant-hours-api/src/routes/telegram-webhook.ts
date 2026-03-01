import { Router } from "express";

import { getTelegramBotToken } from "../config.js";
import {
  getDefaultConversationAssistant
} from "../services/default-conversation-assistant.js";
import { type ConversationAssistant } from "../services/conversation-assistant.js";
import {
  sendTelegramTextMessage,
  type TelegramSender
} from "../services/telegram.js";

export type TelegramWebhookRouteOptions = {
  assistantService?: ConversationAssistant;
  telegramSender?: TelegramSender;
};

type TelegramMessageUpdate = {
  message?: {
    chat?: {
      id?: number;
    };
    text?: string;
  };
};

function createDefaultTelegramSender(): TelegramSender {
  return async (input) => {
    await sendTelegramTextMessage({
      token: getTelegramBotToken(),
      chatId: input.chatId,
      text: input.text
    });
  };
}

export function createTelegramWebhookRouter(
  options: TelegramWebhookRouteOptions = {}
) {
  const router = Router();
  const resolveAssistantService: () => ConversationAssistant =
    options.assistantService === undefined
      ? () => getDefaultConversationAssistant()
      : () => options.assistantService as ConversationAssistant;
  const telegramSender = options.telegramSender ?? createDefaultTelegramSender();

  router.post("/", async (request, response, next) => {
    try {
      if (
        typeof request.body !== "object" ||
        request.body === null ||
        Array.isArray(request.body)
      ) {
        return response.status(400).json({
          error: "Request body must be a JSON object."
        });
      }

      const update = request.body as TelegramMessageUpdate;
      const chatId = update.message?.chat?.id;

      if (typeof chatId !== "number") {
        return response.status(200).json({
          ok: true,
          ignored: true
        });
      }

      const text = update.message?.text;

      if (typeof text !== "string" || text.trim() === "") {
        return response.status(200).json({
          ok: true,
          ignored: true
        });
      }

      void processTelegramUpdate({
        assistantService: resolveAssistantService(),
        chatId,
        telegramSender,
        text
      });

      return response.status(200).json({
        ok: true
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

async function processTelegramUpdate(input: {
  assistantService: ConversationAssistant;
  chatId: number;
  telegramSender: TelegramSender;
  text: string;
}) {
  try {
    const reply = await input.assistantService.handleIncomingMessage({
      chatId: String(input.chatId),
      text: input.text
    });

    await input.telegramSender({
      chatId: input.chatId,
      text: reply
    });
  } catch (error) {
    console.error("Telegram webhook background processing failed.", error);
  }
}
