import { stepCountIs, streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { githubSearchTool } from "./src/tools/search-github";
import { sandboxTools } from "./src/tools/sandbox";

// Main agent function
async function generateResponse(userQuery: string) {
  try {
    const systemPrompt = `You are a GitHub search expert. Your goal is to help users find information on GitHub.

CRITICAL: SOURCE CITATION REQUIREMENTS
- ALWAYS cite specific sources when providing information. For each fact or claim, include:
  - The repository name (owner/repo-name format)
  - The file path (if from code search)
  - The issue/PR number and title (if from issues search)
  - Direct links to the source when available
- Use inline citations in your response, e.g., "According to [file path in repo](link)..." or "As mentioned in [issue #123](link)..."
- At the end of your response, include a "Sources" section listing all repositories, files, issues, and other resources you referenced
- Be transparent about which search results led to which conclusions

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

SANDBOX TOOLS (for deep code exploration):
When standard GitHub search doesn't provide enough detail, you can use sandbox tools to explore repositories directly. Sandboxes are automatically created and managed - you don't need to create or stop them manually.

CRITICAL EXECUTION ORDER: When using sandbox tools, you MUST wait for each sandbox tool call to complete and receive its result before making any other tool calls (including githubSearch or other sandbox tools). Do NOT call multiple tools in parallel when sandbox operations are involved - execute sandbox tools sequentially and wait for their results.

Available sandbox tools:
- listSandboxFiles: Explore the repository structure and file organization (provide repositoryUrl on first use)
- readSandboxFile: Read full file contents to understand implementation details (provide repositoryUrl on first use)
- searchSandboxFiles: Search for patterns across files (like grep) (provide repositoryUrl on first use)
- runSandboxCommand: Execute commands to install dependencies, run tests, or explore the codebase (provide repositoryUrl on first use). Returns truncated output for large commands - use searchCommandOutput to search the full output.
- searchCommandOutput: Search through stored command outputs to find specific patterns, errors, or information. Use this when you need to search large command outputs that were truncated.

IMPORTANT: All sandbox tools accept an optional chatId parameter (defaults to "main" if not provided). On the first sandbox operation for a repository, you must provide the repositoryUrl. Subsequent operations will automatically reuse the same sandbox for that chatId. Always use the exact repository URL format: https://github.com/owner/repo-name.git

Use sandboxes when you need to:
- Understand complex code structures that require reading multiple files
- Run code to see how it behaves
- Search for patterns that GitHub's code search might miss
- Explore build configurations, test files, or documentation
- Understand dependencies and how they're used

ERROR HANDLING AND PERSISTENCE:
When encountering errors or failures, DO NOT give up immediately. Be persistent and try alternative approaches:

1. **Command failures**: If a command fails (e.g., npm install fails), try alternatives:
   - Check package.json to understand the project structure and available scripts
   - Try different package managers (bun, pnpm, yarn) if npm fails
   - Try different install flags (--legacy-peer-deps, --no-workspaces, etc.)
   - Read error messages carefully and search for solutions
   - Check if the project uses workspaces and adjust your approach accordingly

2. **Investigation before giving up**:
   - Read package.json to understand scripts, dependencies, and project structure
   - Check for alternative test commands or scripts
   - Look for CI/CD configuration files (.github/workflows, etc.) to see how tests are run
   - Read README.md or documentation files for setup instructions

3. **Multiple attempts**: Don't stop after the first error - systematically try different approaches:
   - Different package managers
   - Different command variations
   - Reading configuration files to understand the setup
   - Checking for workspace configurations and adjusting commands accordingly

4. **When running tests**: If "npm test" fails, try:
   - Reading package.json to find the exact test script
   - Using bun/pnpm/yarn if available
   - Running tests from specific workspace directories if it's a monorepo
   - Checking for test configuration files

CRITICAL: Always investigate the root cause of errors by reading relevant configuration files (package.json, package-lock.json, etc.) before concluding that something is impossible. Try at least 2-3 alternative approaches before giving up.

Always be thorough and search systematically. Don't give up after one or two searches - explore the repository structure, codebase, and issues.`;

    const result = streamText({
      model: gateway("openai/gpt-4o-mini"),
      system: systemPrompt,
      prompt: userQuery,
      tools: {
        githubSearch: githubSearchTool,
        runSandboxCommand: sandboxTools.runCommand,
        listSandboxFiles: sandboxTools.listFiles,
        readSandboxFile: sandboxTools.readFile,
        searchSandboxFiles: sandboxTools.searchFiles,
        searchCommandOutput: sandboxTools.searchCommandOutput,
      },
      stopWhen: stepCountIs(150),
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
          const output = chunk.output;

          // Format GitHub search results more clearly
          if (
            typeof output === "object" &&
            output !== null &&
            "type" in output
          ) {
            const result = output as any;
            process.stdout.write(
              `[Search: ${result.type} | Query: "${result.query}" | Found: ${result.totalCount} results]\n`
            );

            // Show key source information
            if (result.items && result.items.length > 0) {
              process.stdout.write(`[Top sources found:\n`);
              result.items.slice(0, 5).forEach((item: any, idx: number) => {
                if (result.type === "repositories") {
                  process.stdout.write(
                    `  ${idx + 1}. ${item.fullName} (${item.url})\n`
                  );
                } else if (result.type === "code") {
                  process.stdout.write(
                    `  ${idx + 1}. ${item.repository.fullName}/${item.path} (${
                      item.url
                    })\n`
                  );
                } else if (result.type === "issues") {
                  process.stdout.write(
                    `  ${idx + 1}. ${item.repository.fullName}#${
                      item.number
                    }: ${item.title} (${item.url})\n`
                  );
                }
              });
              if (result.items.length > 5) {
                process.stdout.write(
                  `  ... and ${result.items.length - 5} more\n`
                );
              }
              process.stdout.write(`]\n`);
            }
          } else {
            // For other tool results, show truncated output
            const resultStr =
              typeof output === "string"
                ? output
                : JSON.stringify(output, null, 2);
            process.stdout.write(
              `[Result: ${resultStr.substring(0, 200)}...]\n`
            );
          }
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
