import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getSandboxByChatId = query({
  args: { chatId: v.string() },
  handler: async (ctx, args) => {
    const sandbox = await ctx.db
      .query("sandboxes")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    return sandbox;
  },
});

export const setSandboxForChatId = mutation({
  args: {
    chatId: v.string(),
    sandboxId: v.string(),
    repositoryUrl: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("sandboxes")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .first();

    if (existing) {
      // Update existing sandbox
      await ctx.db.patch(existing._id, {
        sandboxId: args.sandboxId,
        repositoryUrl: args.repositoryUrl,
        createdAt: Date.now(),
      });
      return existing._id;
    } else {
      // Create new sandbox mapping
      return await ctx.db.insert("sandboxes", {
        chatId: args.chatId,
        sandboxId: args.sandboxId,
        repositoryUrl: args.repositoryUrl,
        createdAt: Date.now(),
      });
    }
  },
});

