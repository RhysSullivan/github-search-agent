import { query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { components } from "./_generated/api";

export const getGitHubToken = query({
  handler: async (ctx): Promise<string | null> => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const sessionResult = await auth.api.getSession({ headers });
    const sessionUserId = sessionResult?.user?.id;
    if (!sessionUserId) {
      console.error("No session user ID found");
      return null;
    }

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
