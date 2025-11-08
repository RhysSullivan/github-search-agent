// lib/auth.ts
import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
  // Minimal SQLite DB for dev. Replace with Postgres/Prisma/etc in prod.
  database: new Database("./better-auth.sqlite"),
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
