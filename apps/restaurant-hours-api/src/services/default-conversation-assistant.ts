import { getConvexUrl } from "../config.js";
import {
  createConversationAssistant,
  createConversationAssistantV2,
  type ConversationAssistant
} from "./conversation-assistant.js";
import { ConvexConversationRepository } from "./convex-conversation-repository.js";
import { createGemmaResponseComposer } from "./gemma-response-composer.js";
import { flushLangfuseAfter } from "./langfuse.js";
import { createGemmaOrderExtractionAgent } from "./order-extraction.js";

let cachedAssistant: ConversationAssistant | null = null;

export function getDefaultConversationAssistant(): ConversationAssistant {
  if (cachedAssistant) {
    return cachedAssistant;
  }

  // SRS v4: Usar createConversationAssistantV2 como assistant principal.
  const baseAssistant = createConversationAssistantV2({
    repository: new ConvexConversationRepository(getConvexUrl()),
    composeResponse: createGemmaResponseComposer(),
    extractOrderRequest: createGemmaOrderExtractionAgent()
  });
  cachedAssistant = {
    async handleIncomingMessage(input) {
      return await flushLangfuseAfter(() => baseAssistant.handleIncomingMessage(input));
    },
    async handleIncomingMessageDetailed(input) {
      if (!baseAssistant.handleIncomingMessageDetailed) {
        const reply = await flushLangfuseAfter(() => baseAssistant.handleIncomingMessage(input));
        return {
          reply,
          tokens: {
            inputTokens: 0,
            outputTokens: 0,
            totalTokens: 0,
            estimatedOutputTokens: 0
          }
        };
      }

      return await flushLangfuseAfter(() =>
        baseAssistant.handleIncomingMessageDetailed!(input)
      );
    }
  };

  return cachedAssistant;
}
