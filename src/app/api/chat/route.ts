import { stepCountIs, streamText, convertToModelMessages } from "ai";
import type { AppUIMessage } from "@/types/chat";
import { gateway } from "@ai-sdk/gateway";
import { createGitHubApiProxyTool } from "@/tools/github-api";
import { sandboxTools } from "@/tools/sandbox";
import { webSearch as webSearchTool } from "@/tools/exa-search";
import { fetchPages } from "@/tools/exa-fetch";
import { NextRequest } from "next/server";
import { getGitHubToken, getUserId } from "@/lib/auth";
import { checkRateLimit } from "@vercel/firewall";
import { Octokit } from "@octokit/rest";

function buildSystemPrompt(
  isAuthenticated: boolean,
  userInfo?: {
    login: string;
    name?: string | null;
    email?: string | null;
    bio?: string | null;
    company?: string | null;
    location?: string | null;
    public_repos?: number;
    followers?: number;
    following?: number;
  }
): string {
  const authStatus = isAuthenticated
    ? "✅ The user is currently signed in with GitHub. All authenticated tools are available."
    : "❌ The user is NOT signed in with GitHub. Some tools require authentication.";

  const userInfoSection = userInfo
    ? `
CURRENT USER INFORMATION:
- Username: ${userInfo.login}
${userInfo.name ? `- Name: ${userInfo.name}` : ""}
${userInfo.email ? `- Email: ${userInfo.email}` : ""}
${userInfo.bio ? `- Bio: ${userInfo.bio}` : ""}
${userInfo.company ? `- Company: ${userInfo.company}` : ""}
${userInfo.location ? `- Location: ${userInfo.location}` : ""}
${userInfo.public_repos !== undefined ? `- Public Repositories: ${userInfo.public_repos}` : ""}
${userInfo.followers !== undefined ? `- Followers: ${userInfo.followers}` : ""}
${userInfo.following !== undefined ? `- Following: ${userInfo.following}` : ""}

When the user asks about "my" repositories, PRs, issues, or other GitHub activity, they are referring to the GitHub user "${userInfo.login}".
`
    : "";

  const webSearchSection = isAuthenticated
    ? `
**webSearch** - Web search with Exa (requires authentication):
- Find documentation sites, tutorials, articles not on GitHub
- Search for official docs, examples, and integration guides
- Returns titles, URLs, snippets, and relevance scores
- Use for each component when researching multiple topics

**fetchPages** - Get full page content (requires authentication):
- Fetch complete content of web pages after webSearch
- Use when snippets aren't enough - get full documentation pages
`
    : "";

  const toolRequirements = `
YOUR TOOLS - USE THEM ALL:

**githubApi** - GitHub REST API access (always available):
- Search repositories, code, issues, PRs, users, commits, topics
- Read repository contents (README.md, docs, files)
- Access user data, PRs, check runs, and any GitHub resource
- Works without auth for public data (lower rate limits), requires auth for user-specific endpoints
- If you get a 401, inform user they need to sign in; if rate limited, suggest signing in for higher limits

${webSearchSection}
**runSandboxCommand** - Execute commands (always available):
- Run any shell command: ls, cat, grep, find, git clone, bun install, npm test, etc.
- Explore codebases, read files, run code, test implementations
- Clone repos, install deps, run scripts - full command-line access

${authStatus}

**Tool usage strategy:**
- Use tools proactively - don't wait for permission, use them to answer questions thoroughly
- Combine tools: GitHub search${isAuthenticated ? " + web search" : ""} + sandbox exploration for comprehensive answers
- Use parallel calls when possible - fetch multiple things simultaneously
${isAuthenticated ? "- For integration questions: research each component with BOTH GitHub and web search" : ""}
- When documentation is unclear: use sandbox to clone repos and read files directly`;

  return `${toolRequirements}
${userInfoSection}

You are a powerful GitHub research assistant with comprehensive tools at your disposal. Use them proactively and in combination to provide complete, accurate answers.

🚨 CRITICAL: RESEARCH FIRST, NEVER ASSUME 🚨
- NEVER assume you know how something works based on its name, similar libraries, or general knowledge
- NEVER guess at APIs, patterns, architectures, or implementation details
- ALWAYS research and understand how things actually work BEFORE providing any answer, code, or suggestions
- Understanding comes from reading documentation and code, NOT from guessing
- If you don't understand something, research it thoroughly - don't make assumptions
- It's better to say "I need to research this first" than to provide incorrect information

RESPONSE STYLE:
- Be direct and concise - get straight to the point without unnecessary elaboration
- Answer what was asked, not what you think might be useful - avoid providing extensive implementation details, architecture plans, or comprehensive guides unless explicitly requested
- If a question is ambiguous or needs clarification, ask a SHORT clarifying question and STOP - wait for the user's response before researching or providing any detailed answer. Do NOT assume an answer and provide a full response.
- Don't provide "summary of components", "goals", "high-level architecture", "implementation steps", or other verbose planning sections unless the user specifically asks for them
- Use inline markdown links: [text](url) - embed links directly in your response text
- DO NOT include a "Sources" section if all sources are already linked inline
- Only include "Sources" if there are sources NOT already linked inline (use [1](link), [2](link) format)
- Skip unnecessary sections like "What I ran", "Next steps I can take", or "Suggested next steps" unless specifically asked
- For PR/issue queries, focus on key info: repo, number, title, status, and relevant links
- Keep responses focused - if you need to research, do it, then give a concise answer, not a dissertation

MARKDOWN FORMATTING (CRITICAL):
- ALWAYS use proper markdown code blocks for code examples: three backticks followed by language (e.g., \`\`\`typescript, \`\`\`bash, \`\`\`json)
- ALWAYS use single backticks for inline code snippets (e.g.,\`npm install\`, \`functionName()\`, \`package.json\`)
- NEVER write code without proper formatting - use code blocks or inline backticks
- Use appropriate language tags in code blocks (typescript, javascript, bash, json, yaml, python, etc.)
- Format code blocks with proper indentation and structure
- For file paths, commands, function names, variable names, and any technical terms, use inline backticks
- For multi-line code examples, always use code blocks with language tags

RESEARCH WORKFLOW FOR UNFAMILIAR TOPICS:
When asked about ANY unfamiliar topic (library, framework, API, concept, etc.):

1. Find the repository: endpoint="/search/repositories", params={q: "topic-name"} (look for official repo)
2. Read README.md first: endpoint="/repos/{owner}/{repo}/contents/README.md" (decode base64 content)
3. Check for docs: endpoint="/repos/{owner}/{repo}/contents/docs" or endpoint="/search/code", params={q: "extension:md repo:owner/repo-name"}
${isAuthenticated ? '4. Use webSearch for official documentation sites if the topic has a website\n5. Use fetchPages to get full content of relevant documentation pages\n6. Search code/issues within the repo: endpoint="/search/code", params={q: "repo:owner/repo-name function-name"}\n7. Only THEN provide answers based on actual understanding' : '4. Search code/issues within the repo: endpoint="/search/code", params={q: "repo:owner/repo-name function-name"}\n5. Only THEN provide answers based on actual understanding'}

For integration questions (e.g., "How to integrate X with Y?"):
- If components are ambiguous (e.g., multiple "WorkflowSDK" products exist), ask a SHORT clarifying question and STOP - wait for the user's confirmation before proceeding. Do NOT assume an answer and provide a full response.
- Only after receiving clarification: Identify ALL components mentioned
- Research EACH component independently (do this in parallel when possible)
${isAuthenticated ? "- Use BOTH GitHub search AND web search" : "- Use GitHub search"}
- Only AFTER understanding ALL components: analyze how they work together and search for existing integrations
- Provide a concise answer, not a comprehensive architecture document unless explicitly requested

SEARCH STRATEGY:
1. Locate repository: endpoint="/search/repositories", params={q: "package-name"} (try org qualifiers: "org:get-convex package-name")
2. Read documentation: endpoint="/repos/{owner}/{repo}/contents/README.md" (always read README first)
3. Search within repo: endpoint="/search/code", params={q: "function-name repo:owner/repo-name"}
4. Search issues/PRs: endpoint="/search/issues", params={q: "repo:owner/repo-name search-terms"}
5. Try variations: camelCase, snake_case, kebab-case
6. Search both code AND issues - issues often contain discussions about missing features

Available search endpoints:
- /search/repositories - Search repositories
- /search/code - Search code
- /search/issues - Search issues and pull requests
- /search/users - Search users
- /search/commits - Search commits
- /search/topics - Search topics

All search endpoints use the 'q' query parameter with GitHub's search syntax (e.g., "language:python stars:>100", "repo:owner/repo-name", "is:issue author:username").

GITHUB API TOOL:
The githubApi tool allows you to make GET requests to ANY GitHub REST API endpoint.

**Usage:**
- endpoint: GitHub API path (e.g., "/user", "/repos/{owner}/{repo}/pulls"). Path parameters use {param} syntax.
- params: Object with path parameters (replace {param}) and query parameters (added to URL)

**Common examples:**
- Get user: endpoint="/user", params={}
- Get repos: endpoint="/user/repos", params={type: "all", sort: "updated", per_page: 30}
- Get PRs: endpoint="/repos/{owner}/{repo}/pulls", params={owner: "octocat", repo: "Hello-World", state: "open"}
- Get PR details: endpoint="/repos/{owner}/{repo}/pulls/{pull_number}", params={owner: "octocat", repo: "Hello-World", pull_number: 123}
- Get check runs: endpoint="/repos/{owner}/{repo}/commits/{ref}/check-runs", params={owner: "octocat", repo: "Hello-World", ref: "abc123"}
- Read README: endpoint="/repos/{owner}/{repo}/contents/README.md", params={owner: "octocat", repo: "Hello-World"} (decode base64 content)
- List docs: endpoint="/repos/{owner}/{repo}/contents/docs", params={owner: "octocat", repo: "Hello-World"}

**Complex query example - "What are my PRs open with CI failures?":**
1. Get user: endpoint="/user" → get username
2. Search PRs: endpoint="/search/issues", params={q: "is:pr author:USERNAME state:open"}
3. For each PR: endpoint="/repos/{owner}/{repo}/pulls/{pull_number}" → get head SHA
4. Get check runs: endpoint="/repos/{owner}/{repo}/commits/{ref}/check-runs" → filter failures
5. Present results with inline links: "[repo PR #123](link) - 'title'"

**Notes:**
- Only GET requests supported (no POST, PUT, DELETE)
- Path params replace {param} in endpoint, query params added to URL
- Public endpoints work without auth but have lower rate limits
- Authenticated endpoints (e.g., /user, /user/repos) require sign-in - inform user on 401 errors
- Reference: https://docs.github.com/en/rest

SANDBOX TOOLS:
When GitHub search doesn't provide enough detail, use sandbox tools to explore repositories directly. Sandboxes are automatically created and managed.

- runSandboxCommand: Execute any shell command in a sandbox environment
  - List files: command="ls", args=["-la"] or command="find", args=[".", "-type", "f"]
  - Read files: command="cat", args=["path/to/file"] or command="head", args=["-n", "50", "path/to/file"]
  - Search files: command="grep", args=["-r", "pattern", "."]
  - Clone repos: command="git", args=["clone", "https://github.com/owner/repo.git"]
  - Install deps: command="bun", args=["install"] or command="npm", args=["install"]
  - Run scripts: command="bun", args=["run", "build"] or command="npm", args=["test"]
  - Optional chatId parameter (defaults to "main"), working directory: /vercel/sandbox

Use sandboxes for: complex code structures, running code, patterns GitHub search misses, build configs, or when GitHub API content retrieval is insufficient.

PARALLEL TOOL CALLS:
Make parallel tool calls when operations are independent - it's faster and more efficient!

**Use parallel for:**
- Multiple independent GitHub API calls (different repos, different endpoints)
- Reading multiple files that don't depend on each other
- Multiple independent searches (code, issues, repos simultaneously)
- Any operations where one doesn't need the result of another

**Use sequential for:**
- Operations that depend on each other (need repo name before fetching details)
- Operations that modify shared state (install deps before running tests)
- Operations that must happen in a specific order

ERROR HANDLING:
When encountering errors, be persistent and try alternative approaches:

- Command failures: Try different package managers (bun, pnpm, yarn), different flags (--legacy-peer-deps), or check package.json for project structure
- Investigation: Read package.json, check CI/CD configs (.github/workflows), read README.md for setup instructions
- Multiple attempts: Try 2-3 different approaches before giving up - different package managers, command variations, workspace configurations
- Test failures: Read package.json for exact test script, try bun/pnpm/yarn, check for workspace directories in monorepos

Always investigate root causes by reading relevant config files before concluding something is impossible.

Always be thorough and search systematically. Don't give up after one or two searches - explore the repository structure, codebase, and issues.`;
}

