import { tool } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

// Helper function to create GitHub search tool with token
export function createGitHubSearchTool(githubToken: string | null) {
  // For public searches, we can use unauthenticated requests, but authenticated requests have higher rate limits
  // If no token is provided, we'll still allow searches but with lower rate limits
  const octokit = githubToken
    ? new Octokit({ auth: githubToken })
    : new Octokit();

  return tool({
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
        // Build the search query
        let searchQuery = query;
        if (repo) {
          searchQuery = `repo:${repo} ${query}`;
        }

        let result: unknown;

        // Execute the appropriate search based on type with type-specific parameters
        switch (type) {
          case "repositories": {
            const searchParams: {
              q: string;
              per_page: number;
              page: number;
              sort?: "stars" | "forks" | "help-wanted-issues" | "updated";
              order?: "asc" | "desc";
            } = {
              q: searchQuery,
              per_page: perPage,
              page: page,
            };
            if (sort) {
              searchParams.sort = sort;
              searchParams.order = order;
            }
            result = await octokit.rest.search.repos(searchParams);
            break;
          }
          case "issues": {
            const searchParams: {
              q: string;
              per_page: number;
              page: number;
            } = {
              q: searchQuery,
              per_page: perPage,
              page: page,
            };
            result = await octokit.rest.search.issuesAndPullRequests(
              searchParams
            );
            break;
          }
          case "code": {
            const searchParams: {
              q: string;
              per_page: number;
              page: number;
            } = {
              q: searchQuery,
              per_page: perPage,
              page: page,
            };
            result = await octokit.rest.search.code(searchParams);
            break;
          }
          case "users": {
            const searchParams: {
              q: string;
              per_page: number;
              page: number;
            } = {
              q: searchQuery,
              per_page: perPage,
              page: page,
            };
            result = await octokit.rest.search.users(searchParams);
            break;
          }
          case "commits": {
            const searchParams: {
              q: string;
              per_page: number;
              page: number;
            } = {
              q: searchQuery,
              per_page: perPage,
              page: page,
            };
            result = await octokit.rest.search.commits(searchParams);
            break;
          }
          case "topics": {
            // Topics search uses a different endpoint structure
            const searchParams: {
              q: string;
              per_page: number;
              page: number;
              sort?: "stars" | "forks" | "help-wanted-issues" | "updated";
              order?: "asc" | "desc";
            } = {
              q: `${searchQuery} topic:${query}`,
              per_page: perPage,
              page: page,
            };
            if (sort) {
              searchParams.sort = sort;
              searchParams.order = order;
            }
            result = await octokit.rest.search.repos(searchParams);
            break;
          }
          case "discussions":
            // Discussions require a repo parameter
            if (!repo) {
              throw new Error(
                "Discussions search requires a 'repo' parameter in format 'owner/repo-name'"
              );
            }
            const [owner, repoName] = repo.split("/");
            if (!owner || !repoName) {
              throw new Error(
                "Invalid repo format. Expected 'owner/repo-name'"
              );
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
                items: discussionsResponse.data.map(
                  (discussion: Record<string, unknown>) => ({
                    ...discussion,
                    // Add search score for consistency
                    score: 1.0,
                  })
                ),
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
          totalCount: (result as { data: { total_count: number } }).data
            .total_count,
          incompleteResults: (
            result as { data: { incomplete_results: boolean } }
          ).data.incomplete_results,
          page,
          perPage,
          hasMore:
            (result as { data: { items: unknown[] } }).data.items.length ===
            perPage,
          items: (result as { data: { items: unknown[] } }).data.items.map(
            (item: unknown) => {
              // Format items based on type
              switch (type) {
                case "repositories": {
                  const repoItem = item as {
                    id: number;
                    name: string;
                    full_name: string;
                    description: string | null;
                    html_url: string;
                    language: string | null;
                    stargazers_count: number;
                    forks_count: number;
                    open_issues_count: number;
                    created_at: string;
                    updated_at: string;
                    pushed_at: string | null;
                    owner: { login: string; type: string; avatar_url: string };
                    topics?: string[];
                    archived: boolean;
                    private: boolean;
                  };
                  return {
                    id: repoItem.id,
                    name: repoItem.name,
                    fullName: repoItem.full_name,
                    description: repoItem.description,
                    url: repoItem.html_url,
                    language: repoItem.language,
                    stars: repoItem.stargazers_count,
                    forks: repoItem.forks_count,
                    openIssues: repoItem.open_issues_count,
                    createdAt: repoItem.created_at,
                    updatedAt: repoItem.updated_at,
                    pushedAt: repoItem.pushed_at,
                    owner: {
                      login: repoItem.owner.login,
                      type: repoItem.owner.type,
                      avatarUrl: repoItem.owner.avatar_url,
                    },
                    topics: repoItem.topics || [],
                    archived: repoItem.archived,
                    private: repoItem.private,
                  };
                }
                case "issues": {
                  const issueItem = item as {
                    id: number;
                    number: number;
                    title: string;
                    body: string | null;
                    html_url: string;
                    state: string;
                    pull_request?: unknown;
                    created_at: string;
                    updated_at: string;
                    closed_at: string | null;
                    user: { login: string; avatar_url: string } | null;
                    repository_url: string;
                    labels?: Array<{ name: string; color: string }>;
                    comments: number;
                    reactions?: {
                      total_count: number;
                      "+1": number;
                      "-1": number;
                      laugh: number;
                      hooray: number;
                      confused: number;
                      heart: number;
                      rocket: number;
                      eyes: number;
                    };
                  };
                  return {
                    id: issueItem.id,
                    number: issueItem.number,
                    title: issueItem.title,
                    body: issueItem.body?.substring(0, 500), // Truncate long bodies
                    url: issueItem.html_url,
                    state: issueItem.state,
                    isPullRequest: !!issueItem.pull_request,
                    createdAt: issueItem.created_at,
                    updatedAt: issueItem.updated_at,
                    closedAt: issueItem.closed_at,
                    author: issueItem.user
                      ? {
                          login: issueItem.user.login,
                          avatarUrl: issueItem.user.avatar_url,
                        }
                      : null,
                    repository: {
                      fullName: issueItem.repository_url.split("/repos/")[1],
                    },
                    labels:
                      issueItem.labels?.map((label) => ({
                        name: label.name,
                        color: label.color,
                      })) || [],
                    comments: issueItem.comments,
                    reactions: issueItem.reactions
                      ? {
                          total: issueItem.reactions.total_count,
                          plusOne: issueItem.reactions["+1"],
                          minusOne: issueItem.reactions["-1"],
                          laugh: issueItem.reactions.laugh,
                          hooray: issueItem.reactions.hooray,
                          confused: issueItem.reactions.confused,
                          heart: issueItem.reactions.heart,
                          rocket: issueItem.reactions.rocket,
                          eyes: issueItem.reactions.eyes,
                        }
                      : null,
                  };
                }
                case "code": {
                  const codeItem = item as {
                    name: string;
                    path: string;
                    sha: string;
                    html_url: string;
                    git_url: string;
                    repository: {
                      id: number;
                      name: string;
                      full_name: string;
                      html_url: string;
                      description: string | null;
                      language: string | null;
                    };
                    score: number;
                    text_matches?: Array<{
                      fragment: string;
                      matches: unknown[];
                    }>;
                  };
                  return {
                    name: codeItem.name,
                    path: codeItem.path,
                    sha: codeItem.sha,
                    url: codeItem.html_url,
                    gitUrl: codeItem.git_url,
                    repository: {
                      id: codeItem.repository.id,
                      name: codeItem.repository.name,
                      fullName: codeItem.repository.full_name,
                      url: codeItem.repository.html_url,
                      description: codeItem.repository.description,
                      language: codeItem.repository.language,
                    },
                    score: codeItem.score,
                    textMatches: codeItem.text_matches?.map((match) => ({
                      fragment: match.fragment,
                      matches: match.matches,
                    })),
                  };
                }
                case "users": {
                  const userItem = item as {
                    id: number;
                    login: string;
                    html_url: string;
                    avatar_url: string;
                    type: string;
                    score: number;
                  };
                  return {
                    id: userItem.id,
                    login: userItem.login,
                    url: userItem.html_url,
                    avatarUrl: userItem.avatar_url,
                    type: userItem.type,
                    score: userItem.score,
                  };
                }
                case "commits": {
                  const commitItem = item as {
                    sha: string;
                    html_url: string;
                    commit: {
                      author: { name: string; email: string; date: string };
                      committer: { name: string; email: string; date: string };
                      message: string;
                    };
                    repository: {
                      id: number;
                      name: string;
                      full_name: string;
                      html_url: string;
                    };
                    score: number;
                  };
                  return {
                    sha: commitItem.sha,
                    url: commitItem.html_url,
                    author: {
                      name: commitItem.commit.author.name,
                      email: commitItem.commit.author.email,
                      date: commitItem.commit.author.date,
                    },
                    committer: {
                      name: commitItem.commit.committer.name,
                      email: commitItem.commit.committer.email,
                      date: commitItem.commit.committer.date,
                    },
                    message: commitItem.commit.message,
                    repository: {
                      id: commitItem.repository.id,
                      name: commitItem.repository.name,
                      fullName: commitItem.repository.full_name,
                      url: commitItem.repository.html_url,
                    },
                    score: commitItem.score,
                  };
                }
                case "discussions": {
                  const discussionItem = item as Record<string, unknown>;
                  return {
                    id: discussionItem.id as number,
                    number: discussionItem.number as number,
                    title: discussionItem.title as string,
                    body: (discussionItem.body as string | null)?.substring(
                      0,
                      500
                    ),
                    url: discussionItem.html_url as string,
                    state: discussionItem.state as string,
                    stateReason: discussionItem.state_reason as string | null,
                    createdAt: discussionItem.created_at as string,
                    updatedAt: discussionItem.updated_at as string,
                    author: discussionItem.user
                      ? {
                          login: (discussionItem.user as { login: string })
                            .login,
                          avatarUrl: (
                            discussionItem.user as { avatar_url: string }
                          ).avatar_url,
                        }
                      : null,
                    repository: {
                      fullName: (repo || "unknown") as string,
                    },
                    category: discussionItem.category
                      ? {
                          id: (discussionItem.category as { id: number }).id,
                          name: (discussionItem.category as { name: string })
                            .name,
                          emoji: (discussionItem.category as { emoji: string })
                            .emoji,
                          description: (
                            discussionItem.category as { description: string }
                          ).description,
                        }
                      : null,
                    answerChosenAt: discussionItem.answer_chosen_at as
                      | string
                      | null
                      | undefined,
                    answerChosenBy: discussionItem.answer_chosen_by
                      ? {
                          login: (
                            discussionItem.answer_chosen_by as { login: string }
                          ).login,
                          avatarUrl: (
                            discussionItem.answer_chosen_by as {
                              avatar_url: string;
                            }
                          ).avatar_url,
                        }
                      : null,
                    comments: discussionItem.comments as number,
                    reactions: discussionItem.reactions
                      ? {
                          total: (
                            discussionItem.reactions as { total_count: number }
                          ).total_count,
                          plusOne: (
                            discussionItem.reactions as { "+1": number }
                          )["+1"],
                          minusOne: (
                            discussionItem.reactions as {
                              "-1": number;
                            }
                          )["-1"],
                          laugh: (discussionItem.reactions as { laugh: number })
                            .laugh,
                          hooray: (
                            discussionItem.reactions as { hooray: number }
                          ).hooray,
                          confused: (
                            discussionItem.reactions as { confused: number }
                          ).confused,
                          heart: (discussionItem.reactions as { heart: number })
                            .heart,
                          rocket: (
                            discussionItem.reactions as { rocket: number }
                          ).rocket,
                          eyes: (discussionItem.reactions as { eyes: number })
                            .eyes,
                        }
                      : null,
                    locked: discussionItem.locked as boolean,
                  };
                }
                default:
                  return item;
              }
            }
          ),
        };

        return response;
      } catch (error: unknown) {
        // Handle rate limiting
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status: unknown }).status === 403 &&
          "response" in error &&
          typeof (error as { response: unknown }).response === "object" &&
          (error as { response: { headers?: Record<string, string> } }).response
            ?.headers?.["x-ratelimit-remaining"] === "0"
        ) {
          const response = (
            error as { response: { headers?: Record<string, string> } }
          ).response;
          const resetTime = new Date(
            parseInt(response?.headers?.["x-ratelimit-reset"] || "0") * 1000
          );
          throw new Error(
            `GitHub API rate limit exceeded. Reset time: ${resetTime.toISOString()}. Please wait before making more requests.`
          );
        }

        // Handle authentication errors
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status: unknown }).status === 401
        ) {
          throw new Error(
            "GitHub API authentication failed. Please sign in with GitHub to use authenticated searches."
          );
        }

        // Handle other errors
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`GitHub search failed: ${message}`);
      }
    },
  });
}
