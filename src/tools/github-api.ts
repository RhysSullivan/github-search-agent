import { tool } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";
import { Octokit } from "@octokit/rest";

// Helper function to get authenticated user
async function getAuthenticatedUser(octokit: Octokit) {
  const { data } = await octokit.rest.users.getAuthenticated();
  return data.login;
}

// Helper function to get PR checks/status
async function getPRChecksStatus(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number
) {
  try {
    // Get the PR to find the head SHA
    const { data: pr } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    const headSha = pr.head.sha;

    // Get check runs for the PR
    const { data: checkRuns } = await octokit.rest.checks.listForRef({
      owner,
      repo,
      ref: headSha,
    });

    // Get status checks (combined status)
    let combinedStatus = null;
    try {
      const { data: status } = await octokit.rest.repos.getCombinedStatusForRef(
        {
          owner,
          repo,
          ref: headSha,
        }
      );
      combinedStatus = status;
    } catch (error) {
      // Status API might not be available, that's okay
    }

    return {
      checkRuns: checkRuns.check_runs.map((run) => ({
        name: run.name,
        status: run.status,
        conclusion: run.conclusion,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        htmlUrl: run.html_url || "",
      })),
      combinedStatus: combinedStatus
        ? {
            state: combinedStatus.state,
            totalCount: combinedStatus.total_count,
            statuses: combinedStatus.statuses.map((s) => ({
              state: s.state,
              context: s.context,
              description: s.description,
              targetUrl: s.target_url,
            })),
          }
        : null,
    };
  } catch (error: unknown) {
    // If we can't get checks, return null
    return null;
  }
}

