import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";

import { getGoogleGenerativeAiApiKey } from "../config.js";
import { getLangfuseTracer } from "./langfuse.js";
import type {
  CatalogSnapshot,
  ConversationOrderDraft
} from "./conversation-assistant.js";

export type ExtractedOrderLine = {
  rawText: string;
  productText: string;
  quantity: number;
};

export type OrderExtractionResult = {
  wantsMenu: boolean;
  orderLines: Array<ExtractedOrderLine>;
};

export type ExtractOrderRequestInput = {
  catalog: CatalogSnapshot;
  messageText: string;
  orderDraft: ConversationOrderDraft | null;
};

export type ExtractOrderRequest = (
  input: ExtractOrderRequestInput
) => Promise<OrderExtractionResult>;

const DEFAULT_MODEL = "gemma-3-27b-it";

const orderExtractionSchema = z.object({
  wantsMenu: z.boolean(),
  orderLines: z
    .array(
      z.object({
        rawText: z.string().min(1),
        productText: z.string().min(1),
        quantity: z.number().int().positive()
      })
    )
    .max(8)
});

export function createRuleBasedOrderExtractionAgent(): ExtractOrderRequest {
  return async (input) => {
    const normalizedText = normalizeText(input.messageText);

    return {
      wantsMenu: isMenuRequest(normalizedText),
      orderLines: parseOrderLinesRuleBased(normalizedText)
    };
  };
}

export function createGemmaOrderExtractionAgent(): ExtractOrderRequest {
  const fallback = createRuleBasedOrderExtractionAgent();
  const tracer = getLangfuseTracer();

  return async (input) => {
    getGoogleGenerativeAiApiKey();

    try {
      const result = await generateText({
        model: google(DEFAULT_MODEL),
        system: [
          "Eres un extractor estructurado de pedidos de un restaurante.",
          "Debes interpretar el mensaje del cliente y devolver solo JSON valido.",
          "Extrae varias lineas de pedido si el mensaje menciona varios productos.",
          "Si el mensaje pide ver el menu o recomendaciones, marca wantsMenu=true.",
          "Si una parte del mensaje menciona un producto dudoso, igual extrae la linea con el texto original para que el backend la valide.",
          "No inventes productos inexistentes; copia el texto pedido por el usuario en productText.",
          "La salida debe tener exactamente esta forma: {\"wantsMenu\": boolean, \"orderLines\": [{\"rawText\": string, \"productText\": string, \"quantity\": number}]}.",
          "No agregues markdown, comentarios ni texto adicional."
        ].join(" "),
        prompt: buildOrderExtractionPrompt(input),
        experimental_telemetry: tracer
          ? {
              isEnabled: true,
              functionId: "conversation.extract_order",
              metadata: {
                chatIntent: "order_extraction"
              },
              tracer
            }
          : undefined
      });

      return parseStructuredOrderExtraction(result.text);
    } catch (error) {
      console.error("Gemma structured order extraction failed.", error);
      return fallback(input);
    }
  };
}

function buildOrderExtractionPrompt(input: ExtractOrderRequestInput): string {
  const productCatalog = input.catalog.prices
    .map((record) => {
      const aliases =
        record.aliases.length > 0 ? ` | aliases: ${record.aliases.join(", ")}` : "";

      return `- ${record.producto}${aliases}`;
    })
    .join("\n");
  const existingItems =
    input.orderDraft?.items.map((item) => `${item.cantidad} ${item.producto}`).join(", ") ??
    "sin items";

  return [
    `Mensaje del cliente: ${input.messageText}`,
    `Pedido actual: ${existingItems}`,
    "Catalogo de productos y aliases:",
    productCatalog || "- sin productos",
    "Devuelve un objeto con wantsMenu y orderLines.",
    "orderLines debe contener una entrada por cada producto solicitado."
  ].join("\n");
}

function normalizeExtractionResult(
  result: z.infer<typeof orderExtractionSchema>
): OrderExtractionResult {
  return {
    wantsMenu: result.wantsMenu,
    orderLines: result.orderLines
      .map((line) => ({
        rawText: line.rawText.trim(),
        productText: line.productText.trim(),
        quantity: Number.isFinite(line.quantity) ? Math.max(1, Math.floor(line.quantity)) : 1
      }))
      .filter((line) => line.rawText && line.productText)
  };
}

