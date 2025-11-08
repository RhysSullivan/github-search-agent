// app/dashboard/page.tsx
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { LogoutButton } from "@/components/logout-button";

export default async function DashboardPage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    // Basic redirect when not logged in
    return (
      <main>
        <p>Not authenticated. Please sign in using the button in the navbar.</p>
      </main>
    );
  }

  return (
    <main>
      <h1>Dashboard</h1>
      <p>Signed in as {session.user.email}</p>
      <LogoutButton />
    </main>
  );
}
