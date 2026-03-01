import { randomUUID } from "node:crypto";

import { Router } from "express";

import {
  getDefaultConversationAssistant
} from "../services/default-conversation-assistant.js";
import { type ConversationAssistant } from "../services/conversation-assistant.js";

export type MessageRouteOptions = {
  assistantService?: ConversationAssistant;
  createChatId?: () => string;
};

type MessageRequestBody = {
  message?: unknown;
  chatId?: unknown;
};

export function createMessageRouter(options: MessageRouteOptions = {}) {
  const router = Router();
  const resolveAssistantService: () => ConversationAssistant =
    options.assistantService === undefined
      ? () => getDefaultConversationAssistant()
      : () => options.assistantService as ConversationAssistant;
  const createChatId = options.createChatId ?? (() => randomUUID());

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

      const body = request.body as MessageRequestBody;
      const message = body.message;

      if (typeof message !== "string" || message.trim() === "") {
        return response.status(400).json({
          error: "message must be a non-empty string."
        });
      }

      const chatId = resolveChatId(body.chatId, createChatId);
      const reply = await resolveAssistantService().handleIncomingMessage({
        chatId,
        text: message
      });

      return response.status(200).json({
        chatId,
        reply
      });
    } catch (error) {
      return next(error);
    }
  });

  return router;
}

function resolveChatId(rawChatId: unknown, createChatId: () => string): string {
  if (typeof rawChatId === "string" && rawChatId.trim() !== "") {
    return rawChatId.trim();
  }

  if (typeof rawChatId === "number" && Number.isFinite(rawChatId)) {
    return String(rawChatId);
  }

  return `http:${createChatId()}`;
}
