import { stepCountIs, streamText } from "ai";
import { gateway } from "@ai-sdk/gateway";
import { githubSearchTool } from "./src/tools/search-github";

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

    const result = streamText({
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