// Helper function to create getGitHubUser tool with token
export function createGetGitHubUserTool(githubToken: string | null) {
  if (!githubToken) {
    return tool({
      description:
        "Get information about the authenticated GitHub user. Returns the user's login, name, email, and other profile information.",
      inputSchema: zodSchema(z.object({})),
      execute: async () => {
        return {
          error: "authentication_required",
          message:
            "This tool requires GitHub authentication. Please ask the user to use the 'Sign in with GitHub' button in the navbar to sign in.",
        };
      },
    });
  }

  const octokit = new Octokit({
    auth: githubToken,
  });

  return tool({
    description:
      "Get information about the authenticated GitHub user. Returns the user's login, name, email, and other profile information.",
    inputSchema: zodSchema(z.object({})),
    execute: async () => {
      try {
        const { data } = await octokit.rest.users.getAuthenticated();
        return {
          login: data.login,
          name: data.name,
          email: data.email,
          bio: data.bio,
          company: data.company,
          blog: data.blog,
          location: data.location,
          avatarUrl: data.avatar_url,
          htmlUrl: data.html_url,
          publicRepos: data.public_repos,
          followers: data.followers,
          following: data.following,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
        };
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status: unknown }).status === 401
        ) {
          throw new Error(
            "GitHub API authentication failed. Please check that your GitHub token is valid."
          );
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to get user info: ${message}`);
      }
    },
  });
}

// Helper function to create getUserPullRequests tool with token
export function createGetUserPullRequestsTool(githubToken: string | null) {
  if (!githubToken) {
    return tool({
      description: `Get pull requests created by the authenticated user. Can filter by state (open, closed, all), repository, and check CI status.
    
    Use this tool when users ask about:
    - "What are my PRs?"
    - "Show me my open PRs"
    - "What PRs do I have with CI failures?"
    - "My PRs in repository X"
    
    The tool can check CI status for each PR to identify failures.`,
      inputSchema: zodSchema(
        z.object({
          state: z
            .enum(["open", "closed", "all"])
            .default("open")
            .describe("Filter PRs by state: open, closed, or all"),
          repo: z
            .string()
            .optional()
            .describe(
              "Optional: Filter to a specific repository in format 'owner/repo-name'"
            ),
          includeCIStatus: z
            .boolean()
            .default(false)
            .describe(
              "Whether to check CI status for each PR (slower but provides CI failure information)"
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
        })
      ),
      execute: async () => {
        return {
          error: "authentication_required",
          message:
            "This tool requires GitHub authentication. Please ask the user to use the 'Sign in with GitHub' button in the navbar to sign in.",
        };
      },
    });
  }

  const octokit = new Octokit({
    auth: githubToken,
  });

  return tool({
    description: `Get pull requests created by the authenticated user. Can filter by state (open, closed, all), repository, and check CI status.
    
    Use this tool when users ask about:
    - "What are my PRs?"
    - "Show me my open PRs"
    - "What PRs do I have with CI failures?"
    - "My PRs in repository X"
    
    The tool can check CI status for each PR to identify failures.`,
    inputSchema: zodSchema(
      z.object({
        state: z
          .enum(["open", "closed", "all"])
          .default("open")
          .describe("Filter PRs by state: open, closed, or all"),
        repo: z
          .string()
          .optional()
          .describe(
            "Optional: Filter to a specific repository in format 'owner/repo-name'"
          ),
        includeCIStatus: z
          .boolean()
          .default(false)
          .describe(
            "Whether to check CI status for each PR (slower but provides CI failure information)"
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
      })
    ),
    execute: async ({
      state,
      repo,
      includeCIStatus,
      perPage,
      page,
    }: {
      state: "open" | "closed" | "all";
      repo?: string;
      includeCIStatus: boolean;
      perPage: number;
      page: number;
    }) => {
      try {
        const username = await getAuthenticatedUser(octokit);

        // Build search query
        let query = `is:pr author:${username}`;
        if (state !== "all") {
          query += ` state:${state}`;
        }
        if (repo) {
          query += ` repo:${repo}`;
        }

        const { data } = await octokit.rest.search.issuesAndPullRequests({
          q: query,
          per_page: perPage,
          page: page,
        });

        const prs = await Promise.all(
          data.items.map(async (item) => {
            if (!item.pull_request) {
              return null; // Skip if it's not actually a PR
            }

            // Extract repo info from repository_url
            const repoMatch = item.repository_url.match(/\/repos\/(.+)$/);
            const repoFullName = repoMatch?.[1] ?? "unknown/unknown";
            const [owner, repoName] = repoFullName.split("/");

            // Skip if we can't parse owner/repo
            if (!owner || !repoName) {
              return null;
            }

            // Get full PR details
            let prDetails: {
              number: number;
              title: string;
              body: string | null | undefined;
              state: string;
              merged: boolean | null;
              mergeable: boolean | null;
              mergeableState: string | null;
              draft: boolean;
              head: { ref: string; sha: string };
              base: { ref: string; sha: string };
              additions: number | null;
              deletions: number | null;
              changedFiles: number;
              commits: number;
              reviewComments: number;
              maintainerCanModify: boolean | null;
            } | null = null;
            let ciStatus: {
              checkRuns: Array<{
                name: string;
                status: string | null;
                conclusion: string | null;
                startedAt: string | null;
                completedAt: string | null;
                htmlUrl: string;
              }>;
              combinedStatus: {
                state: string;
                totalCount: number;
                statuses: Array<{
                  state: string;
                  context: string;
                  description: string | null;
                  targetUrl: string | null;
                }>;
              } | null;
            } | null = null;

            try {
              const { data: prData } = await octokit.rest.pulls.get({
                owner,
                repo: repoName,
                pull_number: item.number,
              });

              prDetails = {
                number: prData.number,
                title: prData.title,
                body: prData.body?.substring(0, 500),
                state: prData.state,
                merged: prData.merged,
                mergeable: prData.mergeable,
                mergeableState: prData.mergeable_state,
                draft: prData.draft ?? false,
                head: {
                  ref: prData.head.ref,
                  sha: prData.head.sha.substring(0, 7),
                },
                base: {
                  ref: prData.base.ref,
                  sha: prData.base.sha.substring(0, 7),
                },
                additions: prData.additions,
                deletions: prData.deletions,
                changedFiles: prData.changed_files,
                commits: prData.commits,
                reviewComments: prData.review_comments,
                maintainerCanModify: prData.maintainer_can_modify,
              };

              // Get CI status if requested
              if (includeCIStatus) {
                ciStatus = await getPRChecksStatus(
                  octokit,
                  owner,
                  repoName,
                  item.number
                );
              }
            } catch (error) {
              // If we can't get PR details, continue with basic info
            }

            return {
              id: item.id,
              number: item.number,
              title: item.title,
              body: item.body?.substring(0, 500),
              url: item.html_url,
              state: item.state,
              createdAt: item.created_at,
              updatedAt: item.updated_at,
              closedAt: item.closed_at,
              repository: {
                fullName: repoFullName,
                url: `https://github.com/${repoFullName}`,
              },
              author: item.user
                ? {
                    login: item.user.login,
                    avatarUrl: item.user.avatar_url,
                  }
                : null,
              labels: item.labels.map((label) => ({
                name: label.name,
                color: label.color,
              })),
              comments: item.comments,
              ...(prDetails && { details: prDetails }),
              ...(ciStatus && { ciStatus }),
            };
          })
        );

        // Filter out nulls
        const validPRs = prs.filter((pr) => pr !== null);

        return {
          totalCount: data.total_count,
          prs: validPRs,
          page,
          perPage,
          hasMore: validPRs.length === perPage,
        };
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status: unknown }).status === 401
        ) {
          throw new Error(
            "GitHub API authentication failed. Please check that your GitHub token is valid."
          );
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to get pull requests: ${message}`);
      }
    },
  });
}

// Helper function to create getPullRequestDetails tool with token
export function createGetPullRequestDetailsTool(githubToken: string | null) {
  if (!githubToken) {
    return tool({
      description: `Get detailed information about a specific pull request, including CI status, checks, and merge status.
    
    Use this tool when users ask about:
    - "What's the status of PR #123?"
    - "Is PR #456 passing CI?"
    - "Show me details about PR #789"`,
      inputSchema: zodSchema(
        z.object({
          owner: z
            .string()
            .describe("Repository owner (username or organization)"),
          repo: z.string().describe("Repository name"),
          pullNumber: z.number().describe("Pull request number"),
          includeCIStatus: z
            .boolean()
            .default(true)
            .describe("Whether to include CI status and checks"),
        })
      ),
      execute: async () => {
        return {
          error: "authentication_required",
          message:
            "This tool requires GitHub authentication. Please ask the user to use the 'Sign in with GitHub' button in the navbar to sign in.",
        };
      },
    });
  }

  const octokit = new Octokit({
    auth: githubToken,
  });

  return tool({
    description: `Get detailed information about a specific pull request, including CI status, checks, and merge status.
    
    Use this tool when users ask about:
    - "What's the status of PR #123?"
    - "Is PR #456 passing CI?"
    - "Show me details about PR #789"`,
    inputSchema: zodSchema(
      z.object({
        owner: z
          .string()
          .describe("Repository owner (username or organization)"),
        repo: z.string().describe("Repository name"),
        pullNumber: z.number().describe("Pull request number"),
        includeCIStatus: z
          .boolean()
          .default(true)
          .describe("Whether to include CI status and checks"),
      })
    ),
    execute: async ({
      owner,
      repo,
      pullNumber,
      includeCIStatus,
    }: {
      owner: string;
      repo: string;
      pullNumber: number;
      includeCIStatus: boolean;
    }) => {
      try {
        const { data: pr } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pullNumber,
        });

        // Get reviews
        const { data: reviews } = await octokit.rest.pulls.listReviews({
          owner,
          repo,
          pull_number: pullNumber,
        });

        // Get CI status if requested
        let ciStatus: {
          checkRuns: Array<{
            name: string;
            status: string | null;
            conclusion: string | null;
            startedAt: string | null;
            completedAt: string | null;
            htmlUrl: string;
          }>;
          combinedStatus: {
            state: string;
            totalCount: number;
            statuses: Array<{
              state: string;
              context: string;
              description: string | null;
              targetUrl: string | null;
            }>;
          } | null;
        } | null = null;
        if (includeCIStatus) {
          ciStatus = await getPRChecksStatus(octokit, owner, repo, pullNumber);
        }

        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          url: pr.html_url,
          state: pr.state,
          merged: pr.merged,
          mergeable: pr.mergeable,
          mergeableState: pr.mergeable_state,
          draft: pr.draft,
          author: {
            login: pr.user.login,
            avatarUrl: pr.user.avatar_url,
          },
          head: {
            ref: pr.head.ref,
            sha: pr.head.sha,
            repo: {
              fullName: pr.head.repo?.full_name,
              url: pr.head.repo?.html_url,
            },
          },
          base: {
            ref: pr.base.ref,
            sha: pr.base.sha,
            repo: {
              fullName: pr.base.repo.full_name,
              url: pr.base.repo.html_url,
            },
          },
          additions: pr.additions,
          deletions: pr.deletions,
          changedFiles: pr.changed_files,
          commits: pr.commits,
          reviewComments: pr.review_comments,
          maintainerCanModify: pr.maintainer_can_modify,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
          closedAt: pr.closed_at,
          mergedAt: pr.merged_at,
          repository: {
            fullName: `${owner}/${repo}`,
            url: `https://github.com/${owner}/${repo}`,
          },
          reviews: reviews
            .filter((review) => review.user !== null)
            .map((review) => ({
              id: review.id,
              user: {
                login: review.user!.login,
                avatarUrl: review.user!.avatar_url,
              },
              body: review.body,
              state: review.state,
              submittedAt: review.submitted_at,
            })),
          ...(ciStatus && { ciStatus }),
        };
      } catch (error: unknown) {
        if (typeof error === "object" && error !== null && "status" in error) {
          const status = (error as { status: unknown }).status;
          if (status === 404) {
            throw new Error(
              `Pull request #${pullNumber} not found in ${owner}/${repo}`
            );
          }
          if (status === 401) {
            throw new Error(
              "GitHub API authentication failed. Please check that your GitHub token is valid."
            );
          }
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to get PR details: ${message}`);
      }
    },
  });
}

// Helper function to create getUserIssues tool with token
export function createGetUserIssuesTool(githubToken: string | null) {
  if (!githubToken) {
    return tool({
      description: `Get issues created by the authenticated user. Can filter by state (open, closed, all) and repository.
    
    Use this tool when users ask about:
    - "What are my issues?"
    - "Show me my open issues"
    - "My issues in repository X"`,
      inputSchema: zodSchema(
        z.object({
          state: z
            .enum(["open", "closed", "all"])
            .default("open")
            .describe("Filter issues by state: open, closed, or all"),
          repo: z
            .string()
            .optional()
            .describe(
              "Optional: Filter to a specific repository in format 'owner/repo-name'"
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
        })
      ),
      execute: async () => {
        return {
          error: "authentication_required",
          message:
            "This tool requires GitHub authentication. Please ask the user to use the 'Sign in with GitHub' button in the navbar to sign in.",
        };
      },
    });
  }

  const octokit = new Octokit({
    auth: githubToken,
  });

  return tool({
    description: `Get issues created by the authenticated user. Can filter by state (open, closed, all) and repository.
    
    Use this tool when users ask about:
    - "What are my issues?"
    - "Show me my open issues"
    - "My issues in repository X"`,
    inputSchema: zodSchema(
      z.object({
        state: z
          .enum(["open", "closed", "all"])
          .default("open")
          .describe("Filter issues by state: open, closed, or all"),
        repo: z
          .string()
          .optional()
          .describe(
            "Optional: Filter to a specific repository in format 'owner/repo-name'"
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
      })
    ),
    execute: async ({
      state,
      repo,
      perPage,
      page,
    }: {
      state: "open" | "closed" | "all";
      repo?: string;
      perPage: number;
      page: number;
    }) => {
      try {
        const username = await getAuthenticatedUser(octokit);

        // Build search query (exclude PRs)
        let query = `is:issue author:${username}`;
        if (state !== "all") {
          query += ` state:${state}`;
        }
        if (repo) {
          query += ` repo:${repo}`;
        }

        const { data } = await octokit.rest.search.issuesAndPullRequests({
          q: query,
          per_page: perPage,
          page: page,
        });

        const issues = data.items.map((item) => {
          const repoMatch = item.repository_url.match(/\/repos\/(.+)$/);
          const repoFullName = repoMatch ? repoMatch[1] : "unknown/unknown";

          return {
            id: item.id,
            number: item.number,
            title: item.title,
            body: item.body?.substring(0, 500),
            url: item.html_url,
            state: item.state,
            createdAt: item.created_at,
            updatedAt: item.updated_at,
            closedAt: item.closed_at,
            repository: {
              fullName: repoFullName,
              url: `https://github.com/${repoFullName}`,
            },
            author: item.user
              ? {
                  login: item.user.login,
                  avatarUrl: item.user.avatar_url,
                }
              : null,
            labels: item.labels.map((label) => ({
              name: label.name,
              color: label.color,
            })),
            comments: item.comments,
          };
        });

        return {
          totalCount: data.total_count,
          issues,
          page,
          perPage,
          hasMore: issues.length === perPage,
        };
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status: unknown }).status === 401
        ) {
          throw new Error(
            "GitHub API authentication failed. Please check that your GitHub token is valid."
          );
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to get issues: ${message}`);
      }
    },
  });
}

// Helper function to create getUserRepositories tool with token
export function createGetUserRepositoriesTool(githubToken: string | null) {
  if (!githubToken) {
    return tool({
      description: `Get repositories owned by or contributed to by the authenticated user.
    
    Use this tool when users ask about:
    - "What are my repositories?"
    - "Show me my repos"
    - "What repos do I own?"`,
      inputSchema: zodSchema(
        z.object({
          type: z
            .enum(["all", "owner", "member"])
            .default("all")
            .describe(
              "Filter by repository type: all, owner (repos user owns), or member (repos user is a member of)"
            ),
          sort: z
            .enum(["created", "updated", "pushed", "full_name"])
            .default("updated")
            .describe("Sort order for repositories"),
          direction: z
            .enum(["asc", "desc"])
            .default("desc")
            .describe("Sort direction"),
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
        })
      ),
      execute: async () => {
        return {
          error: "authentication_required",
          message:
            "This tool requires GitHub authentication. Please ask the user to use the 'Sign in with GitHub' button in the navbar to sign in.",
        };
      },
    });
  }

  const octokit = new Octokit({
    auth: githubToken,
  });

  return tool({
    description: `Get repositories owned by or contributed to by the authenticated user.
    
    Use this tool when users ask about:
    - "What are my repositories?"
    - "Show me my repos"
    - "What repos do I own?"`,
    inputSchema: zodSchema(
      z.object({
        type: z
          .enum(["all", "owner", "member"])
          .default("all")
          .describe(
            "Filter by repository type: all, owner (repos user owns), or member (repos user is a member of)"
          ),
        sort: z
          .enum(["created", "updated", "pushed", "full_name"])
          .default("updated")
          .describe("Sort order for repositories"),
        direction: z
          .enum(["asc", "desc"])
          .default("desc")
          .describe("Sort direction"),
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
      })
    ),
    execute: async ({
      type,
      sort,
      direction,
      perPage,
      page,
    }: {
      type: "all" | "owner" | "member";
      sort: "created" | "updated" | "pushed" | "full_name";
      direction: "asc" | "desc";
      perPage: number;
      page: number;
    }) => {
      try {
        const { data } = await octokit.rest.repos.listForAuthenticatedUser({
          type,
          sort,
          direction,
          per_page: perPage,
          page: page,
        });

        const repos = data.map((repo) => ({
          id: repo.id,
          name: repo.name,
          fullName: repo.full_name,
          description: repo.description,
          url: repo.html_url,
          language: repo.language,
          stars: repo.stargazers_count,
          forks: repo.forks_count,
          openIssues: repo.open_issues_count,
          private: repo.private,
          archived: repo.archived,
          createdAt: repo.created_at,
          updatedAt: repo.updated_at,
          pushedAt: repo.pushed_at,
          owner: {
            login: repo.owner.login,
            type: repo.owner.type,
            avatarUrl: repo.owner.avatar_url,
          },
          topics: repo.topics || [],
        }));

        return {
          repositories: repos,
          page,
          perPage,
          hasMore: repos.length === perPage,
        };
      } catch (error: unknown) {
        if (
          typeof error === "object" &&
          error !== null &&
          "status" in error &&
          (error as { status: unknown }).status === 401
        ) {
          throw new Error(
            "GitHub API authentication failed. Please check that your GitHub token is valid."
          );
        }
        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to get repositories: ${message}`);
      }
    },
  });
}

// Helper function to create all GitHub API tools with a token
export function createGitHubApiTools(githubToken: string | null) {
  return {
    getGitHubUser: createGetGitHubUserTool(githubToken),
    getUserPullRequests: createGetUserPullRequestsTool(githubToken),
    getPullRequestDetails: createGetPullRequestDetailsTool(githubToken),
    getUserIssues: createGetUserIssuesTool(githubToken),
    getUserRepositories: createGetUserRepositoriesTool(githubToken),
  };
}
