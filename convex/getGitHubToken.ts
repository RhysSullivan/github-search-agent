import { query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { v } from "convex/values";
import { components } from "./_generated/api";

// Helper function to get GitHub access token for a user
export const getGitHubToken = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    // Verify the user is authenticated
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const sessionResult = await auth.api.getSession({ headers });
    const sessionUserId = sessionResult?.user?.id || args.userId;

    const account = await ctx.runQuery(components.betterAuth.adapter.findOne, {
      model: "account",
      where: [
        {
          field: "userId",
          operator: "eq",
          value: sessionUserId,
        },
        {
          connector: "AND",
          field: "providerId",
          operator: "eq",
          value: "github",
        },
      ],
    });

    return account?.accessToken;
  },
});
