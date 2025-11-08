"use client";

import { authClient } from "@/lib/auth-client";

export function GitHubLoginButton() {
  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/dashboard",      // where to land after login
      errorCallbackURL: "/login",     // where to land if error
      newUserCallbackURL: "/welcome", // optional
      // disableRedirect: true,       // keep false to auto-redirect
    });
  };

  return (
    <button onClick={handleLogin}>
      Sign in with GitHub
    </button>
  );
}

