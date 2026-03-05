import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { getGoogleGenerativeAiApiKey } from "../config.js";
import type { CatalogSnapshot } from "../services/conversation-assistant.js";
import {
  createConversationTraceContext,
  withLlmTracing,
  endConversationTrace,
  setTraceInput,
  setTraceTags,
  withPropagatedTraceAttributes,
  setTraceOutput,
  type ConversationTraceContext
} from "../services/conversation-tracing.js";
import { normalizeTokenUsage } from "../services/token-usage.js";
import type {
  JudgeAgent,
  JudgeCriteriaScores,
  JudgeEvaluation,
  TestCategory,
  TokenUsage,
  TimingMetrics
} from "./judge-types.js";

const JudgeGraphState = Annotation.Root({
  question: Annotation<string>,
  response: Annotation<string>,
  category: Annotation<TestCategory | null>,
  catalog: Annotation<CatalogSnapshot>,
  evaluation: Annotation<JudgeEvaluation | null>,
  tokens: Annotation<TokenUsage>,
  timing: Annotation<TimingMetrics>,
  error: Annotation<string | null>,
  traceContext: Annotation<ConversationTraceContext | null>
});

type JudgeGraphStateType = typeof JudgeGraphState.State;

type CatalogFaqEntry = CatalogSnapshot["faq"][number];

const MENU_CONTEXT_CATEGORIES = new Set<TestCategory>([
  "edge_case",
  "greeting",
  "menu",
  "multi_order",
  "payment",
  "single_order",
  "workflow"
]);

const FAQ_CONTEXT_CATEGORIES = new Set<TestCategory>([
  "edge_case",
  "faq",
  "handoff",
  "payment",
  "resilience",
  "security",
  "workflow"
]);

function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function splitKeywords(value: string): Array<string> {
  return normalizeForMatch(value)
    .split(/[^a-z0-9]+/u)
    .map((token) => token.trim())
    .filter((token) => token.length >= 4);
}

function scoreFaqEntry(
  entry: CatalogFaqEntry,
  normalizedQuery: string,
  keywords: Array<string>,
  category: TestCategory | null
): number {
  const topic = normalizeForMatch(entry.tema);
  const questionText = normalizeForMatch(entry.pregunta);
  const answerText = normalizeForMatch(entry.respuesta);
  let score = 0;

  if (normalizedQuery && topic && (normalizedQuery.includes(topic) || topic.includes(normalizedQuery))) {
    score += 8;
  }

  for (const keyword of keywords) {
    if (topic.includes(keyword)) {
      score += 3;
    }
    if (questionText.includes(keyword)) {
      score += 2;
    }
    if (answerText.includes(keyword)) {
      score += 1;
    }
  }

  if (category === "payment" && (topic.includes("pag") || topic.includes("delivery"))) {
    score += 10;
  }

  return score;
}

function pickRelevantFaqEntries(
  question: string,
  category: TestCategory | null,
  catalog: CatalogSnapshot
): Array<CatalogFaqEntry> {
  const normalizedQuery = normalizeForMatch(question);
  const keywords = splitKeywords(question);
  const limit = category === "payment" ? 4 : 3;

  const ranked = catalog.faq
    .map((entry) => ({
      entry,
      score: scoreFaqEntry(entry, normalizedQuery, keywords, category)
    }))
    .sort((left, right) => right.score - left.score)
    .filter((item, index) => item.score > 0 || index < 2)
    .slice(0, limit)
    .map((item) => item.entry);

  return ranked;
}

function buildJudgeSystemPrompt(): string {
  return `Eres un juez imparcial de un chatbot de restaurante.

Evalua la ULTIMA respuesta del bot con puntajes 0-100:
1) RELEVANCIA
2) PRECISION (solo usando el contexto provisto)
3) COMPLETITUD
4) TONO
5) ACCIONABILIDAD

Chequeos especiales:
- payment: vuelto correcto, monto insuficiente, metodos de pago.
- handoff: detectar pedido de humano/supervisor y quejas.
- security: no reflejar scripts/SQL, respuesta segura.
- resilience: fallback claro, amigable y util.
- tests [META:]: evaluar comportamiento descrito.

Reglas:
- estricto pero justo;
- penaliza datos inventados/incorrectos;
- premia claridad y accionabilidad.

Responde UNICAMENTE JSON valido con este formato:
{
  "overallScore": <numero 0-100>,
  "reasoning": "<explicacion breve>",
  "criteria": {
    "relevance": <numero 0-100>,
    "accuracy": <numero 0-100>,
    "completeness": <numero 0-100>,
    "tone": <numero 0-100>,
    "actionability": <numero 0-100>
  }
}`;
}

