import { query, mutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================
// Public Queries
// ============================================

/**
 * Get all FAQ entries
 */
export const getAll = query({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("faq"),
      _creationTime: v.number(),
      tema: v.string(),
      pregunta: v.string(),
      respuesta: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.query("faq").collect();
  },
});

/**
 * Get FAQ entries by topic
 */
export const getByTema = query({
  args: { tema: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("faq"),
      _creationTime: v.number(),
      tema: v.string(),
      pregunta: v.string(),
      respuesta: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db
      .query("faq")
      .withIndex("by_tema", (q) => q.eq("tema", args.tema))
      .collect();
  },
});

/**
 * Search FAQ entries by question text
 */
export const search = query({
  args: { searchTerm: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("faq"),
      _creationTime: v.number(),
      tema: v.string(),
      pregunta: v.string(),
      respuesta: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const allFaq = await ctx.db.query("faq").collect();
    const searchLower = args.searchTerm.toLowerCase();
    return allFaq.filter(
      (f) =>
        f.pregunta.toLowerCase().includes(searchLower) ||
        f.respuesta.toLowerCase().includes(searchLower) ||
        f.tema.toLowerCase().includes(searchLower),
    );
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a new FAQ entry
 */
export const create = mutation({
  args: {
    tema: v.string(),
    pregunta: v.string(),
    respuesta: v.string(),
  },
  returns: v.id("faq"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("faq", {
      tema: args.tema,
      pregunta: args.pregunta,
      respuesta: args.respuesta,
    });
  },
});

/**
 * Update an FAQ entry
 */
export const update = mutation({
  args: {
    faqId: v.id("faq"),
    tema: v.optional(v.string()),
    pregunta: v.optional(v.string()),
    respuesta: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { faqId, ...updates } = args;
    const filteredUpdates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        filteredUpdates[key] = value;
      }
    }
    if (Object.keys(filteredUpdates).length > 0) {
      await ctx.db.patch(faqId, filteredUpdates);
    }
    return null;
  },
});

/**
 * Delete an FAQ entry
 */
export const remove = mutation({
  args: { faqId: v.id("faq") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.delete(args.faqId);
    return null;
  },
});

// ============================================
// Internal Queries
// ============================================

/**
 * Internal query to get all FAQ entries
 */
export const internalGetAll = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      _id: v.id("faq"),
      _creationTime: v.number(),
      tema: v.string(),
      pregunta: v.string(),
      respuesta: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.query("faq").collect();
  },
});

/**
 * Internal query to search FAQ entries
 */
export const internalSearch = internalQuery({
  args: { searchTerm: v.string() },
  returns: v.array(
    v.object({
      _id: v.id("faq"),
      _creationTime: v.number(),
      tema: v.string(),
      pregunta: v.string(),
      respuesta: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const allFaq = await ctx.db.query("faq").collect();
    const searchLower = args.searchTerm.toLowerCase();
    return allFaq.filter(
      (f) =>
        f.pregunta.toLowerCase().includes(searchLower) ||
        f.respuesta.toLowerCase().includes(searchLower) ||
        f.tema.toLowerCase().includes(searchLower),
    );
  },
});
