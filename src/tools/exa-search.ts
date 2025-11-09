import { tool } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";
import Exa from "exa-js";

function getExaClient(): Exa {
  const exaApiKey = process.env.EXA_API_KEY;
  if (!exaApiKey) {
    throw new Error("EXA_API_KEY environment variable is not set");
  }
  return new Exa(exaApiKey);
}

export const webSearch = tool({
  description:
    "Search the web with Exa and return metadata only. Use this to find relevant web pages, articles, documentation, and other online resources. Returns search results with titles, URLs, relevance scores, and short snippets. CRITICAL: When researching unfamiliar topics or components (especially for integration questions), use this tool to find official documentation sites, tutorials, and examples. Research ALL components mentioned in a question before attempting to answer.",
  inputSchema: zodSchema(
    z.object({
      query: z
        .string()
        .min(1)
        .max(200)
        .describe("The search query to find relevant web pages"),
      numResults: z
        .number()
        .int()
        .min(1)
        .max(10)
        .default(5)
        .describe("Number of results to return (1-10, default: 5)"),
      reason: z
        .string()
        .optional()
        .describe(
          "Optional explanation of what action is being performed, written in present participle form (e.g., 'searching for documentation', 'finding relevant articles', 'looking up information'). The user is reading this to understand why the tool is being called."
        ),
    })
  ),
  async execute({ query, numResults, reason }) {
    try {
      const exa = getExaClient();
      const { results } = await exa.search(query, { numResults });
      return results.map((r) => ({
        id: r.id,
        title: r.title,
        url: r.url,
        score: r.score,
        snippet: r.text?.slice(0, 400) ?? null, // tiny preview
      }));
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Exa search failed: ${message}`);
    }
  },
});
