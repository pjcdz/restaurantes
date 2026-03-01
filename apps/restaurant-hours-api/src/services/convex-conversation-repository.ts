import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import {
  type CatalogSnapshot,
  type ConversationCheckpoint,
  type ConversationOrderRecord,
  type ConversationRepository,
  type ConversationSessionRecord
} from "./conversation-assistant.js";

const convexApi = anyApi as Record<string, any>;

export class ConvexConversationRepository implements ConversationRepository {
  private readonly client: ConvexHttpClient;

  constructor(url: string) {
    this.client = new ConvexHttpClient(url);
  }

  async upsertSessionByChatId(chatId: string): Promise<ConversationSessionRecord> {
    return (await this.client.mutation(
      convexApi.conversations.upsertSessionByChatId,
      {
        chatId
      }
    )) as ConversationSessionRecord;
  }

  async getLatestCheckpoint(
    sessionId: string
  ): Promise<ConversationCheckpoint | null> {
    return (await this.client.query(
      convexApi.conversations.getLatestCheckpointBySessionId,
      {
        sessionId
      }
    )) as ConversationCheckpoint | null;
  }

  async saveCheckpoint(
    input: Omit<ConversationCheckpoint, "id">
  ): Promise<ConversationCheckpoint> {
    return (await this.client.mutation(
      convexApi.conversations.saveCheckpoint,
      input
    )) as ConversationCheckpoint;
  }

  async getCatalogSnapshot(): Promise<CatalogSnapshot> {
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
  }

  async upsertOrderForSession(
    input: Omit<ConversationOrderRecord, "createdAt" | "id" | "updatedAt">
  ): Promise<ConversationOrderRecord> {
    return (await this.client.mutation(
      convexApi.conversations.upsertPedidoForSession,
      input
    )) as ConversationOrderRecord;
  }
}
