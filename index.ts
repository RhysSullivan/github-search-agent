import { Octokit } from "@octokit/rest";
import { stepCountIs, streamText, tool, zodSchema } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { z } from "zod";

// Initialize Octokit with GitHub token
const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN,
});

// GitHub search tool with comprehensive search capabilities
const githubSearchTool = tool({
  description: `Powerful GitHub search tool that can search across repositories, issues, pull requests, code, users, organizations, commits, topics, and discussions. 
  
IMPORTANT SEARCH STRATEGY:
1. When searching for a package/library, FIRST find the repository:
   - Search for the package name as a repository (e.g., "convex-test")
   - Try searching with organization qualifier (e.g., "org:get-convex convex-test")
   - Look for the official repository in the results
2. Once you find the repository, search WITHIN it:
   - Use the 'repo' parameter to scope searches (e.g., repo:get-convex/convex-test)
   - Search for code using 'code' type within the repository
   - Search for issues/PRs within the repository
3. Use code search to find actual implementations:
   - Search for function names, class names, or API methods in code
   - Use 'code' type with repo parameter for best results

Supports filtering by:
- Repository: Use 'repo' parameter (e.g., 'owner/repo-name')
- Organization: Use 'org:org-name' in query (e.g., 'org:get-convex')
- Search type: repositories, issues, code, users, commits, topics, discussions
- Advanced qualifiers: language, stars, forks, created date, updated date, etc.
- Issue/PR filters: state (open/closed), author, assignee, labels, etc.
- Code search: Use 'code' type to search within file contents

The tool automatically handles pagination and returns comprehensive results.`,
  inputSchema: zodSchema(
    z.object({
      query: z
        .string()
        .describe(
          "The search query string. Can include GitHub search qualifiers like 'language:python', 'stars:>100', 'is:issue', 'repo:owner/name', etc."
        ),
      type: z
        .enum([
          "repositories",
          "issues",
          "code",
          "users",
          "commits",
          "topics",
          "discussions",
        ])
        .default("repositories")
        .describe(
          "The type of GitHub resource to search for. 'issues' includes both issues and pull requests. 'discussions' requires a 'repo' parameter."
        ),
      repo: z
        .string()
        .optional()
        .describe(
          "Optional: Filter search to a specific repository in format 'owner/repo-name'. If provided, this will be prepended to the query."
        ),
      perPage: z
        .number()
        .min(1)
        .max(100)
        .default(30)
        .describe("Number of results per page (1-100, default: 30)"),
      page: z
        .number()
        .min(1)
        .default(1)
        .describe("Page number for pagination (default: 1)"),
      sort: z
        .enum(["stars", "forks", "help-wanted-issues", "updated"])
        .optional()
        .describe(
          "Sort order for repository searches (only applies to repository searches)"
        ),
      order: z
        .enum(["asc", "desc"])
        .default("desc")
        .describe("Sort order direction (ascending or descending)"),
    })
  ),
  execute: async ({
    query,
    type,
    repo,
    perPage,
    page,
    sort,
    order,
  }: {
    query: string;
    type:
      | "repositories"
      | "issues"
      | "code"
      | "users"
      | "commits"
      | "topics"
      | "discussions";
    repo?: string;
    perPage: number;
    page: number;
    sort?: "stars" | "forks" | "help-wanted-issues" | "updated";
    order: "asc" | "desc";
  }) => {
    try {
      // Validate GitHub token
      if (!process.env.GITHUB_TOKEN) {
        throw new Error(
          "GITHUB_TOKEN environment variable is not set. Please set it with your GitHub Personal Access Token."
        );
      }

      // Build the search query
      let searchQuery = query;
      if (repo) {
        searchQuery = `repo:${repo} ${query}`;
      }

      const searchParams: any = {
        q: searchQuery,
        per_page: perPage,
        page: page,
      };

      // Add sort and order for repository searches
      if (type === "repositories" && sort) {
        searchParams.sort = sort;
        searchParams.order = order;
      }

      let result: any;

      // Execute the appropriate search based on type
      switch (type) {
        case "repositories":
          result = await octokit.rest.search.repos(searchParams);
          break;
        case "issues":
          result = await octokit.rest.search.issuesAndPullRequests(
            searchParams
          );
          break;
        case "code":
          result = await octokit.rest.search.code(searchParams);
          break;
        case "users":
          result = await octokit.rest.search.users(searchParams);
          break;
        case "commits":
          result = await octokit.rest.search.commits(searchParams);
          break;
        case "topics":
          // Topics search uses a different endpoint structure
          result = await octokit.rest.search.repos({
            ...searchParams,
            q: `${searchQuery} topic:${query}`,
          });
          break;
        case "discussions":
          // Discussions require a repo parameter
          if (!repo) {
            throw new Error(
              "Discussions search requires a 'repo' parameter in format 'owner/repo-name'"
            );
          }
          const [owner, repoName] = repo.split("/");
          if (!owner || !repoName) {
            throw new Error("Invalid repo format. Expected 'owner/repo-name'");
          }
          // List discussions for the repository using the REST API
          const discussionsResponse = await octokit.request(
            "GET /repos/{owner}/{repo}/discussions",
            {
              owner,
              repo: repoName,
              per_page: perPage,
              page: page,
            }
          );
          // Transform the result to match our format
          result = {
            data: {
              total_count: discussionsResponse.data.length,
              incomplete_results: false,
              items: discussionsResponse.data.map((discussion: any) => ({
                ...discussion,
                // Add search score for consistency
                score: 1.0,
              })),
            },
          };
          break;
        default:
          throw new Error(`Unsupported search type: ${type}`);
      }

      // Format the response with metadata
      const response = {
        type,
        query: searchQuery,
        totalCount: result.data.total_count,
        incompleteResults: result.data.incomplete_results,
        page,
        perPage,
        hasMore: result.data.items.length === perPage,
        items: result.data.items.map((item: any) => {
          // Format items based on type
          switch (type) {
            case "repositories":
              return {
                id: item.id,
                name: item.name,
                fullName: item.full_name,
                description: item.description,
                url: item.html_url,
                language: item.language,
                stars: item.stargazers_count,
                forks: item.forks_count,
                openIssues: item.open_issues_count,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                pushedAt: item.pushed_at,
                owner: {
                  login: item.owner.login,
                  type: item.owner.type,
                  avatarUrl: item.owner.avatar_url,
                },
                topics: item.topics || [],
                archived: item.archived,
                private: item.private,
              };
            case "issues":
              return {
                id: item.id,
                number: item.number,
                title: item.title,
                body: item.body?.substring(0, 500), // Truncate long bodies
                url: item.html_url,
                state: item.state,
                isPullRequest: !!item.pull_request,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                closedAt: item.closed_at,
                author: {
                  login: item.user.login,
                  avatarUrl: item.user.avatar_url,
                },
                repository: {
                  fullName: item.repository_url.split("/repos/")[1],
                },
                labels: item.labels.map((label: any) => ({
                  name: label.name,
                  color: label.color,
                })),
                comments: item.comments,
                reactions: item.reactions
                  ? {
                      total: item.reactions.total_count,
                      plusOne: item.reactions["+1"],
                      minusOne: item.reactions["-1"],
                      laugh: item.reactions.laugh,
                      hooray: item.reactions.hooray,
                      confused: item.reactions.confused,
                      heart: item.reactions.heart,
                      rocket: item.reactions.rocket,
                      eyes: item.reactions.eyes,
                    }
                  : null,
              };
            case "code":
              return {
                name: item.name,
                path: item.path,
                sha: item.sha,
                url: item.html_url,
                gitUrl: item.git_url,
                repository: {
                  id: item.repository.id,
                  name: item.repository.name,
                  fullName: item.repository.full_name,
                  url: item.repository.html_url,
                  description: item.repository.description,
                  language: item.repository.language,
                },
                score: item.score,
                textMatches: item.text_matches?.map((match: any) => ({
                  fragment: match.fragment,
                  matches: match.matches,
                })),
              };
            case "users":
              return {
                id: item.id,
                login: item.login,
                url: item.html_url,
                avatarUrl: item.avatar_url,
                type: item.type,
                score: item.score,
              };
            case "commits":
              return {
                sha: item.sha,
                url: item.html_url,
                author: {
                  name: item.commit.author.name,
                  email: item.commit.author.email,
                  date: item.commit.author.date,
                },
                committer: {
                  name: item.commit.committer.name,
                  email: item.commit.committer.email,
                  date: item.commit.committer.date,
                },
                message: item.commit.message,
                repository: {
                  id: item.repository.id,
                  name: item.repository.name,
                  fullName: item.repository.full_name,
                  url: item.repository.html_url,
                },
                score: item.score,
              };
            case "discussions":
              return {
                id: item.id,
                number: item.number,
                title: item.title,
                body: item.body?.substring(0, 500), // Truncate long bodies
                url: item.html_url,
                state: item.state,
                stateReason: item.state_reason,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                author: {
                  login: item.user.login,
                  avatarUrl: item.user.avatar_url,
                },
                repository: {
                  fullName: repo || "unknown",
                },
                category: {
                  id: item.category.id,
                  name: item.category.name,
                  emoji: item.category.emoji,
                  description: item.category.description,
                },
                answerChosenAt: item.answer_chosen_at,
                answerChosenBy: item.answer_chosen_by
                  ? {
                      login: item.answer_chosen_by.login,
                      avatarUrl: item.answer_chosen_by.avatar_url,
                    }
                  : null,
                comments: item.comments,
                reactions: item.reactions
                  ? {
                      total: item.reactions.total_count,
                      plusOne: item.reactions["+1"],
                      minusOne: item.reactions["-1"],
                      laugh: item.reactions.laugh,
                      hooray: item.reactions.hooray,
                      confused: item.reactions.confused,
                      heart: item.reactions.heart,
                      rocket: item.reactions.rocket,
                      eyes: item.reactions.eyes,
                    }
                  : null,
                locked: item.locked,
              };
            default:
              return item;
          }
        }),
      };

      return response;
    } catch (error: any) {
      // Handle rate limiting
      if (
        error.status === 403 &&
        error.response?.headers["x-ratelimit-remaining"] === "0"
      ) {
        const resetTime = new Date(
          parseInt(error.response.headers["x-ratelimit-reset"]) * 1000
        );
        throw new Error(
          `GitHub API rate limit exceeded. Reset time: ${resetTime.toISOString()}. Please wait before making more requests.`
        );
      }

      // Handle authentication errors
      if (error.status === 401) {
        throw new Error(
          "GitHub API authentication failed. Please check that your GITHUB_TOKEN is valid and has the necessary permissions."
        );
      }

      // Handle other errors
      throw new Error(
        `GitHub search failed: ${error.message || "Unknown error"}`
      );
    }
  },
});

