import { query } from "./_generated/server";
import { authComponent, createAuth } from "./auth";

export const getUserId = query({
  handler: async (ctx): Promise<string | null> => {
    const user = await authComponent.getAuthUser(ctx);
    if (!user) {
      return null;
    }

    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const sessionResult = await auth.api.getSession({ headers });
    return sessionResult?.user?.id ?? null;
  },
});

