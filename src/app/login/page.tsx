// app/login/page.tsx
import { GitHubLoginButton } from "@/components/github-login-button";

export default function LoginPage() {
  return (
    <main>
      <h1>Login</h1>
      <GitHubLoginButton />
    </main>
  );
}