// Main agent function
async function generateResponse(userQuery: string) {
  try {
    const systemPrompt = `You are a GitHub search expert. Your goal is to help users find information on GitHub.

SEARCH STRATEGY:
1. When a user asks about a package/library, FIRST locate the repository:
   - Search repositories for the package name (e.g., "convex-test")
   - Try with organization qualifiers (e.g., "org:get-convex convex-test" or "convex-test org:get-convex")
   - Common organizations: get-convex, facebook, google, microsoft, etc.
   - Look for the official/main repository in results

2. Once you find the repository (owner/repo-name), search WITHIN it comprehensively:
   - Use code search: type="code", repo="owner/repo-name", query="function-name or class-name"
   - Search issues/PRs: type="issues", repo="owner/repo-name", query="your search terms"
   - Search for related packages/repos mentioned (e.g., if user mentions "convex/browse", also search that repo)
   - This is much more effective than searching globally

3. For finding implementations and discussions:
   - Use code search (type="code") to find actual source code
   - Search issues (type="issues") to find discussions, feature requests, or bug reports
   - Search for function names, method names, API names
   - Try variations: camelCase, snake_case, kebab-case
   - Use the repo parameter to scope to the specific repository

4. If initial searches don't find results:
   - Try variations of the search term (different naming conventions)
   - Search issues/PRs - often missing features are discussed there
   - Try searching the related/main repository (e.g., if convex-test is missing something, check the main convex repo)
   - Try broader searches first, then narrow down

5. Always search both code AND issues when looking for functionality - issues often contain discussions about missing features or workarounds.

Always be thorough and search systematically. Don't give up after one or two searches - explore the repository structure, codebase, and issues.`;

    const result = await streamText({
      model: gateway("openai/gpt-4o-mini"),
      system: systemPrompt,
      prompt: userQuery,
      tools: {
        githubSearch: githubSearchTool,
      },
      stopWhen: stepCountIs(15),
      onError: (error) => {
        console.error("Stream error:", error);
      },
    });

    // Stream the response as it comes in
    // Use fullStream to get all stream events including tool calls
    for await (const chunk of result.fullStream) {
      if (chunk.type === "text-delta") {
        process.stdout.write(chunk.text);
      } else if (chunk.type === "tool-call") {
        process.stdout.write(`\n[Calling tool: ${chunk.toolName}]\n`);
        if ("input" in chunk && chunk.input) {
          process.stdout.write(
            `[Tool args: ${JSON.stringify(chunk.input, null, 2)}]\n`
          );
        }
      } else if (chunk.type === "tool-result") {
        process.stdout.write(`\n[Tool result received]\n`);
        if ("output" in chunk && chunk.output) {
          const resultStr =
            typeof chunk.output === "string"
              ? chunk.output
              : JSON.stringify(chunk.output, null, 2);
          process.stdout.write(`[Result: ${resultStr.substring(0, 200)}...]\n`);
        }
      } else if (chunk.type === "error") {
        process.stdout.write(`\n[Error: ${chunk.error}]\n`);
      }
    }
  } catch (error: any) {
    console.error("Error generating response:", error.message);
    console.error(error);
    process.exit(1);
  }
}

// Example usage
// Check if running directly (Bun sets import.meta.main when file is executed directly)
if (import.meta.main || Bun.main === import.meta.url) {
  const query =
    process.argv[2] ||
    `
  "I am using convexTest from the package 'convex-test'
The normal convex client from convex/browse has an onUpdate
function but the test client is missing this
Anything I can do to get that onUpdate function in the test client?"
Search GitHub to answer the question.
`;
  console.log(`Searching for: ${query}\n`);

  try {
    console.log("Starting generateResponse...");
    await generateResponse(query);
    console.log("\nCompleted.");
  } catch (error: any) {
    console.error("Fatal error:", error.message);
    console.error(error);
    process.exit(1);
  }
} else {
  console.log(
    "Not running as main module. import.meta.main =",
    import.meta.main
  );
}
