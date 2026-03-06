import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { type CatalogFaqRecord } from "./conversation-assistant.js";

const convexApi = anyApi as Record<string, any>;
const EXTRA_FIELD_ERROR_PATTERN = /Object contains extra field [`"']?([a-zA-Z0-9_]+)[`"']?/u;

function extractUnsupportedField(error: unknown): string | null {
  const message = error instanceof Error ? error.message : String(error);
  const match = message.match(EXTRA_FIELD_ERROR_PATTERN);
  return match?.[1] ?? null;
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

export type HandoffAdminRepository = {
  getHandedOffSessions(): Promise<Array<HandedOffSession>>;
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
    const sessions = await this.client.query(
      convexApi.conversations.listHandedOffSessions,
      {}
    );

    return (sessions as Array<{
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
  }

  async reactivateSession(chatId: string): Promise<void> {
    await this.mutateWithCompatibilityRetry<void>(
      convexApi.conversations.updateSessionStatus,
      {
        chatId,
        status: "active"
      }
    );
  }
}
