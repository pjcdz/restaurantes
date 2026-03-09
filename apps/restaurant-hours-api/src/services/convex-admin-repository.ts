import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { type CatalogFaqRecord } from "./conversation-assistant.js";
import {
  listFallbackHandedOffSessions,
  setFallbackSessionStatus
} from "./handoff-session-store.js";

const convexApi = anyApi as Record<string, any>;
const EXTRA_FIELD_ERROR_PATTERN = /Object contains extra field [`"']?([a-zA-Z0-9_]+)[`"']?/u;
const MISSING_FUNCTION_PATTERN = /Could not find public function for ['`]([^'"`]+)['`]/u;

function extractUnsupportedField(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(EXTRA_FIELD_ERROR_PATTERN);
  return match?.[1] ?? null;
}

function isMissingPublicFunction(error: unknown, functionName: string): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(MISSING_FUNCTION_PATTERN);
  return match?.[1] === functionName;
}

export type AdminCatalogItem = {
  item: string;
  descripcion: string;
  precio: number;
  categoria: string;
  disponible: boolean;
  aliases: Array<string>;
};

export type AdminCatalogItemInput = AdminCatalogItem & {
  originalItem: string | null;
};

export type HandedOffSession = {
  id: string;
  chatId: string;
  phoneNumber: string | null;
  createdAt: number;
  updatedAt: number;
};

export type ConversationHistoryEntry = {
  message: string;
  reply: string;
  timestamp: number;
};

export type HandoffAdminRepository = {
  getHandedOffSessions(): Promise<Array<HandedOffSession>>;
  getConversationHistory(chatId: string): Promise<Array<ConversationHistoryEntry>>;
  reactivateSession(chatId: string): Promise<void>;
};

export type CatalogAdminRepository = {
  getAdminData(): Promise<{
    products: Array<AdminCatalogItem>;
    faq: Array<CatalogFaqRecord>;
  }>;
  upsertCatalogItem(input: AdminCatalogItemInput): Promise<void>;
  deleteCatalogItem(item: string): Promise<void>;
  upsertFaqEntry(input: CatalogFaqRecord): Promise<void>;
  deleteFaqEntry(tema: string): Promise<void>;
};

export class ConvexAdminRepository implements CatalogAdminRepository {
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

  async getAdminData(): Promise<{
    products: Array<AdminCatalogItem>;
    faq: Array<CatalogFaqRecord>;
  }> {
    const [products, faq] = await Promise.all([
      this.client.query(convexApi.conversations.listCatalogItemsForAdmin, {}),
      this.client.query(convexApi.conversations.listFaqEntries, {}),
    ]);

    return {
      products: products as Array<AdminCatalogItem>,
      faq: faq as Array<CatalogFaqRecord>
    };
  }

  async upsertCatalogItem(input: AdminCatalogItemInput): Promise<void> {
    await this.mutateWithCompatibilityRetry<void>(
      convexApi.conversations.upsertCatalogItem,
      input as unknown as Record<string, unknown>
    );
  }

  async deleteCatalogItem(item: string): Promise<void> {
    await this.mutateWithCompatibilityRetry<void>(
      convexApi.conversations.deleteCatalogItem,
      { item }
    );
  }

  async upsertFaqEntry(input: CatalogFaqRecord): Promise<void> {
    await this.mutateWithCompatibilityRetry<void>(
      convexApi.conversations.upsertFaqEntry,
      input as unknown as Record<string, unknown>
    );
  }

  async deleteFaqEntry(tema: string): Promise<void> {
    await this.mutateWithCompatibilityRetry<void>(
      convexApi.conversations.deleteFaqEntry,
      { tema }
    );
  }

  async getHandedOffSessions(): Promise<Array<HandedOffSession>> {
    let persistedSessions: Array<HandedOffSession> = [];

    try {
      const sessions = await this.client.query(
        convexApi.conversations.listHandedOffSessions,
        {}
      );

      persistedSessions = (sessions as Array<{
        id: string;
        chatId: string;
        phoneNumber: string | null;
        createdAt: number;
        updatedAt: number;
      }>).map((session) => ({
        id: session.id,
        chatId: session.chatId,
        phoneNumber: session.phoneNumber,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt
      }));
    } catch (error) {
      if (!isMissingPublicFunction(error, "conversations:listHandedOffSessions")) {
        throw error;
      }
    }

    const fallbackSessions = listFallbackHandedOffSessions();
    const mergedByChatId = new Map<string, HandedOffSession>();

    for (const session of persistedSessions) {
      mergedByChatId.set(session.chatId, session);
    }

    for (const session of fallbackSessions) {
      const existing = mergedByChatId.get(session.chatId);
      if (!existing || session.updatedAt > existing.updatedAt) {
        mergedByChatId.set(session.chatId, session);
      }
    }

    return Array.from(mergedByChatId.values()).sort(
      (left, right) => right.updatedAt - left.updatedAt
    );
  }

  async getConversationHistory(chatId: string): Promise<Array<ConversationHistoryEntry>> {
    return (await this.client.query(
      convexApi.conversations.getConversationHistoryByChatId,
      { chatId }
    )) as Array<ConversationHistoryEntry>;
  }

  async reactivateSession(chatId: string): Promise<void> {
    try {
      await this.mutateWithCompatibilityRetry<void>(
        convexApi.conversations.updateSessionStatus,
        {
          chatId,
          status: "active"
        }
      );
      setFallbackSessionStatus(chatId, "active");
      return;
    } catch (error) {
      if (!isMissingPublicFunction(error, "conversations:updateSessionStatus")) {
        throw error;
      }

      setFallbackSessionStatus(chatId, "active");
    }
  }
}
