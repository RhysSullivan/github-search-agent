import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  sandboxes: defineTable({
    chatId: v.string(),
    sandboxId: v.string(),
    repositoryUrl: v.string(),
    createdAt: v.number(),
  }).index("by_chatId", ["chatId"]),
});



