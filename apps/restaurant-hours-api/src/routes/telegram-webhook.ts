import { type Request, Router } from "express";

import { getTelegramBotToken, getTelegramWebhookSecret } from "../config.js";
import { telegramRateLimiter } from "../middleware/rate-limiter.js";
import {
  getDefaultConversationAssistant
} from "../services/default-conversation-assistant.js";
import { type ConversationAssistant } from "../services/conversation-assistant.js";
import { resolveRequestTracingEnvironment } from "./tracing-environment.js";
import {
  sendTelegramTextMessage,
  type TelegramSender
} from "../services/telegram.js";
import { Logger, generateTraceId } from "../utils/logger.js";

/**
 * Logger instance for telegram webhook operations.
 */
const logger = new Logger({ service: "telegram-webhook" });

/**
 * Error logger instance for background processing errors.
 */
const errorLogger = new Logger({ service: "telegram-webhook-background" });

/**
 * Validates the Telegram webhook signature by comparing the provided secret token
 * against the configured TELEGRAM_WEBHOOK_SECRET environment variable.
 *
 * @param secretToken - The value from the X-Telegram-Bot-Api-Secret-Token header
 * @returns true if the signature is valid, false otherwise
 *
 * @example
 * ```typescript
 * const token = request.header("X-Telegram-Bot-Api-Secret-Token");
 * if (!validateTelegramSignature(token)) {
 *   return response.status(401).json({ error: "Unauthorized" });
 * }
 * ```
 */
export function validateTelegramSignature(secretToken: string | undefined): boolean {
  const expectedSecret = getTelegramWebhookSecret();

  // If no secret is configured, reject all requests for security
  if (!expectedSecret) {
    logger.error("TELEGRAM_WEBHOOK_SECRET is not configured. Rejecting webhook request.");
    return false;
  }

  // Token must be present and match exactly
  if (!secretToken || typeof secretToken !== "string") {
    return false;
  }

  // Use timing-safe comparison to prevent timing attacks
  return timingSafeEqual(secretToken, expectedSecret);
}

/**
 * Performs a timing-safe string comparison to prevent timing attacks.
 * SEC-1: Always performs full comparison regardless of length differences
 * to prevent timing information leakage.
 *
 * @param a - First string to compare
 * @param b - Second string to compare
 * @returns true if strings are equal, false otherwise
 */
function timingSafeEqual(a: string, b: string): boolean {
  // SEC-1: Always iterate over the maximum length to prevent timing attacks
  // that could exploit early returns on length mismatch
  let result = a.length ^ b.length;
  const maxLen = Math.max(a.length, b.length);

  for (let i = 0; i < maxLen; i++) {
    // Use 0 for out-of-bounds characters to maintain constant time
    // Note: charCodeAt() returns NaN for out-of-bounds, so we use || 0 (not ?? 0)
    // because NaN || 0 = 0, but NaN ?? 0 = NaN (nullish coalescing doesn't catch NaN)
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }

  return result === 0;
}

export type TelegramWebhookRouteOptions = {
  assistantService?: ConversationAssistant;
  telegramSender?: TelegramSender;
  /**
   * Skip signature validation (for testing purposes only).
   * SEC-4: This option is not allowed in production environment.
   */
  skipSignatureValidation?: boolean;
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

/**
 * Header name used by Telegram for webhook secret token validation.
 * @see https://core.telegram.org/bots/api#setwebhook
 */
const TELEGRAM_SECRET_HEADER = "X-Telegram-Bot-Api-Secret-Token";

export function createTelegramWebhookRouter(
  options: TelegramWebhookRouteOptions = {}
) {
  // SEC-4: Prevent skipSignatureValidation in production environment
  if (options.skipSignatureValidation && process.env.NODE_ENV === "production") {
    throw new Error(
      "SECURITY: skipSignatureValidation option is not allowed in production environment"
    );
  }

  const router = Router();
  const resolveAssistantService: () => ConversationAssistant =
    options.assistantService === undefined
      ? () => getDefaultConversationAssistant()
      : () => options.assistantService as ConversationAssistant;
  const telegramSender = options.telegramSender ?? createDefaultTelegramSender();

  router.post("/", telegramRateLimiter, async (request, response, next) => {
    try {
      // SEC-01: Validate Telegram webhook signature
      if (!options.skipSignatureValidation) {
        const secretToken = request.header(TELEGRAM_SECRET_HEADER);

        if (!validateTelegramSignature(secretToken)) {
          logger.warn("Telegram webhook request rejected: invalid signature");
          return response.status(401).json({
            error: "Unauthorized: Invalid or missing webhook secret token."
          });
        }
      }

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

      // ERR-1: Properly handle background processing errors with catch handler
      processTelegramUpdate({
        assistantService: resolveAssistantService(),
        chatId,
        tracingEnvironment: resolveRequestTracingEnvironment(request),
        telegramSender,
        text
      }).catch((error) => {
        errorLogger.error("Telegram processing failed", { traceId: generateTraceId(), chatId: String(chatId) }, {
          error: error instanceof Error
            ? { name: error.name, message: error.message, stack: error.stack }
            : { name: "UnknownError", message: String(error) }
        });
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
  tracingEnvironment: "dev" | "prod";
  telegramSender: TelegramSender;
  text: string;
}): Promise<void> {
  const reply = await input.assistantService.handleIncomingMessage({
    chatId: String(input.chatId),
    text: input.text,
    tracingEnvironment: input.tracingEnvironment
  });

  await input.telegramSender({
    chatId: input.chatId,
    text: reply
  });
}
