import { Router } from "express";

import { getTelegramBotToken } from "../config.js";
import { getRestaurantAvailability } from "../services/restaurant-hours.js";
import {
  sendTelegramTextMessage,
  type TelegramSender
} from "../services/telegram.js";

export type TelegramWebhookRouteOptions = {
  now?: () => Date;
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
  const now = options.now ?? (() => new Date());
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

      const availability = getRestaurantAvailability(now());

      await telegramSender({
        chatId,
        text: availability.message
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
