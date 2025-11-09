#!/usr/bin/env bun

import { $ } from "bun";

// Only run convex deploy on production
const isProduction = process.env.VERCEL_ENV === "production";

if (isProduction) {
  console.log("Production deployment detected, running convex deploy...");
  await $`bunx convex deploy --cmd 'bun run build'`;
} else {
  console.log("Preview/development deployment detected, skipping convex deploy...");
  await $`bun run build`;
}
