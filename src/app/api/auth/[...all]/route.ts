// app/api/auth/[...all]/route.ts
import { nextJsHandler } from "@convex-dev/better-auth/nextjs";

export const { GET, POST } = nextJsHandler();
