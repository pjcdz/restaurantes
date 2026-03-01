import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================
// Public Queries
// ============================================

/**
 * Get all menu items
 */
export const getAll = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("menu"),
      _creationTime: v.number(),
      item: v.string(),
      descripcion: v.string(),
      precio: v.number(),
      categoria: v.string(),
      disponible: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.query("menu").collect();
  },
});

/**
 * Get menu items by category
 */
export const getByCategoria = query({
  args: { categoria: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("menu"),
      _creationTime: v.number(),
      item: v.string(),
      descripcion: v.string(),
      precio: v.number(),
      categoria: v.string(),
      disponible: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("menu")
      .withIndex("by_categoria", (q) => q.eq("categoria", args.categoria))
      .collect();
  },
});

/**
 * Get available menu items only
 */
export const getAvailable = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("menu"),
      _creationTime: v.number(),
      item: v.string(),
      descripcion: v.string(),
      precio: v.number(),
      categoria: v.string(),
      disponible: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const allItems = await ctx.db.query("menu").collect();
    return allItems.filter((item) => item.disponible);
  },
});

/**
 * Search menu items by name
 */
export const searchByName = query({
  args: { searchTerm: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("menu"),
      _creationTime: v.number(),
      item: v.string(),
      descripcion: v.string(),
      precio: v.number(),
      categoria: v.string(),
      disponible: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const allItems = await ctx.db.query("menu").collect();
    const searchLower = args.searchTerm.toLowerCase();
    return allItems.filter(
      (item) =>
        item.item.toLowerCase().includes(searchLower) ||
        item.descripcion.toLowerCase().includes(searchLower),
    );
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a new menu item
 */
export const create = mutation({
  args: {
    item: v.string(),
    descripcion: v.string(),
    precio: v.number(),
    categoria: v.string(),
    disponible: v.boolean(),
  },
  returns: v.id("menu"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("menu", {
      item: args.item,
      descripcion: args.descripcion,
      precio: args.precio,
      categoria: args.categoria,
      disponible: args.disponible,
    });
  },
});

/**
 * Update a menu item
 */
export const update = mutation({
  args: {
    menuId: v.id("menu"),
    item: v.optional(v.string()),
    descripcion: v.optional(v.string()),
    precio: v.optional(v.number()),
    categoria: v.optional(v.string()),
    disponible: v.optional(v.boolean()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { menuId, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.db.patch(menuId, filteredUpdates);
    }
    return null;
  },
});

/**
 * Set menu item availability
 */
export const setAvailability = mutation({
  args: {
    menuId: v.id("menu"),
    disponible: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.menuId, { disponible: args.disponible });
    return null;
  },
});

/**
 * Delete a menu item
 */
export const remove = mutation({
  args: { menuId: v.id("menu") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.menuId);
    return null;
  },
});

// ============================================
// Internal Queries
// ============================================

/**
 * Internal query to get all available menu items
 */
export const internalGetAvailable = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("menu"),
      _creationTime: v.number(),
      item: v.string(),
      descripcion: v.string(),
      precio: v.number(),
      categoria: v.string(),
      disponible: v.boolean(),
    }),
  ),
  handler: async (ctx, args) => {
    const allItems = await ctx.db.query("menu").collect();
    return allItems.filter((item) => item.disponible);
  },
});
