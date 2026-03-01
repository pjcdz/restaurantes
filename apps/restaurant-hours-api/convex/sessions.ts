import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================
// Public Queries
// ============================================

/**
 * Get a session by chatId (Telegram chat_id)
 */
export const getByChatId = query({
  args: { chatId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("sessions"),
      _creationTime: v.number(),
      chatId: v.string(),
      phoneNumber: v.optional(v.string()),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    return session;
  },
});

/**
 * Get a session by ID
 */
export const getById = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("sessions"),
      _creationTime: v.number(),
      chatId: v.string(),
      phoneNumber: v.optional(v.string()),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    return await ctx.db.get(args.sessionId);
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Create a new session for a chat
 */
export const create = mutation({
  args: {
    chatId: v.string(),
    phoneNumber: v.optional(v.string()),
  },
  returns: v.id("sessions"),
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("sessions", {
      chatId: args.chatId,
      phoneNumber: args.phoneNumber,
      status: "active",
    });
    return sessionId;
  },
});

/**
 * Update session status
 */
export const updateStatus = mutation({
  args: {
    sessionId: v.id("sessions"),
    status: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { status: args.status });
    return null;
  },
});

/**
 * Update session phone number
 */
export const updatePhone = mutation({
  args: {
    sessionId: v.id("sessions"),
    phoneNumber: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { phoneNumber: args.phoneNumber });
    return null;
  },
});

// ============================================
// Internal Queries
// ============================================

/**
 * Internal query to get session by chatId
 */
export const internalGetByChatId = internalQuery({
  args: { chatId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("sessions"),
      _creationTime: v.number(),
      chatId: v.string(),
      phoneNumber: v.optional(v.string()),
      status: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("sessions")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();
    return session;
  },
});

// ============================================
// Internal Mutations
// ============================================

/**
 * Internal mutation to create or update session
 */
export const internalCreateOrUpdate = internalMutation({
  args: {
    chatId: v.string(),
    phoneNumber: v.optional(v.string()),
  },
  returns: v.id("sessions"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sessions")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    if (existing) {
      if (args.phoneNumber && existing.phoneNumber !== args.phoneNumber) {
        await ctx.db.patch(existing._id, { 
          phoneNumber: args.phoneNumber,
          status: "active",
        });
      } else {
        await ctx.db.patch(existing._id, { status: "active" });
      }
      return existing._id;
    }

    return await ctx.db.insert("sessions", {
      chatId: args.chatId,
      phoneNumber: args.phoneNumber,
      status: "active",
    });
  },
});
