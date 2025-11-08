"use client";

import { authClient } from "@/lib/auth-client";

export function CurrentUser() {
  const { data: session, isPending } = authClient.useSession();

  if (isPending) return <p>Loading...</p>;
  if (!session) return <p>Not signed in</p>;

  return <p>{session.user.email}</p>;
}



