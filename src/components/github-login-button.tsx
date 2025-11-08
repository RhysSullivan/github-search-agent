"use client";

import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function GitHubLoginButton() {
  const handleLogin = async () => {
    await authClient.signIn.social({
      provider: "github",
      callbackURL: "/", // where to land after login
      errorCallbackURL: "/", // where to land if error
      newUserCallbackURL: "/", // optional
      // disableRedirect: true,       // keep false to auto-redirect
    });
  };

  return (
    <Button onClick={handleLogin} variant="default">
      Sign in with GitHub
    </Button>
  );
}
