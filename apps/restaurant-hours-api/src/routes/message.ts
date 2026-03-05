import { randomUUID } from "node:crypto";

import { Router } from "express";

import { apiRateLimiter } from "../middleware/rate-limiter.js";
import {
  getDefaultConversationAssistant
} from "../services/default-conversation-assistant.js";
import { type ConversationAssistant } from "../services/conversation-assistant.js";
import { resolveRequestTracingEnvironment } from "./tracing-environment.js";

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

  // SECURITY: Apply rate limiting to prevent abuse of the message endpoint
  router.post("/", apiRateLimiter, async (request, response, next) => {
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
      const tracingEnvironment = resolveRequestTracingEnvironment(request);
      const assistant = resolveAssistantService();

      if (assistant.handleIncomingMessageDetailed) {
        const detailed = await assistant.handleIncomingMessageDetailed({
          chatId,
          text: message,
          tracingEnvironment
        });

        return response.status(200).json({
          chatId,
          reply: detailed.reply,
          traceId: detailed.traceId,
          observationId: detailed.observationId,
          metrics: {
            tokens: detailed.tokens
          }
        });
      }

      const reply = await assistant.handleIncomingMessage({
        chatId,
        text: message,
        tracingEnvironment
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
