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

// Helper function to get user ID for rate limiting
export async function getUserId(): Promise<string | null> {
  try {
    const token = await getToken();
    return await fetchQuery(api.getUserId.getUserId, {}, { token });
  } catch (error) {
    console.error("Failed to get user ID:", error);
    return null;
  }
}
