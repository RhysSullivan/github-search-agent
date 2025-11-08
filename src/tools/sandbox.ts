import { tool } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

// Store active sandboxes by chat ID
interface SandboxInfo {
  sandbox: Sandbox;
  sandboxId: string;
  createdAt: number;
}

const sandboxByChatId = new Map<string, SandboxInfo>();

// Helper to check if an error indicates a dead sandbox
function isSandboxDeadError(error: unknown): boolean {
  return (
    (error instanceof Error &&
      (error.message?.includes("400") ||
        error.message?.includes("not ok") ||
        error.message?.includes("Status code"))) ||
    false
  );
}

// Helper to handle dead sandbox cleanup and retry
async function handleDeadSandbox(chatId: string): Promise<void> {
  const existing = sandboxByChatId.get(chatId);
  if (existing) {
    try {
      await existing.sandbox.stop();
    } catch (stopError) {
      // Ignore errors stopping dead sandbox
    }
    sandboxByChatId.delete(chatId);
  }
}

// Helper to get or create sandbox for a chat ID
async function getOrCreateSandbox(chatId: string): Promise<Sandbox> {
  const existing = sandboxByChatId.get(chatId);

  // If sandbox exists, return it
  if (existing) {
    return existing.sandbox;
  }

  // Create new sandbox
  const sandboxConfig: {
    resources: { vcpus: number };
    timeout: number;
    runtime: string;
    ports: number[];
    teamId?: string;
    projectId?: string;
    token?: string;
  } = {
    resources: { vcpus: 2 },
    timeout: ms("10m") as number,
    runtime: "node22",
    ports: [],
  };

  // Add a timeout wrapper to prevent indefinite hanging
  const creationTimeoutMs = ms("10m"); // 10 minute timeout for creation
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new Error(
          `Sandbox creation timed out after 10 minutes. There may be a network issue.`
        )
      );
    }, creationTimeoutMs);
  });

  try {
    const sandbox = await Promise.race([
      Sandbox.create(sandboxConfig),
      timeoutPromise,
    ]);
    const sandboxId = sandbox.sandboxId;

    sandboxByChatId.set(chatId, {
      sandbox,
      sandboxId,
      createdAt: Date.now(),
    });

    return sandbox;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Sandbox] Failed to create sandbox: ${message}`);
    throw error;
  }
}

// Run command tool - simplified to a single primitive that can run any shell command
export const runSandboxCommandTool = tool({
  description: `Run a shell command in a sandbox environment. The sandbox is automatically created if it doesn't exist for this conversation.
  
  This tool gives you full access to run any shell command in the sandbox. You can use it to:
  - Clone repositories: command="git", args=["clone", "https://github.com/owner/repo.git"]
  - List files: command="ls", args=["-la"] or command="find", args=[".", "-type", "f"]
  - Read files: command="cat", args=["path/to/file"] or command="head", args=["-n", "50", "path/to/file"]
  - Search files: command="grep", args=["-r", "pattern", "."] or command="grep", args=["-rn", "pattern", "path"]
  - Install dependencies: command="npm", args=["install"] or command="bun", args=["install"]
  - Run scripts: command="npm", args=["test"] or command="bun", args=["run", "build"]
  - Execute any other shell command or script
  
  Commands run in the sandbox's working directory (/vercel/sandbox by default). You can use sudo if needed for system-level operations.
  You can also use shell features like pipes, redirects, and chaining by using command="sh", args=["-c", "command1 | command2"].
  
  Examples:
  - Clone repo: command="git", args=["clone", "https://github.com/owner/repo.git"]
  - List files: command="ls", args=["-la"]
  - Read file: command="cat", args=["package.json"]
  - Search code: command="grep", args=["-rn", "functionName", "."]
  - Install deps: command="npm", args=["install"]
  - Run with shell: command="sh", args=["-c", "cd src && ls -la"]
  - Chain commands: command="sh", args=["-c", "cat file.txt | grep pattern"]`,
  inputSchema: zodSchema(
    z.object({
      chatId: z
        .string()
        .optional()
        .default("main")
        .describe(
          "A unique identifier for this conversation/chat session. Used to maintain sandbox state across multiple operations. Defaults to 'main' if not provided."
        ),
      command: z
        .string()
        .describe(
          "The command to run (e.g., 'git', 'ls', 'cat', 'grep', 'npm', 'bun', 'sh'). Use 'sh' with '-c' to run shell commands with pipes, redirects, or chaining."
        ),
      args: z
        .array(z.string())
        .default([])
        .describe(
          "Array of command arguments. For shell commands, use command='sh', args=['-c', 'your shell command']"
        ),
      sudo: z
        .boolean()
        .default(false)
        .describe("Whether to run the command with sudo privileges"),
      workingDirectory: z
        .string()
        .optional()
        .describe(
          "Optional working directory to run the command in (default: /vercel/sandbox). You can also use 'sh -c' with 'cd' to change directories."
        ),
      reason: z
        .string()
        .optional()
        .describe(
          "Optional explanation of what action is being performed, written in present participle form (e.g., 'reading package.json', 'running tests', 'searching for function definitions'). This describes the LLM's action from the user's perspective."
        ),
    })
  ),
  execute: async ({ chatId, command, args, sudo, workingDirectory, reason }) => {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        const sandbox = await getOrCreateSandbox(chatId);

        // Build command execution
        const cmd = sudo ? "sudo" : command;
        const cmdArgs = sudo ? [command, ...args] : args;

        let fullCommand: string;
        let result: Awaited<ReturnType<typeof sandbox.runCommand>>;

        // Change directory if specified
        if (workingDirectory) {
          // Use sh -c to change directory first
          fullCommand = `cd ${workingDirectory} && ${command} ${args.join(
            " "
          )}`;
          result = await sandbox.runCommand({
            cmd: sudo ? "sudo" : "sh",
            args: sudo ? ["-c", fullCommand] : ["-c", fullCommand],
            sudo,
          });
        } else {
          fullCommand = `${cmd} ${cmdArgs.join(" ")}`;
          result = await sandbox.runCommand({
            cmd,
            args: cmdArgs,
            sudo,
          });
        }

        const stdout = await result.stdout();
        const stderr = await result.stderr();
        const stdoutStr = stdout || "";
        const stderrStr = stderr || "";

        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          command: fullCommand,
          stdout: stdoutStr,
          stderr: stderrStr,
        };
      } catch (error: unknown) {
        // Check if this is a sandbox death error (400 or similar)
        if (isSandboxDeadError(error) && retryCount < maxRetries) {
          // Remove dead sandbox and retry
          await handleDeadSandbox(chatId);
          retryCount++;
          continue;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to run command: ${message}`);
      }
    }

    throw new Error(`Failed to run command after ${maxRetries + 1} attempts`);
  },
});

// Export the single sandbox command tool
export const sandboxTools = {
  runCommand: runSandboxCommandTool,
};

// Helper function to clean up sandboxes (can be called periodically or on shutdown)
export async function cleanupSandbox(chatId: string): Promise<void> {
  const info = sandboxByChatId.get(chatId);
  if (info) {
    try {
      await info.sandbox.stop();
    } catch (error) {
      // Ignore errors
    }
    sandboxByChatId.delete(chatId);
  }
}

// Cleanup all sandboxes
export async function cleanupAllSandboxes(): Promise<void> {
  const promises = Array.from(sandboxByChatId.values()).map((info) =>
    info.sandbox.stop().catch(() => {
      // Ignore errors
    })
  );
  await Promise.all(promises);
  sandboxByChatId.clear();
}