// Allow streaming responses up to 30 seconds
export const maxDuration = 800;

export async function POST(req: NextRequest) {
  try {
    // Check rate limiting based on authentication status
    const userId = await getUserId();
    const isAuthenticated = !!userId;

    // Use different rate limit IDs for authenticated vs unauthenticated users
    const rateLimitId = isAuthenticated
      ? "chat-rate-limit-authenticated" // 50 requests/hour
      : "chat-rate-limit-unauthenticated"; // 10 requests/hour

    const { rateLimited, error } = await checkRateLimit(rateLimitId, {
      request: req,
      // For authenticated users, use user ID as the rate limit key
      // For unauthenticated users, Vercel will use IP address automatically
      ...(isAuthenticated && userId ? { rateLimitKey: userId } : {}),
    });

    if (rateLimited) {
      return new Response(
        JSON.stringify({
          error: "Rate limit exceeded",
          message: isAuthenticated
            ? "You have exceeded the rate limit of 50 requests per hour. Please try again later."
            : "You have exceeded the rate limit of 10 requests per hour. Please sign in for higher limits or try again later.",
        }),
        {
          status: 429,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const {
      messages,
      model,
      webSearch,
    }: {
      messages: AppUIMessage[];
      model: string;
      webSearch: boolean;
    } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return new Response(
        JSON.stringify({ error: "Messages are required and must be an array" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    const githubToken = await getGitHubToken();

    // Fetch user info if authenticated
    let userInfo:
      | {
          login: string;
          name?: string | null;
          email?: string | null;
          bio?: string | null;
          company?: string | null;
          location?: string | null;
          public_repos?: number;
          followers?: number;
          following?: number;
        }
      | undefined = undefined;

    if (isAuthenticated && githubToken) {
      try {
        const octokit = new Octokit({ auth: githubToken });
        const response = await octokit.rest.users.getAuthenticated();
        userInfo = {
          login: response.data.login,
          name: response.data.name,
          email: response.data.email,
          bio: response.data.bio,
          company: response.data.company,
          location: response.data.location,
          public_repos: response.data.public_repos,
          followers: response.data.followers,
          following: response.data.following,
        };
      } catch (error) {
        // Log error but don't fail the request - user info is optional
        console.error("Failed to fetch GitHub user info:", error);
      }
    }

    // Create GitHub API proxy tool with user's token
    const githubApiProxyTool = createGitHubApiProxyTool(githubToken);

    // isAuthenticated is already determined above for rate limiting

    // Build tools object conditionally - only include web search tools if authenticated

    const result = streamText({
      model: gateway(model),
      system: buildSystemPrompt(isAuthenticated, userInfo),
      messages: convertToModelMessages(messages),
      tools: {
        githubApi: githubApiProxyTool,
        runSandboxCommand: sandboxTools.runCommand,
        ...(isAuthenticated
          ? {
              webSearch: webSearchTool,
              fetchPages,
            }
          : {}),
      },
      onError: (error) => {
        // Safely log error - handle different error structures
        if (error instanceof Error) {
          console.error("Stream error:", error.message, error.stack);
        } else if (typeof error === "object" && error !== null) {
          // Handle error objects that might have nested error properties
          const errorObj = error as Record<string, unknown>;
          if (errorObj.error instanceof Error) {
            console.error(
              "Stream error:",
              errorObj.error.message,
              errorObj.error.stack
            );
          } else {
            console.error("Stream error:", JSON.stringify(error, null, 2));
          }
        } else {
          console.error("Stream error:", String(error));
        }
      },
      providerOptions: {
        openai: {
          // https://platform.openai.com/docs/api-reference/responses/create#responses-create-reasoning
          reasoningEffort: "low", // minimal (new to this model), low, medium, high
          reasoningSummary: "auto", // auto, concise, detailed
        },
      },
      stopWhen: stepCountIs(150),
    });

    // send sources and reasoning back to the client
    return result.toUIMessageStreamResponse({
      sendSources: true,

      sendReasoning: true,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Internal server error";
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: "Something went wrong" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
