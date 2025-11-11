#!/usr/bin/env bun

import { $ } from "bun";

// Only run convex deploy on production
// Check multiple Vercel environment variables to be safe
const vercelEnv = process.env.VERCEL_ENV;
const gitBranch = process.env.VERCEL_GIT_COMMIT_REF;
const isVercel = process.env.VERCEL === "1";

console.log(`VERCEL_ENV: ${vercelEnv || "not set"}`);
console.log(`VERCEL_GIT_COMMIT_REF: ${gitBranch || "not set"}`);
console.log(`VERCEL: ${isVercel ? "1" : "not set"}`);

// Explicitly check for preview - if it's preview, NEVER run convex deploy
if (vercelEnv === "preview") {
  console.log("⏭️  Preview deployment detected - skipping convex deploy");
  await $`bun run build`;
  // Exit early to ensure convex deploy never runs
  process.exit(0);
}

// Only run convex deploy if we're CERTAIN it's production
// Must be exactly "production" (not undefined, not "preview", not "development")
const isProduction = vercelEnv === "production";

if (isProduction) {
  console.log("✅ Production deployment confirmed, running convex deploy...");
  await $`bunx convex deploy --cmd 'bun run build'`;
} else {
  console.log(`⏭️  Skipping convex deploy (VERCEL_ENV=${vercelEnv || "undefined"})`);
  console.log("Running build only...");
  await $`bun run build`;
}