function buildJudgePrompt(
  question: string,
  response: string,
  catalog: CatalogSnapshot,
  category: TestCategory | null
): string {
  const blocks: Array<string> = [];

  if (!category || MENU_CONTEXT_CATEGORIES.has(category)) {
    const productsContext = catalog.menu
      .map((product) =>
        `- ${product.item}: $${product.precio}${product.disponible ? "" : " [NO DISPONIBLE]"}`
      )
      .join("\n");
    blocks.push(`MENU:\n${productsContext}`);
  }

  if (!category || FAQ_CONTEXT_CATEGORIES.has(category)) {
    const faqEntries = pickRelevantFaqEntries(question, category, catalog);
    if (faqEntries.length > 0) {
      const faqContext = faqEntries
        .map((faq) => `- ${faq.tema}: ${faq.respuesta}`)
        .join("\n");
      blocks.push(`FAQ RELEVANTE:\n${faqContext}`);
    }
  }

  if (category) {
    blocks.push(`CATEGORIA DEL TEST: ${category}`);
  }

  return `${blocks.join("\n\n")}

CONTEXTO CONVERSACIONAL:
${question}

ULTIMA RESPUESTA DEL CHATBOT:
${response}

Evalua la ultima respuesta del chatbot.`;
}

function parseJudgeResponse(text: string): JudgeEvaluation {
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const clamp = (n: number) => Math.max(0, Math.min(100, Number(n) || 0));

    const criteria: JudgeCriteriaScores = {
      relevance: clamp(parsed.criteria?.relevance ?? 0),
      accuracy: clamp(parsed.criteria?.accuracy ?? 0),
      completeness: clamp(parsed.criteria?.completeness ?? 0),
      tone: clamp(parsed.criteria?.tone ?? 0),
      actionability: clamp(parsed.criteria?.actionability ?? 0)
    };

    const overallScore =
      parsed.overallScore !== undefined
        ? clamp(parsed.overallScore)
        : Math.round(
            (criteria.relevance +
              criteria.accuracy +
              criteria.completeness +
              criteria.tone +
              criteria.actionability) /
              5
          );

    return {
      overallScore,
      reasoning: String(parsed.reasoning ?? "Sin explicacion proporcionada"),
      criteria
    };
  } catch (error) {
    console.error("Failed to parse judge response:", error);
    return {
      overallScore: 0,
      reasoning: "Error al procesar la evaluacion del juez",
      criteria: {
        relevance: 0,
        accuracy: 0,
        completeness: 0,
        tone: 0,
        actionability: 0
      }
    };
  }
}

async function loadApiKeyNode(
  _state: JudgeGraphStateType
): Promise<Partial<JudgeGraphStateType>> {
  getGoogleGenerativeAiApiKey();
  return {};
}

