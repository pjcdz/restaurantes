import { query, mutation, internalQuery, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

// ============================================
// Public Queries
// ============================================

/**
 * Get the latest checkpoint for a session
 */
export const getLatest = query({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("checkpoints"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      threadId: v.string(),
      checkpoint: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .first();
    return checkpoint;
  },
});

/**
 * Get checkpoint by thread ID
 */
export const getByThreadId = query({
  args: { threadId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("checkpoints"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      threadId: v.string(),
      checkpoint: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db
      .query("checkpoints")
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .order("desc")
      .first();
    return checkpoint;
  },
});

// ============================================
// Public Mutations
// ============================================

/**
 * Save a new checkpoint (LangGraph state)
 */
export const save = mutation({
  args: {
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(), // JSON serialized state
  },
  returns: v.id("checkpoints"),
  handler: async (ctx, args) => {
    const checkpointId = await ctx.db.insert("checkpoints", {
      sessionId: args.sessionId,
      threadId: args.threadId,
      checkpoint: args.checkpoint,
    });
    return checkpointId;
  },
});

/**
 * Update an existing checkpoint
 */
export const update = mutation({
  args: {
    checkpointId: v.id("checkpoints"),
    checkpoint: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.checkpointId, { checkpoint: args.checkpoint });
    return null;
  },
});

// ============================================
// Internal Queries
// ============================================

/**
 * Internal query to get latest checkpoint for a session
 */
export const internalGetLatest = internalQuery({
  args: { sessionId: v.id("sessions") },
  returns: v.union(
    v.null(),
    v.object({
      _id: v.id("checkpoints"),
      _creationTime: v.number(),
      sessionId: v.id("sessions"),
      threadId: v.string(),
      checkpoint: v.string(),
    }),
  ),
  handler: async (ctx, args) => {
    const checkpoint = await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .first();
    return checkpoint;
  },
});

// ============================================
// Internal Mutations
// ============================================

/**
 * Internal mutation to save or update checkpoint
 */
export const internalSaveOrUpdate = internalMutation({
  args: {
    sessionId: v.id("sessions"),
    threadId: v.string(),
    checkpoint: v.string(),
  },
  returns: v.id("checkpoints"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("checkpoints")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .filter((q) => q.eq(q.field("threadId"), args.threadId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { checkpoint: args.checkpoint });
      return existing._id;
    }

    return await ctx.db.insert("checkpoints", {
      sessionId: args.sessionId,
      threadId: args.threadId,
      checkpoint: args.checkpoint,
    });
  },
});
