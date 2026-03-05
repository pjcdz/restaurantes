import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { getGoogleGenerativeAiApiKey } from "../config.js";
import {
  type ComposeResponse,
  type ComposeResponseInput
} from "./conversation-assistant.js";
import { getLangfuseTracer } from "./langfuse.js";

const DEFAULT_MODEL = "gemma-3-27b-it";

export function createGemmaResponseComposer(): ComposeResponse {
  const tracer = getLangfuseTracer();

  return async (input: ComposeResponseInput) => {
    getGoogleGenerativeAiApiKey();

    try {
      const result = await generateText({
        model: google(DEFAULT_MODEL),
        system:
          "Eres un asistente conversacional para un restaurante de comida rapida. Reescribe la respuesta tecnica en espanol rioplatense claro, sin inventar datos y manteniendo el contenido factual intacto.",
        prompt: buildPrompt(input),
        experimental_telemetry: tracer
          ? {
              isEnabled: true,
              functionId: "conversation.format_response",
              metadata: {
                chatId: input.chatId,
                intent: input.intent
              },
              tracer
            }
          : undefined
      });

      const responseText = result.text.trim();

      if (responseText) {
        return responseText;
      }
    } catch (error) {
      console.error("Gemma 3 response generation failed.", error);
    }

    return input.draftReply;
  };
}

function buildPrompt(input: ComposeResponseInput): string {
  const orderContext = input.orderDraft
    ? `Pedido actual: ${JSON.stringify(input.orderDraft)}`
    : "Pedido actual: sin pedido cargado.";

  return [
    `Mensaje del usuario: ${input.messageText}`,
    `Intencion detectada: ${input.intent}`,
    `Respuesta base: ${input.draftReply}`,
    orderContext,
    "Devuelve solo el texto final para el usuario."
  ].join("\n");
}
