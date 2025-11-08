import { tool } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

// Helper function to create a generic GitHub API proxy tool with token
export function createGitHubApiProxyTool(githubToken: string | null) {
  // For public endpoints, we can use unauthenticated requests, but authenticated requests have higher rate limits
  // If no token is provided, we'll still allow requests but with lower rate limits
  const octokit = githubToken
    ? new Octokit({ auth: githubToken })
    : new Octokit();

  return tool({
    description: `Make GET requests to the GitHub REST API. This tool allows you to access any GitHub API endpoint that supports GET requests.
    
    Many endpoints work without authentication (public repositories, search endpoints, etc.), but authenticated requests have higher rate limits. Some endpoints require authentication (e.g., /user, /user/repos).
    
    Examples:
    - Get authenticated user (requires auth): endpoint="/user"
    - Get repository (public, no auth needed): endpoint="/repos/{owner}/{repo}", params={owner: "octocat", repo: "Hello-World"}
    - Get pull requests (public repos, no auth needed): endpoint="/repos/{owner}/{repo}/pulls", params={owner: "octocat", repo: "Hello-World", state: "open"}
    - Get issues (public repos, no auth needed): endpoint="/repos/{owner}/{repo}/issues", params={owner: "octocat", repo: "Hello-World"}
    - Get repository contents (public repos, no auth needed): endpoint="/repos/{owner}/{repo}/contents/{path}", params={owner: "octocat", repo: "Hello-World", path: "README.md"}
    - Search repositories (public, no auth needed): endpoint="/search/repositories", params={q: "language:python"}
    - Search code (public, no auth needed): endpoint="/search/code", params={q: "function-name repo:owner/repo"}
    
    The endpoint should be a GitHub REST API path (without the base URL). Path parameters should be included in the endpoint string using {param} syntax, and query parameters should be passed in the params object.
    
    Only GET requests are supported.`,
    inputSchema: zodSchema(
      z.object({
        endpoint: z
          .string()
          .describe(
            "The GitHub API endpoint path (e.g., '/user', '/repos/{owner}/{repo}/pulls'). Path parameters should use {param} syntax."
          ),
        params: z
          .record(z.string(), z.unknown())
          .optional()
          .describe(
            "Query parameters and path parameters as a key-value object. Path parameters will be substituted into the endpoint, query parameters will be added to the URL."
          ),
      })
    ),
    execute: async ({
      endpoint,
      params = {},
    }: {
      endpoint: string;
      params?: Record<string, unknown>;
    }) => {
      try {
        // Ensure endpoint starts with /
        const normalizedEndpoint = endpoint.startsWith("/")
          ? endpoint
          : `/${endpoint}`;

        // Extract path parameters from endpoint
        const pathParamMatches = normalizedEndpoint.matchAll(/\{(\w+)\}/g);
        const pathParams: Record<string, unknown> = {};
        const queryParams: Record<string, unknown> = {};

        // Separate path params from query params
        for (const [key, value] of Object.entries(params)) {
          if (normalizedEndpoint.includes(`{${key}}`)) {
            pathParams[key] = value;
          } else {
            queryParams[key] = value;
          }
        }

        // Replace path parameters in endpoint
        let finalEndpoint = normalizedEndpoint;
        for (const match of pathParamMatches) {
          const paramName = match[1];
          if (!paramName) continue;
          const paramValue = pathParams[paramName];
          if (paramValue === undefined) {
            throw new Error(
              `Missing required path parameter: ${paramName} for endpoint ${endpoint}`
            );
          }
          finalEndpoint = finalEndpoint.replace(
            `{${paramName}}`,
            String(paramValue)
          );
        }

        // Make the GET request using Octokit's request method
        const response = await octokit.request(`GET ${finalEndpoint}`, {
          ...queryParams,
        });

        return response.data;
      } catch (error: unknown) {
        if (typeof error === "object" && error !== null && "status" in error) {
          const status = (error as { status: unknown }).status;
          if (status === 401) {
            // Some endpoints require authentication (e.g., /user, /user/repos)
            throw new Error(
              "This GitHub API endpoint requires authentication. Please use the 'Sign in with GitHub' button in the navbar to sign in. Note: Many public endpoints (like /repos/{owner}/{repo}, /search/*) work without authentication."
            );
          }
          if (status === 404) {
            throw new Error(
              `GitHub API endpoint not found: ${endpoint}. Check that the endpoint path and parameters are correct.`
            );
          }
          if (status === 403) {
            const errorMessage =
              error instanceof Error ? error.message : "Forbidden";
            // Check if it's a rate limit issue
            if (
              "response" in error &&
              typeof (error as { response: unknown }).response === "object" &&
              (error as { response: { headers?: Record<string, string> } })
                .response?.headers?.["x-ratelimit-remaining"] === "0"
            ) {
              const response = (
                error as { response: { headers?: Record<string, string> } }
              ).response;
              const resetTime = new Date(
                parseInt(
                  response?.headers?.["x-ratelimit-reset"] || "0"
                ) * 1000
              );
              throw new Error(
                `GitHub API rate limit exceeded. Reset time: ${resetTime.toISOString()}. Signing in with GitHub provides higher rate limits.`
              );
            }
            throw new Error(
              `GitHub API access forbidden: ${errorMessage}. You may not have permission to access this resource or may have hit rate limits.`
            );
          }
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`GitHub API request failed: ${message}`);
      }
    },
  });
}

// Legacy export for backward compatibility (deprecated)
export function createGitHubApiTools(githubToken: string | null) {
  return {
    githubApi: createGitHubApiProxyTool(githubToken),
  };
}
