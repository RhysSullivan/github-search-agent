import {
  action,
  mutation,
  internalMutation,
  internalAction,
} from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { components } from "./_generated/api";
import { internal } from "./_generated/api";
import { v } from "convex/values";

// Internal mutation to update tokens in the database
export const updateGitHubTokens = internalMutation({
  args: {
    userId: v.string(),
    accessToken: v.string(),
    accessTokenExpiresAt: v.number(),
    refreshToken: v.string(),
    refreshTokenExpiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    await ctx.runMutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: "account",
        where: [
          {
            field: "userId",
            operator: "eq",
            value: args.userId,
          },
          {
            connector: "AND",
            field: "providerId",
            operator: "eq",
            value: "github",
          },
        ],
        update: {
          accessToken: args.accessToken,
          accessTokenExpiresAt: args.accessTokenExpiresAt,
          refreshToken: args.refreshToken,
          refreshTokenExpiresAt: args.refreshTokenExpiresAt,
          updatedAt: now,
        },
      },
    });
  },
});

// Internal action to refresh GitHub token (actions can use fetch)
export const refreshGitHubTokenAction = internalAction({
  args: {
    refreshToken: v.string(),
    userId: v.string(),
  },
  handler: async (ctx, args): Promise<string | null> => {
    const clientId = process.env.GITHUB_CLIENT_ID!;
    const clientSecret = process.env.GITHUB_CLIENT_SECRET!;

    try {
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            grant_type: "refresh_token",
            refresh_token: args.refreshToken,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        console.error("Failed to refresh GitHub token:", errorText);
        return null;
      }

      const data = await response.json();

      // Update the tokens in the database
      const now = Date.now();
      const newAccessTokenExpiresAt = now + data.expires_in * 1000;
      const newRefreshTokenExpiresAt =
        now + data.refresh_token_expires_in * 1000;

      await ctx.runMutation(internal.getGitHubToken.updateGitHubTokens, {
        userId: args.userId,
        accessToken: data.access_token,
        accessTokenExpiresAt: newAccessTokenExpiresAt,
        refreshToken: data.refresh_token,
        refreshTokenExpiresAt: newRefreshTokenExpiresAt,
      });

      console.log("Successfully refreshed GitHub token for user:", args.userId);
      return data.access_token;
    } catch (error) {
      console.error("Error refreshing GitHub token:", error);
      return null;
    }
  },
});

export const getGitHubToken = action({
  args: {},
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

    if (!account) {
      return null;
    }

    const now = Date.now();
    const accessTokenExpiresAt = account.accessTokenExpiresAt || 0;

    // Check if token is expired or will expire in the next 5 minutes
    const isExpired = accessTokenExpiresAt < now + 5 * 60 * 1000;

    if (!isExpired && account.accessToken) {
      return account.accessToken;
    }

    // Token is expired or about to expire, try to refresh it
    if (!account.refreshToken) {
      console.error("No refresh token available for user:", sessionUserId);
      // Return the existing token even if it might be expired
      // GitHub tokens typically don't expire unless explicitly revoked
      return account.accessToken || null;
    }

    const refreshedToken = await ctx.runAction(
      internal.getGitHubToken.refreshGitHubTokenAction,
      {
        refreshToken: account.refreshToken,
        userId: sessionUserId,
      }
    );

    if (!refreshedToken) {
      console.error("Failed to refresh GitHub token for user:", sessionUserId);
      // Return the existing token as a fallback
      return account.accessToken || null;
    }

    return refreshedToken;
  },
});
