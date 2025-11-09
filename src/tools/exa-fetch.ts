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

export const fetchPages = tool({
  description:
    "Fetch full page contents for specific Exa result IDs. Use this after webSearch to get the complete content of pages that seem relevant. Returns the full text content up to the specified character limit. CRITICAL: When researching unfamiliar topics, use this to read full documentation pages that you found via webSearch. This is essential for understanding how components work before answering integration questions.",
  inputSchema: zodSchema(
    z.object({
      ids: z
        .array(z.string())
        .min(1)
        .max(5)
        .describe(
          "Array of Exa result IDs to fetch full content for (from webSearch results)"
        ),
      maxChars: z
        .number()
        .int()
        .min(500)
        .max(8000)
        .default(3000)
        .describe(
          "Maximum number of characters to return per page (500-8000, default: 3000)"
        ),
      reason: z
        .string()
        .optional()
        .describe(
          "Optional explanation of what action is being performed, written in present participle form (e.g., 'fetching page content', 'reading full article', 'retrieving page details'). The user is reading this to understand why the tool is being called."
        ),
    })
  ),
  async execute({ ids, maxChars, reason }) {
    try {
      const exa = getExaClient();
      const { results } = await exa.getContents(ids, { text: true });
      return results.map((r) => ({
        id: r.id,
        url: r.url,
        title: r.title,
        content: r.text?.slice(0, maxChars) ?? "",
      }));
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Exa fetch failed: ${message}`);
    }
  },
});

