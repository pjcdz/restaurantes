import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { google } from "@ai-sdk/google";
import { generateText } from "ai";

import { getGoogleGenerativeAiApiKey } from "../config.js";
import type { CatalogSnapshot } from "../services/conversation-assistant.js";
import type {
  JudgeAgent,
  JudgeCriteriaScores,
  JudgeEvaluation,
  JudgeState,
  TokenUsage,
  TimingMetrics
} from "./judge-types.js";

/**
 * Judge graph state annotation
 */
const JudgeGraphState = Annotation.Root({
  question: Annotation<string>,
  response: Annotation<string>,
  catalog: Annotation<CatalogSnapshot>,
  evaluation: Annotation<JudgeEvaluation | null>,
  tokens: Annotation<TokenUsage>,
  timing: Annotation<TimingMetrics>,
  error: Annotation<string | null>
});

type JudgeGraphStateType = typeof JudgeGraphState.State;

/**
 * Build the system prompt for the judge
 */
function buildJudgeSystemPrompt(): string {
  return `Eres un juez imparcial que evalúa respuestas de un chatbot de restaurante.

Tu tarea es evaluar qué tan bien el chatbot respondió a la pregunta del usuario.

Criterios de evaluación (0-100 cada uno):
1. RELEVANCIA: ¿La respuesta aborda la pregunta del usuario?
2. PRECISION: ¿La información es correcta según el catálogo proporcionado?
3. COMPLETITUD: ¿Proporcionó toda la información necesaria?
4. TONO: ¿Es amigable y profesional?
5. ACCIONABILIDAD: ¿El usuario puede tomar una acción basándose en la respuesta?

Reglas:
- Sé estricto pero justo
- Penaliza información incorrecta o inventada
- Valora respuestas claras y concisas
- Considera el contexto del restaurante de comida rápida

Responde ÚNICAMENTE con un JSON válido en este formato:
{
  "overallScore": <número 0-100>,
  "reasoning": "<breve explicación del puntaje>",
  "criteria": {
    "relevance": <número 0-100>,
    "accuracy": <número 0-100>,
    "completeness": <número 0-100>,
    "tone": <número 0-100>,
    "actionability": <número 0-100>
  }
}`;
}

/**
 * Build the user prompt with context
 */
function buildJudgePrompt(
  question: string,
  response: string,
  catalog: CatalogSnapshot
): string {
  const productsContext = catalog.menu
    .map((p) => `- ${p.item}: $${p.precio} (${p.categoria})${p.disponible ? "" : " [NO DISPONIBLE]"}`)
    .join("\n");

  const faqContext = catalog.faq
    .map((f) => `- ${f.tema}: ${f.respuesta}`)
    .join("\n");

  return `CATÁLOGO DE PRODUCTOS:
${productsContext}

PREGUNTAS FRECUENTES:
${faqContext}

PREGUNTA DEL USUARIO:
${question}

RESPUESTA DEL CHATBOT:
${response}

Evalúa la respuesta del chatbot.`;
}

/**
 * Parse the judge's JSON response
 */
function parseJudgeResponse(text: string): JudgeEvaluation {
  try {
    // Try to extract JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in response");
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and clamp scores
    const clamp = (n: number) => Math.max(0, Math.min(100, Number(n) || 0));

    const criteria: JudgeCriteriaScores = {
      relevance: clamp(parsed.criteria?.relevance ?? 0),
      accuracy: clamp(parsed.criteria?.accuracy ?? 0),
      completeness: clamp(parsed.criteria?.completeness ?? 0),
      tone: clamp(parsed.criteria?.tone ?? 0),
      actionability: clamp(parsed.criteria?.actionability ?? 0)
    };

    // Calculate overall score as average if not provided
    const overallScore = parsed.overallScore !== undefined
      ? clamp(parsed.overallScore)
      : Math.round((criteria.relevance + criteria.accuracy + criteria.completeness + criteria.tone + criteria.actionability) / 5);

    return {
      overallScore,
      reasoning: String(parsed.reasoning ?? "Sin explicación proporcionada"),
      criteria
    };
  } catch (error) {
    // Return a default evaluation on parse failure
    console.error("Failed to parse judge response:", error);
    return {
      overallScore: 0,
      reasoning: "Error al procesar la evaluación del juez",
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

/**
 * Node: Load API key
 */
async function loadApiKeyNode(state: JudgeGraphStateType): Promise<Partial<JudgeGraphStateType>> {
  getGoogleGenerativeAiApiKey();
  return {};
}

/**
 * Node: Call the judge LLM
 */
async function evaluateNode(state: JudgeGraphStateType): Promise<Partial<JudgeGraphStateType>> {
  const startTime = Date.now();

  try {
    const result = await generateText({
      model: google("gemma-3-27b-it"),
      system: buildJudgeSystemPrompt(),
      prompt: buildJudgePrompt(state.question, state.response, state.catalog),
      temperature: 0.3 // Lower temperature for more consistent evaluations
    });

    const endTime = Date.now();

    const usage = result.usage as { promptTokens?: number; completionTokens?: number } | undefined;
    const promptTokens = usage?.promptTokens ?? 0;
    const completionTokens = usage?.completionTokens ?? 0;
    const tokens: TokenUsage = {
      prompt: promptTokens,
      completion: completionTokens,
      total: promptTokens + completionTokens
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

/**
 * Create the judge agent using LangGraph
 */
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

      const result = await graph.invoke({
        question: input.question,
        response: input.response,
        catalog: input.catalog,
        evaluation: null,
        tokens: { prompt: 0, completion: 0, total: 0 },
        timing: {
          startTime,
          endTime: startTime,
          latencyMs: 0
        },
        error: null
      });

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
          timing: result.timing
        };
      }

      return {
        evaluation: result.evaluation,
        tokens: result.tokens,
        timing: result.timing
      };
    }
  };
}
