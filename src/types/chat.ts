import { InferUITools, ToolSet, UIMessage, tool, type UIDataTypes } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";

// Define the tool schemas to create type-safe UIMessage
// These match the actual tool definitions but are used for typing
const typedTools = {
  githubApi: tool({
    description: "GitHub API tool",
    inputSchema: zodSchema(
      z.object({
        endpoint: z.string(),
        params: z.record(z.string(), z.unknown()).optional(),
        reason: z
          .string()
          .optional()
          .describe(
            "Optional explanation of what action is being performed, written in present participle form (e.g., 'getting authenticated username', 'searching for repositories', 'fetching pull request details'). This describes the LLM's action from the user's perspective."
          ),
      })
    ),
    execute: async () => ({}),
  }),
  runSandboxCommand: tool({
    description: "Sandbox command tool",
    inputSchema: zodSchema(
      z.object({
        chatId: z.string().optional(),
        command: z.string(),
        args: z.array(z.string()).default([]),
        sudo: z.boolean().default(false),
        workingDirectory: z.string().optional(),
        reason: z
          .string()
          .optional()
          .describe(
            "Optional explanation of what action is being performed, written in present participle form (e.g., 'reading package.json', 'running tests', 'searching for function definitions'). This describes the LLM's action from the user's perspective."
          ),
      })
    ),
    execute: async () => ({}),
  }),
} satisfies ToolSet;

// Infer the tools type
export type AppTools = InferUITools<typeof typedTools>;

// Create the custom UIMessage type with our tools
// Use Record<string, never> for empty data types
export type AppUIMessage = UIMessage<unknown, Record<string, never>, AppTools>;

// Export helper types for tool parts with proper typing
export type AppToolUIPart = Extract<
  AppUIMessage["parts"][number],
  { type: `tool-${string}` }
>;

// Helper type to extract tool input with reason
export type ToolInputWithReason<T extends AppToolUIPart> = T["input"] & {
  reason?: string;
};
