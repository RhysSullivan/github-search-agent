// lib/auth.ts
import { fetchQuery } from "convex/nextjs";
import { api } from "../../convex/_generated/api";
import { getToken } from "./auth-server";

// Helper function to get GitHub access token for a user
// This calls the Convex query function
export async function getGitHubToken(): Promise<string | null> {
  try {
    const token = await getToken();
    return await fetchQuery(api.getGitHubToken.getGitHubToken, {}, { token });
  } catch (error) {
    console.error("Failed to get GitHub token:", error);
    return null;
  }
}
