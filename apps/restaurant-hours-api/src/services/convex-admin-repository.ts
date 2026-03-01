import { ConvexHttpClient } from "convex/browser";
import { anyApi } from "convex/server";

import { type CatalogFaqRecord } from "./conversation-assistant.js";

const convexApi = anyApi as Record<string, any>;

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
    await this.client.mutation(convexApi.conversations.upsertCatalogItem, input);
  }

  async deleteCatalogItem(item: string): Promise<void> {
    await this.client.mutation(convexApi.conversations.deleteCatalogItem, {
      item
    });
  }

  async upsertFaqEntry(input: CatalogFaqRecord): Promise<void> {
    await this.client.mutation(convexApi.conversations.upsertFaqEntry, input);
  }

  async deleteFaqEntry(tema: string): Promise<void> {
    await this.client.mutation(convexApi.conversations.deleteFaqEntry, {
      tema
    });
  }
}
