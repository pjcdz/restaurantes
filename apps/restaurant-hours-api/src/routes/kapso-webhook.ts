import { type Request, Router } from "express";

import { getKapsoApiKey, getKapsoWebhookSecret } from "../config.js";
import { kapsoRateLimiter } from "../middleware/rate-limiter.js";
import {
  getDefaultConversationAssistant
} from "../services/default-conversation-assistant.js";
import { type ConversationAssistant } from "../services/conversation-assistant.js";
import { resolveRequestTracingEnvironment } from "./tracing-environment.js";
import {
  sendKapsoTextMessage,
  activateKapsoHandoff,
  type KapsoSender
} from "../services/kapso.js";
import { Logger, generateTraceId } from "../utils/logger.js";

const logger = new Logger({ service: "kapso-webhook" });
const errorLogger = new Logger({ service: "kapso-webhook-background" });

const KAPSO_SECRET_HEADER = "X-Kapso-Webhook-Secret";

/**
 * Validates Kapso webhook signature using timing-safe comparison.
 * Based on telegram-webhook.ts pattern
 *
 * @param secretToken - The value from the X-Kapso-Webhook-Secret header
 * @returns true if the signature is valid, false otherwise
 */
export function validateKapsoSignature(secretToken: string | undefined): boolean {
  const expectedSecret = getKapsoWebhookSecret();
  if (!expectedSecret) {
    logger.error("KAPSO_WEBHOOK_SECRET is not configured. Rejecting webhook request.");
    return false;
  }
  if (!secretToken || typeof secretToken !== "string") {
    return false;
  }
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
  let result = a.length ^ b.length;
  const maxLen = Math.max(a.length, b.length);
  for (let i = 0; i < maxLen; i++) {
    result |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return result === 0;
}

export type KapsoWebhookRouteOptions = {
  assistantService?: ConversationAssistant;
  kapsoSender?: KapsoSender;
  /**
   * Skip signature validation (for testing purposes only).
   * SEC-4: This option is not allowed in production environment.
   */
  skipSignatureValidation?: boolean;
};

type KapsoMessageUpdate = {
  sessionId?: string;
  phoneNumber?: string;
  message?: string;
};

function createDefaultKapsoSender(): KapsoSender {
  return async (input) => {
    await sendKapsoTextMessage({
      phoneNumber: input.phoneNumber,
      text: input.text
    });
  };
}

export function createKapsoWebhookRouter(
  options: KapsoWebhookRouteOptions = {}
) {
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
  const kapsoSender = options.kapsoSender ?? createDefaultKapsoSender();

  router.post("/", kapsoRateLimiter, async (request, response, next) => {
    try {
      // Validate signature
      if (!options.skipSignatureValidation) {
        const secretToken = request.header(KAPSO_SECRET_HEADER);
        if (!validateKapsoSignature(secretToken)) {
          logger.warn("Kapso webhook request rejected: invalid signature");
          return response.status(401).json({
            error: "Unauthorized: Invalid or missing webhook secret token."
          });
        }
      }

      // Validate body
      if (typeof request.body !== "object" ||
          request.body === null ||
          Array.isArray(request.body)) {
        return response.status(400).json({
          error: "Request body must be a JSON object."
        });
      }

      const update = request.body as KapsoMessageUpdate;
      const phoneNumber = update.phoneNumber;
      const message = update.message;

      // Extract session key - use phoneNumber as stable identifier (RF-502)
      if (typeof phoneNumber !== "string" || phoneNumber.trim() === "") {
        return response.status(200).json({
          ok: true,
          ignored: true
        });
      }

      if (typeof message !== "string" || message.trim() === "") {
        return response.status(200).json({
          ok: true,
          ignored: true
        });
      }

      const chatId = `whatsapp:${phoneNumber}`;

      // Process asynchronously (respond immediately)
      processKapsoUpdate({
        assistantService: resolveAssistantService(),
        chatId,
        phoneNumber,
        tracingEnvironment: resolveRequestTracingEnvironment(request),
        kapsoSender,
        text: message
      }).catch((error) => {
        errorLogger.error("Kapso processing failed", { traceId: generateTraceId(), chatId }, {
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

async function processKapsoUpdate(input: {
  assistantService: ConversationAssistant;
  chatId: string;
  phoneNumber: string;
  tracingEnvironment: "dev" | "prod";
  kapsoSender: KapsoSender;
  text: string;
}): Promise<void> {
  const reply = await input.assistantService.handleIncomingMessage({
    chatId: input.chatId,
    text: input.text,
    tracingEnvironment: input.tracingEnvironment
  });

  // Skip automated reply if session is handed off
  if (!reply.trim()) {
    logger.info("Skipping automated reply because session is currently handed off", undefined, {
      chatId: input.chatId
    });
    return;
  }

  await input.kapsoSender({
    phoneNumber: input.phoneNumber,
    text: reply
  });
}
