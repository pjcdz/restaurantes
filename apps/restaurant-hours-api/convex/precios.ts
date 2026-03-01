import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================
// Public Queries
// ============================================

/**
 * Get all prices
 */
export const getAll = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("precios"),
      _creationTime: v.number(),
      producto: v.string(),
      precioUnitario: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.query("precios").collect();
  },
});

/**
 * Get price by product name
 */
export const getByProducto = query({
  args: { producto: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("precios"),
      _creationTime: v.number(),
      producto: v.string(),
      precioUnitario: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const precio = await ctx.db
      .query("precios")
      .withIndex("by_producto", (q) => q.eq("producto", args.producto))
      .first();
    return precio;
  },
});

/**
 * Search prices by product name (partial match)
 */
export const searchByProducto = query({
  args: { searchTerm: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("precios"),
      _creationTime: v.number(),
      producto: v.string(),
      precioUnitario: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const allPrecios = await ctx.db.query("precios").collect();
    const searchLower = args.searchTerm.toLowerCase();
    return allPrecios.filter((p) =>
      p.producto.toLowerCase().includes(searchLower),
    );
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a new price entry
 */
export const create = mutation({
  args: {
    producto: v.string(),
    precioUnitario: v.number(),
  },
  returns: v.id("precios"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("precios", {
      producto: args.producto,
      precioUnitario: args.precioUnitario,
    });
  },
});

/**
 * Update a price
 */
export const update = mutation({
  args: {
    precioId: v.id("precios"),
    producto: v.optional(v.string()),
    precioUnitario: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { precioId, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.db.patch(precioId, filteredUpdates);
    }
    return null;
  },
});

/**
 * Upsert a price (create or update by product name)
 */
export const upsert = mutation({
  args: {
    producto: v.string(),
    precioUnitario: v.number(),
  },
  returns: v.id("precios"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("precios")
      .withIndex("by_producto", (q) => q.eq("producto", args.producto))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { precioUnitario: args.precioUnitario });
      return existing._id;
    }

    return await ctx.db.insert("precios", {
      producto: args.producto,
      precioUnitario: args.precioUnitario,
    });
  },
});

/**
 * Delete a price entry
 */
export const remove = mutation({
  args: { precioId: v.id("precios") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.precioId);
    return null;
  },
});

// ============================================
// Internal Queries
// ============================================

/**
 * Internal query to get price by product name
 */
export const internalGetByProducto = internalQuery({
  args: { producto: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("precios"),
      _creationTime: v.number(),
      producto: v.string(),
      precioUnitario: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const precio = await ctx.db
      .query("precios")
      .withIndex("by_producto", (q) => q.eq("producto", args.producto))
      .first();
    return precio;
  },
});

/**
 * Internal query to get all prices
 */
export const internalGetAll = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("precios"),
      _creationTime: v.number(),
      producto: v.string(),
      precioUnitario: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.query("precios").collect();
  },
});
