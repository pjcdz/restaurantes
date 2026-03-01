import { getConvexUrl } from "../config.js";
import {
  createConversationAssistant,
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

  const baseAssistant = createConversationAssistant({
    repository: new ConvexConversationRepository(getConvexUrl()),
    composeResponse: createGemmaResponseComposer(),
    extractOrderRequest: createGemmaOrderExtractionAgent()
  });
  cachedAssistant = {
    async handleIncomingMessage(input) {
      return await flushLangfuseAfter(() => baseAssistant.handleIncomingMessage(input));
    }
  };

  return cachedAssistant;
}
