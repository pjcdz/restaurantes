import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { ConvexCircuitBreaker } from "../resilience/circuit-breaker.js";
import {
  type CatalogSnapshot,
  type ConversationCheckpoint,
  type ConversationOrderRecord,
  type ConversationPaymentConfig,
  type ConversationRepository,
  type ConversationSessionRecord
} from "./conversation-assistant.js";

const convexApi = anyApi as Record<string, any>;
const EXTRA_FIELD_ERROR_PATTERN = /Object contains extra field [`"']?([a-zA-Z0-9_]+)[`"']?/u;

function extractUnsupportedField(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(EXTRA_FIELD_ERROR_PATTERN);
  return match?.[1] ?? null;
}

export class ConvexConversationRepository implements ConversationRepository {
  private readonly client: ConvexHttpClient;

  constructor(url: string) {
    this.client = new ConvexHttpClient(url);
  }

  private async mutateWithCompatibilityRetry<T>(
    mutation: unknown,
    input: Record<string, unknown>
  ): Promise<T> {
    let payload = { ...input };
    const removedFields = new Set<string>();

    while (true) {
      try {
        return (await this.client.mutation(mutation as any, payload as any)) as T;
      } catch (error) {
        const unsupportedField = extractUnsupportedField(error);

        if (
          !unsupportedField ||
          removedFields.has(unsupportedField) ||
          !(unsupportedField in payload)
        ) {
          throw error;
        }

        removedFields.add(unsupportedField);
        const { [unsupportedField]: _removed, ...nextPayload } = payload;
        payload = nextPayload;
      }
    }
  }

  async upsertSessionByChatId(chatId: string): Promise<ConversationSessionRecord> {
    return (await ConvexCircuitBreaker.execute(async () => {
      return (await this.client.mutation(
        convexApi.conversations.upsertSessionByChatId,
        {
          chatId
        }
      )) as ConversationSessionRecord;
    }));
  }

  async getLatestCheckpoint(
    sessionId: string
  ): Promise<ConversationCheckpoint | null> {
    return (await ConvexCircuitBreaker.execute(async () => {
      return (await this.client.query(
        convexApi.conversations.getLatestCheckpointBySessionId,
        {
          sessionId
        }
      )) as ConversationCheckpoint | null;
    }));
  }

  async saveCheckpoint(
    input: Omit<ConversationCheckpoint, "id">
  ): Promise<ConversationCheckpoint> {
    return (await ConvexCircuitBreaker.execute(async () => {
      return await this.mutateWithCompatibilityRetry<ConversationCheckpoint>(
        convexApi.conversations.saveCheckpoint,
        input as unknown as Record<string, unknown>
      );
    }));
  }

  async getCatalogSnapshot(): Promise<CatalogSnapshot> {
    return (await ConvexCircuitBreaker.execute(async () => {
      const [menu, faq, prices] = await Promise.all([
        this.client.query(convexApi.conversations.listMenuItems, {}),
        this.client.query(convexApi.conversations.listFaqEntries, {}),
        this.client.query(convexApi.conversations.listPriceEntries, {})
      ]);

      return {
        menu: menu as CatalogSnapshot["menu"],
        faq: faq as CatalogSnapshot["faq"],
        prices: prices as CatalogSnapshot["prices"]
      };
    }));
  }

  async upsertOrderForSession(
    input: Omit<ConversationOrderRecord, "createdAt" | "id" | "updatedAt">
  ): Promise<ConversationOrderRecord> {
    return (await ConvexCircuitBreaker.execute(async () => {
      const persistedOrder = await this.mutateWithCompatibilityRetry<ConversationOrderRecord>(
        convexApi.conversations.upsertPedidoForSession,
        input as unknown as Record<string, unknown>
      );

      return {
        ...persistedOrder,
        montoAbono: persistedOrder.montoAbono ?? null
      };
    }));
  }

  async updateSessionStatus(
    chatId: string,
    status: "active" | "handed_off" | "paused"
  ): Promise<void> {
    await ConvexCircuitBreaker.execute(async () => {
      await this.client.mutation(convexApi.conversations.updateSessionStatus, {
        chatId,
        status
      });
    });
  }

  async getActivePaymentConfig(): Promise<ConversationPaymentConfig | null> {
    return (await ConvexCircuitBreaker.execute(async () => {
      return (await this.client.query(
        convexApi.payments.getActivePaymentConfig,
        {}
      )) as ConversationPaymentConfig | null;
    }));
  }
}
