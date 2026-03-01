import { Router } from "express";

import { getTelegramBotToken } from "../config.js";
import { getRestaurantAvailability } from "../services/restaurant-hours.js";
import {
  sendTelegramTextMessage,
  type TelegramSender
} from "../services/telegram.js";
import { runAgent } from "../agent/index.js";

export type TelegramWebhookRouteOptions = {
  now?: () => Date;
  telegramSender?: TelegramSender;
  useAgent?: boolean; // Flag to enable agent-based responses
};

type TelegramMessageUpdate = {
  update_id?: number;
  message?: {
    chat?: {
      id?: number;
    };
    text?: string;
    from?: {
      id?: number;
      username?: string;
      first_name?: string;
    };
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
  const now = options.now ?? (() => new Date());
  const telegramSender = options.telegramSender ?? createDefaultTelegramSender();
  const useAgent = options.useAgent ?? process.env.USE_AGENT === "true";

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
      const messageText = update.message?.text;

      if (typeof chatId !== "number") {
        return response.status(200).json({
          ok: true,
          ignored: true
        });
      }

      // Ignore empty messages
      if (!messageText || messageText.trim().length === 0) {
        return response.status(200).json({
          ok: true,
          ignored: true
        });
      }

      let replyText: string;

      if (useAgent) {
        // Use LangGraph agent for intelligent responses
        try {
          const chatIdStr = chatId.toString();
          const result = await runAgent(messageText, chatIdStr);
          replyText = result.response;
        } catch (agentError) {
          console.error("Agent error, falling back to availability:", agentError);
          // Fallback to simple availability response
          const availability = getRestaurantAvailability(now());
          replyText = availability.message;
        }
      } else {
        // Use simple availability-based response
        const availability = getRestaurantAvailability(now());
        replyText = availability.message;
      }

      await telegramSender({
        chatId,
        text: replyText
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
