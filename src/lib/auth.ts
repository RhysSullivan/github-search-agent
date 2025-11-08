// lib/auth.ts
import { betterAuth } from "better-auth";
import { Pool } from "pg";

const database = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const auth = betterAuth({
  database,
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      scope: ["read:user", "repo", "user:email"],
    },
  },
});

// Helper function to get GitHub access token for a user
export async function getGitHubToken(userId: string): Promise<string | null> {
  try {
    const result = await database.query<{ accessToken: string }>(
      'SELECT "accessToken" FROM "account" WHERE "userId" = $1 AND "providerId" = $2',
      [userId, "github"]
    );
    return result.rows[0]?.accessToken || null;
  } catch (error) {
    console.error("Failed to get GitHub token:", error);
    return null;
  }
}
