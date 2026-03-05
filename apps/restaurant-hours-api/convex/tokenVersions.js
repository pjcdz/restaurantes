import { internalMutation, query } from "./_generated/server.js";
import { v } from "convex/values";
/**
 * Gets the current token version for a user.
 * Returns 0 if no version exists for the user.
 */
export const getTokenVersion = query({
    args: {
        userId: v.string()
    },
    returns: v.number(),
    handler: async (ctx, args) => {
        const record = await ctx.db
            .query("tokenVersions")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .unique();
        return record?.version ?? 0;
    }
});
/**
 * Sets the token version for a user.
 * Creates a new record if one doesn't exist.
 * Version must be a non-negative number.
 */
export const setTokenVersion = internalMutation({
    args: {
        userId: v.string(),
        version: v.number()
    },
    returns: v.null(),
    handler: async (ctx, args) => {
        // Validate version is non-negative
        if (args.version < 0) {
            throw new Error("Token version must be a non-negative number");
        }
        const existing = await ctx.db
            .query("tokenVersions")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .unique();
        if (existing) {
            await ctx.db.patch(existing._id, {
                version: args.version,
                updatedAt: Date.now()
            });
        }
        else {
            await ctx.db.insert("tokenVersions", {
                userId: args.userId,
                version: args.version,
                updatedAt: Date.now()
            });
        }
        return null;
    }
});
/**
 * Increments the token version for a user, effectively revoking all previous tokens.
 * Returns the new version number.
 * This operation is atomic within the Convex transaction.
 */
export const incrementTokenVersion = internalMutation({
    args: {
        userId: v.string()
    },
    returns: v.number(),
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("tokenVersions")
            .withIndex("by_userId", (q) => q.eq("userId", args.userId))
            .unique();
        const currentVersion = existing?.version ?? 0;
        const newVersion = currentVersion + 1;
        const now = Date.now();
        if (existing) {
            await ctx.db.patch(existing._id, {
                version: newVersion,
                updatedAt: now
            });
        }
        else {
            await ctx.db.insert("tokenVersions", {
                userId: args.userId,
                version: newVersion,
                updatedAt: now
            });
        }
        return newVersion;
    }
});