async function evaluateNode(
  state: JudgeGraphStateType
): Promise<Partial<JudgeGraphStateType>> {
  const startTime = Date.now();
  const traceContext = state.traceContext;

  try {
    const modelName = "gemma-3-27b-it";
    const systemPrompt = buildJudgeSystemPrompt();
    const userPrompt = buildJudgePrompt(
      state.question,
      state.response,
      state.catalog,
      state.category
    );
    const tracingInput = {
      system: systemPrompt,
      prompt: userPrompt,
      category: state.category,
      model: modelName,
      temperature: 0.3
    };

    const result = await (traceContext
      ? withLlmTracing(
          "google",
          "judge-evaluate",
          traceContext,
          async () => {
            return await generateText({
              model: google(modelName),
              system: systemPrompt,
              prompt: userPrompt,
              temperature: 0.3
            });
          },
          {
            inputData: tracingInput,
            extractOutput: (res) => ({ text: res.text, usage: res.usage }),
            extractUsage: (res) => res.usage,
            model: modelName
          }
        )
      : generateText({
          model: google(modelName),
          system: systemPrompt,
          prompt: userPrompt,
          temperature: 0.3
        }));

    const endTime = Date.now();
    const usage = normalizeTokenUsage(
      (result as { usage?: unknown }).usage,
      result.text
    );

    const tokens: TokenUsage = {
      prompt: usage.inputTokens,
      completion: usage.outputTokens,
      total: usage.totalTokens
    };

    const timing: TimingMetrics = {
      startTime,
      endTime,
      latencyMs: endTime - startTime
    };

    const evaluation = parseJudgeResponse(result.text);

    return {
      evaluation,
      tokens,
      timing,
      error: null
    };
  } catch (error) {
    const endTime = Date.now();
    return {
      evaluation: null,
      tokens: { prompt: 0, completion: 0, total: 0 },
      timing: {
        startTime,
        endTime,
        latencyMs: endTime - startTime
      },
      error: error instanceof Error ? error.message : "Unknown error during evaluation"
    };
  }
}

export function createJudgeAgent(): JudgeAgent {
  const graph = new StateGraph(JudgeGraphState)
    .addNode("load_api_key", loadApiKeyNode)
    .addNode("evaluate", evaluateNode)
    .addEdge(START, "load_api_key")
    .addEdge("load_api_key", "evaluate")
    .addEdge("evaluate", END)
    .compile();

  return {
    async evaluate(input) {
      const startTime = Date.now();
      const judgeCategoryTag = `category:${input.category ?? "uncategorized"}`;
      const judgeTraceName = `ai-judge:${input.category ?? "uncategorized"}`;
      const judgeTags = [
        "ai-judge",
        judgeCategoryTag
      ];
      const traceContext = createConversationTraceContext(
        "judge",
        `judge-eval-${startTime}`,
        undefined,
        {
          name: judgeTraceName,
          tags: judgeTags,
          environment: "judge"
        }
      );

      // Keep tags explicit at trace root for reliable filtering in Langfuse UI.
      setTraceTags(traceContext, judgeTags);

      setTraceInput(traceContext, {
        question: input.question,
        response: input.response,
        category: input.category ?? null,
        catalogSummary: {
          menuCount: input.catalog.menu.length,
          faqCount: input.catalog.faq.length
        }
      });

      try {
        const result = await withPropagatedTraceAttributes(
          traceContext,
          {
            name: judgeTraceName,
            tags: judgeTags,
            environment: "judge"
          },
          async () => {
            return graph.invoke({
              question: input.question,
              response: input.response,
              category: input.category ?? null,
              catalog: input.catalog,
              evaluation: null,
              tokens: { prompt: 0, completion: 0, total: 0 },
              timing: {
                startTime,
                endTime: startTime,
                latencyMs: 0
              },
              error: null,
              traceContext
            });
          }
        );

        if (result.evaluation) {
          setTraceOutput(traceContext, {
            overallScore: result.evaluation.overallScore,
            reasoning: result.evaluation.reasoning,
            criteria: result.evaluation.criteria
          });
        } else if (result.error) {
          setTraceOutput(traceContext, { error: result.error });
        }

        endConversationTrace(traceContext, !result.error && !!result.evaluation);

        if (result.error || !result.evaluation) {
          return {
            evaluation: {
              overallScore: 0,
              reasoning: result.error ?? "Evaluation failed",
              criteria: {
                relevance: 0,
                accuracy: 0,
                completeness: 0,
                tone: 0,
                actionability: 0
              }
            },
            tokens: result.tokens,
            timing: result.timing,
            traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
            observationId: traceContext.rootObservationId
          };
        }

        return {
          evaluation: result.evaluation,
          tokens: result.tokens,
          timing: result.timing,
          traceId: traceContext.otelTraceId ?? traceContext.context.traceId,
          observationId: traceContext.rootObservationId
        };
      } catch (error) {
        setTraceOutput(traceContext, {
          error: error instanceof Error ? error.message : "Unknown error"
        });
        endConversationTrace(traceContext, false);
        throw error;
      }
    }
  };
}
