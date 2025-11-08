import { createClient, type GenericCtx } from "@convex-dev/better-auth";
import { convex } from "@convex-dev/better-auth/plugins";
import { components } from "./_generated/api";
import { DataModel } from "./_generated/dataModel";
import { query } from "./_generated/server";
import { betterAuth } from "better-auth";

const siteUrl = process.env.SITE_URL!;

// Component client: helper glue for Convex + Better Auth
export const authComponent = createClient<DataModel>(components.betterAuth);

// Factory to create a Better Auth instance for a given Convex ctx
export const createAuth = (
  ctx: GenericCtx<DataModel>,
  { optionsOnly } = { optionsOnly: false }
) => {
  return betterAuth({
    logger: {
      disabled: optionsOnly,
    },
    baseURL: siteUrl,
    database: authComponent.adapter(ctx),
    secret: process.env.BETTER_AUTH_SECRET!,
    socialProviders: {
      github: {
        clientId: process.env.GITHUB_CLIENT_ID!,
        clientSecret: process.env.GITHUB_CLIENT_SECRET!,
        // Minimal read-only scopes:
        // - user:email: Required for better-auth user identification (read-only)
        // - read:user: Read user profile information (read-only)
        //
        // Note: GitHub's OAuth consent screen may show "Act on your behalf" as standard
        // language, but this app only requests read-only scopes and cannot perform any
        // write operations or access private repositories.
        // Public repositories can be accessed without the 'repo' scope.
        // Authenticated requests provide higher rate limits even without repo scope.
        scope: ["user:email", "read:user"],
      },
    },
    plugins: [
      // Required for Convex compatibility
      convex(),
    ],
  });
};

// Example helper to read current user from Convex
export const getCurrentUser = query({
  args: {},
  handler: async (ctx) => {
    return authComponent.getAuthUser(ctx);
  },
});

// Get session using Better Auth's server methods
export const getSession = query({
  args: {},
  handler: async (ctx) => {
    const { auth, headers } = await authComponent.getAuth(createAuth, ctx);
    const sessionResult = await auth.api.getSession({
      headers,
    });
    return sessionResult;
  },
});
