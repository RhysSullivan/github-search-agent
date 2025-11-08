// lib/auth.ts
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

const database = new Database("./better-auth.sqlite");

export const auth = betterAuth({
  // Minimal SQLite DB for dev. Replace with Postgres/Prisma/etc in prod.
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
export function getGitHubToken(userId: string): string | null {
  try {
    const stmt = database.prepare(
      'SELECT "accessToken" FROM "account" WHERE "userId" = ? AND "providerId" = ?'
    );
    const account = stmt.get(userId, "github") as
      | { accessToken: string }
      | undefined;
    return account?.accessToken || null;
  } catch (error) {
    console.error("Failed to get GitHub token:", error);
    return null;
  }
}