function parseStructuredOrderExtraction(text: string): OrderExtractionResult {
  const parsedText = extractJsonPayload(text);
  const jsonValue = JSON.parse(parsedText) as unknown;
  const parsed = orderExtractionSchema.safeParse(jsonValue);

  if (!parsed.success) {
    throw new Error(`Invalid structured order extraction: ${parsed.error.message}`);
  }

  return normalizeExtractionResult(parsed.data);
}

function extractJsonPayload(text: string): string {
  const trimmed = text.trim();

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }

  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/u);

  if (fencedMatch?.[1]) {
    return fencedMatch[1].trim();
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  throw new Error("No JSON payload found in structured extraction output.");
}

function parseOrderLinesRuleBased(normalizedText: string): Array<ExtractedOrderLine> {
  if (isMenuOnlyMessage(normalizedText)) {
    return [];
  }

  if (
    (!looksLikeOrderMessage(normalizedText) &&
      !/\b\d+\b/u.test(normalizedText)) ||
    looksLikeAddressMessage(normalizedText)
  ) {
    return [];
  }

  const segments = normalizedText
    .split(/\s*(?:,| y | e | tambien | además | ademas)\s*/u)
    .map((segment) => segment.trim())
    .filter(Boolean);
  const lines: Array<ExtractedOrderLine> = [];

  for (const segment of segments) {
    const parsed = parseOrderSegment(segment);

    if (!parsed) {
      continue;
    }

    lines.push(parsed);
  }

  return lines;
}

function parseOrderSegment(segment: string): ExtractedOrderLine | null {
  const rawText = segment.trim();
  const quantity = extractQuantity(rawText);
  const cleaned = rawText.replace(
    /\b(quiero|quisiera|pedido|pedir|agrega|agregame|suma|sumame|mandame|manda|traeme|trae|traes|dame|poneme|me|das|otra|otro|unas|unos|una|un|la|el|por|favor|porfa)\b/gu,
    " "
  );
  const productText = cleaned.replace(/\b\d+\b/gu, " ").replace(/\s+/gu, " ").trim();

  if (!productText) {
    return null;
  }

  return {
    rawText,
    productText,
    quantity
  };
}

function extractQuantity(segment: string): number {
  const numericMatch = segment.match(/\b(\d+)\b/u);

  if (numericMatch) {
    return Math.max(1, Number(numericMatch[1]));
  }

  if (/\b(dos)\b/u.test(segment)) {
    return 2;
  }

  if (/\b(tres)\b/u.test(segment)) {
    return 3;
  }

  if (/\b(cuatro)\b/u.test(segment)) {
    return 4;
  }

  return 1;
}

function isMenuRequest(normalizedText: string): boolean {
  return (
    normalizedText.includes("menu") ||
    normalizedText.includes("carta") ||
    normalizedText.includes("recomend") ||
    normalizedText.includes("suger")
  );
}

function isMenuOnlyMessage(normalizedText: string): boolean {
  if (!isMenuRequest(normalizedText)) {
    return false;
  }

  const stripped = normalizedText
    .replace(
      /\b(quiero|quisiera|ver|mostrar|mostrame|mostra|pasame|pasar|la|el|menu|carta|que|me|recomendas|recomendame|sugeris|sugerime|favor|porfa)\b/gu,
      " "
    )
    .replace(/\s+/gu, " ")
    .trim();

  return stripped.length === 0;
}

function looksLikeOrderMessage(normalizedText: string): boolean {
  return (
    normalizedText.includes("quiero") ||
    normalizedText.includes("quisiera") ||
    normalizedText.includes("pedido") ||
    normalizedText.includes("pedir") ||
    normalizedText.includes("agrega") ||
    normalizedText.includes("agregame") ||
    normalizedText.includes("suma") ||
    normalizedText.includes("sumame") ||
    normalizedText.includes("mandame") ||
    normalizedText.includes("manda") ||
    normalizedText.includes("traeme") ||
    normalizedText.includes("trae") ||
    normalizedText.includes("dame") ||
    normalizedText.includes("poneme")
  );
}

function looksLikeAddressMessage(normalizedText: string): boolean {
  return (
    normalizedText.includes("direccion") ||
    normalizedText.includes("calle") ||
    normalizedText.includes("avenida") ||
    normalizedText.includes("altura") ||
    normalizedText.includes("barrio") ||
    normalizedText.includes("codigo postal") ||
    normalizedText.includes("av ")
  );
}

function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}
