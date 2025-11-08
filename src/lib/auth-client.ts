// lib/auth-client.ts
"use client";

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Same origin as Next backend, so baseURL can be omitted.
  // baseURL: "http://localhost:3000",
});

