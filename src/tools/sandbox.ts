import { tool } from "ai";
import { zodSchema } from "ai";
import { z } from "zod";
import { Sandbox } from "@vercel/sandbox";
import ms from "ms";

// Store active sandboxes by chat ID
interface SandboxInfo {
  sandbox: Sandbox;
  sandboxId: string;
  repositoryUrl: string;
  createdAt: number;
}

interface CommandOutput {
  commandId: string;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timestamp: number;
}

const sandboxByChatId = new Map<string, SandboxInfo>();
const commandOutputsByChatId = new Map<string, CommandOutput[]>();

// Helper to check if sandbox is still alive by attempting a simple operation
async function isSandboxAlive(sandbox: Sandbox): Promise<boolean> {
  try {
    // Try a simple command to check if sandbox is alive
    const result = await sandbox.runCommand({ cmd: "echo", args: ["test"] });
    await result.stdout();
    return true;
  } catch (error: unknown) {
    // If we get a 400 or similar error, sandbox is likely dead
    if (
      error instanceof Error &&
      (error.message?.includes("400") || error.message?.includes("not ok"))
    ) {
      return false;
    }
    // For other errors, assume sandbox might still be alive
    return true;
  }
}

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
async function handleDeadSandbox(
  chatId: string,
  repositoryUrl?: string
): Promise<string | undefined> {
  const existing = sandboxByChatId.get(chatId);
  if (existing) {
    try {
      await existing.sandbox.stop();
    } catch (stopError) {
      // Ignore errors stopping dead sandbox
    }
    sandboxByChatId.delete(chatId);
    // Return repositoryUrl from dead sandbox if not provided
    if (!repositoryUrl && existing.repositoryUrl) {
      return existing.repositoryUrl;
    }
  }
  return repositoryUrl;
}

// Helper to get or create sandbox for a chat ID
async function getOrCreateSandbox(
  chatId: string,
  repositoryUrl?: string
): Promise<Sandbox> {
  const existing = sandboxByChatId.get(chatId);

  // If sandbox exists and no new URL provided, return it
  // We'll rely on retry logic in tools to handle dead sandboxes
  // This avoids adding latency with health checks on every access
  if (existing && !repositoryUrl) {
    return existing.sandbox;
  }

  // If sandbox exists but different URL requested, stop old one
  if (existing && repositoryUrl && existing.repositoryUrl !== repositoryUrl) {
    try {
      await existing.sandbox.stop();
    } catch (error) {
      // Ignore errors stopping old sandbox
    }
    sandboxByChatId.delete(chatId);
  }

  // If no repository URL provided and no existing sandbox, throw error
  if (!repositoryUrl && !existing) {
    throw new Error(
      `No sandbox exists for chat ${chatId}. Please provide a repositoryUrl to create a sandbox.`
    );
  }

  // Create new sandbox
  if (
    !existing ||
    (repositoryUrl && existing.repositoryUrl !== repositoryUrl)
  ) {
    const sandboxConfig: {
      source: {
        url: string;
        type: "git";
      };
      resources: { vcpus: number };
      timeout: number;
      runtime: string;
      ports: number[];
      teamId?: string;
      projectId?: string;
      token?: string;
    } = {
      source: {
        url: repositoryUrl!,
        type: "git",
      },
      resources: { vcpus: 4 },
      timeout: ms("30m") as number, // Default 30 minute timeout
      runtime: "node22",
      ports: [],
    };

    // Add authentication if using access token
    if (process.env.VERCEL_TOKEN) {
      if (!process.env.VERCEL_TEAM_ID || !process.env.VERCEL_PROJECT_ID) {
        throw new Error(
          "VERCEL_TEAM_ID and VERCEL_PROJECT_ID must be set when using VERCEL_TOKEN"
        );
      }
      sandboxConfig.teamId = process.env.VERCEL_TEAM_ID;
      sandboxConfig.projectId = process.env.VERCEL_PROJECT_ID;
      sandboxConfig.token = process.env.VERCEL_TOKEN;
    }

    // Add a timeout wrapper to prevent indefinite hanging
    const creationTimeoutMs = ms("10m"); // 10 minute timeout for creation
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Sandbox creation timed out after 10 minutes. The repository may be too large or there may be a network issue.`
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
        repositoryUrl: repositoryUrl!,
        createdAt: Date.now(),
      });

      return sandbox;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[Sandbox] Failed to create sandbox: ${message}`);
      throw error;
    }
  }

  return existing.sandbox;
}

// Helper to truncate output and get summary
function truncateOutput(
  output: string,
  maxLines: number = 20
): { truncated: string; totalLines: number; isTruncated: boolean } {
  if (!output) {
    return { truncated: "", totalLines: 0, isTruncated: false };
  }

  const lines = output.split("\n");
  const totalLines = lines.length;
  const isTruncated = totalLines > maxLines;

  if (isTruncated) {
    const firstLines = lines.slice(0, Math.floor(maxLines / 2));
    const lastLines = lines.slice(-Math.floor(maxLines / 2));
    const truncated =
      firstLines.join("\n") +
      `\n... [${totalLines - maxLines} lines omitted] ...\n` +
      lastLines.join("\n");
    return { truncated, totalLines, isTruncated };
  }

  return { truncated: output, totalLines, isTruncated: false };
}

// Run command tool
export const runSandboxCommandTool = tool({
  description: `Run a command in a sandbox environment. The sandbox is automatically created if it doesn't exist for this conversation.
  
  This allows you to execute shell commands, install dependencies, run scripts, or perform any operations needed to explore the codebase.
  
  Commands run in the sandbox's working directory (/vercel/sandbox by default). You can use sudo if needed for system-level operations.
  
  IMPORTANT: For commands with large output (like 'npm install'), only a summary is returned. Use searchCommandOutput to search the full output if needed.`,
  inputSchema: zodSchema(
    z.object({
      chatId: z
        .string()
        .optional()
        .default("main")
        .describe(
          "A unique identifier for this conversation/chat session. Used to maintain sandbox state across multiple operations. Defaults to 'main' if not provided."
        ),
      repositoryUrl: z
        .string()
        .optional()
        .describe(
          "The git repository URL to clone (required only if no sandbox exists for this chatId). Format: 'https://github.com/owner/repo.git'"
        ),
      command: z
        .string()
        .describe(
          "The command to run (e.g., 'npm install', 'ls -la', 'cat package.json')"
        ),
      args: z
        .array(z.string())
        .default([])
        .describe("Array of command arguments"),
      sudo: z
        .boolean()
        .default(false)
        .describe("Whether to run the command with sudo privileges"),
      workingDirectory: z
        .string()
        .optional()
        .describe(
          "Optional working directory to run the command in (default: /vercel/sandbox)"
        ),
      maxOutputLines: z
        .number()
        .optional()
        .default(20)
        .describe(
          "Maximum number of lines to include in the summary output (default: 20). Full output is always stored and can be searched with searchCommandOutput."
        ),
    })
  ),
  execute: async ({
    chatId,
    repositoryUrl,
    command,
    args,
    sudo,
    workingDirectory,
    maxOutputLines,
  }) => {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        // Get repositoryUrl from existing sandbox if not provided
        let actualRepositoryUrl = repositoryUrl;
        if (!actualRepositoryUrl) {
          const existing = sandboxByChatId.get(chatId);
          if (existing) {
            actualRepositoryUrl = existing.repositoryUrl;
          }
        }

        const sandbox = await getOrCreateSandbox(chatId, actualRepositoryUrl);

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

        // Generate command ID
        const commandId = `${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 11)}`;

        // Store full output
        if (!commandOutputsByChatId.has(chatId)) {
          commandOutputsByChatId.set(chatId, []);
        }
        const outputs = commandOutputsByChatId.get(chatId)!;
        outputs.push({
          commandId,
          command: fullCommand,
          stdout: stdoutStr,
          stderr: stderrStr,
          exitCode: result.exitCode,
          timestamp: Date.now(),
        });

        // Truncate output for response
        const stdoutSummary = truncateOutput(stdoutStr, maxOutputLines);
        const stderrSummary = truncateOutput(stderrStr, maxOutputLines);

        return {
          success: result.exitCode === 0,
          exitCode: result.exitCode,
          command: fullCommand,
          commandId,
          stdout: stdoutSummary.truncated,
          stdoutLines: stdoutSummary.totalLines,
          stdoutTruncated: stdoutSummary.isTruncated,
          stderr: stderrSummary.truncated,
          stderrLines: stderrSummary.totalLines,
          stderrTruncated: stderrSummary.isTruncated,
          message:
            stdoutSummary.isTruncated || stderrSummary.isTruncated
              ? `Output truncated. Use searchCommandOutput with commandId "${commandId}" to search the full output.`
              : undefined,
        };
      } catch (error: unknown) {
        // Check if this is a sandbox death error (400 or similar)
        if (isSandboxDeadError(error) && retryCount < maxRetries) {
          // Remove dead sandbox and get repositoryUrl for retry
          const retryRepositoryUrl = await handleDeadSandbox(
            chatId,
            repositoryUrl
          );
          if (retryRepositoryUrl) {
            repositoryUrl = retryRepositoryUrl;
          }
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

// List files tool
export const listSandboxFilesTool = tool({
  description: `List files and directories in a sandbox. The sandbox is automatically created if it doesn't exist for this conversation.
  
  Use this to explore the repository structure and understand the codebase organization.`,
  inputSchema: zodSchema(
    z.object({
      chatId: z
        .string()
        .optional()
        .default("main")
        .describe(
          "A unique identifier for this conversation/chat session. Used to maintain sandbox state across multiple operations. Defaults to 'main' if not provided."
        ),
      repositoryUrl: z
        .string()
        .optional()
        .describe(
          "The git repository URL to clone (required only if no sandbox exists for this chatId). Format: 'https://github.com/owner/repo.git'"
        ),
      path: z
        .string()
        .default(".")
        .describe("The directory path to list (default: current directory)"),
      recursive: z
        .boolean()
        .default(false)
        .describe("Whether to list files recursively"),
    })
  ),
  execute: async ({ chatId, repositoryUrl, path, recursive }) => {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        // Get repositoryUrl from existing sandbox if not provided
        let actualRepositoryUrl = repositoryUrl;
        if (!actualRepositoryUrl) {
          const existing = sandboxByChatId.get(chatId);
          if (existing) {
            actualRepositoryUrl = existing.repositoryUrl;
          }
        }

        const sandbox = await getOrCreateSandbox(chatId, actualRepositoryUrl);

        const command = recursive ? "find" : "ls";
        const args = recursive
          ? [path, "-type", "f", "-o", "-type", "d"]
          : ["-la", path];

        const result = await sandbox.runCommand({
          cmd: command,
          args,
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          throw new Error(`Failed to list files: ${stderr}`);
        }

        return {
          success: true,
          path,
          recursive,
          output: stdout || "",
        };
      } catch (error: unknown) {
        // Check if this is a sandbox death error
        if (isSandboxDeadError(error) && retryCount < maxRetries) {
          console.error(
            `[Sandbox] Sandbox appears dead, removing from cache and retrying (attempt ${
              retryCount + 1
            }/${maxRetries + 1})`
          );
          const retryRepositoryUrl = await handleDeadSandbox(
            chatId,
            repositoryUrl
          );
          if (retryRepositoryUrl) {
            repositoryUrl = retryRepositoryUrl;
          }
          retryCount++;
          continue;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to list files: ${message}`);
      }
    }

    throw new Error(`Failed to list files after ${maxRetries + 1} attempts`);
  },
});

// Read file tool
export const readSandboxFileTool = tool({
  description: `Read the contents of a file in a sandbox. The sandbox is automatically created if it doesn't exist for this conversation.
  
  Use this to examine source code, configuration files, documentation, or any file contents you need to understand.`,
  inputSchema: zodSchema(
    z.object({
      chatId: z
        .string()
        .optional()
        .default("main")
        .describe(
          "A unique identifier for this conversation/chat session. Used to maintain sandbox state across multiple operations. Defaults to 'main' if not provided."
        ),
      repositoryUrl: z
        .string()
        .optional()
        .describe(
          "The git repository URL to clone (required only if no sandbox exists for this chatId). Format: 'https://github.com/owner/repo.git'"
        ),
      filePath: z
        .string()
        .describe("The path to the file to read (relative to /vercel/sandbox)"),
    })
  ),
  execute: async ({ chatId, repositoryUrl, filePath }) => {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        // Get repositoryUrl from existing sandbox if not provided
        let actualRepositoryUrl = repositoryUrl;
        if (!actualRepositoryUrl) {
          const existing = sandboxByChatId.get(chatId);
          if (existing) {
            actualRepositoryUrl = existing.repositoryUrl;
          }
        }

        const sandbox = await getOrCreateSandbox(chatId, actualRepositoryUrl);

        const result = await sandbox.runCommand({
          cmd: "cat",
          args: [filePath],
        });

        const stdout = await result.stdout();
        const stderr = await result.stderr();

        if (result.exitCode !== 0) {
          throw new Error(`Failed to read file: ${stderr}`);
        }

        return {
          success: true,
          filePath,
          content: stdout || "",
        };
      } catch (error: unknown) {
        // Check if this is a sandbox death error
        if (isSandboxDeadError(error) && retryCount < maxRetries) {
          console.error(
            `[Sandbox] Sandbox appears dead, removing from cache and retrying (attempt ${
              retryCount + 1
            }/${maxRetries + 1})`
          );
          const retryRepositoryUrl = await handleDeadSandbox(
            chatId,
            repositoryUrl
          );
          if (retryRepositoryUrl) {
            repositoryUrl = retryRepositoryUrl;
          }
          retryCount++;
          continue;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to read file: ${message}`);
      }
    }

    throw new Error(`Failed to read file after ${maxRetries + 1} attempts`);
  },
});

// Search/grep tool
export const searchSandboxFilesTool = tool({
  description: `Search for text patterns in files within a sandbox. The sandbox is automatically created if it doesn't exist for this conversation.
  
  This is useful for finding function definitions, variable usage, imports, or any text patterns across the codebase.
  
  Supports grep-style searching with options like case-insensitive matching, recursive directory search, and line numbers.`,
  inputSchema: zodSchema(
    z.object({
      chatId: z
        .string()
        .optional()
        .default("main")
        .describe(
          "A unique identifier for this conversation/chat session. Used to maintain sandbox state across multiple operations. Defaults to 'main' if not provided."
        ),
      repositoryUrl: z
        .string()
        .optional()
        .describe(
          "The git repository URL to clone (required only if no sandbox exists for this chatId). Format: 'https://github.com/owner/repo.git'"
        ),
      pattern: z.string().describe("The text pattern or regex to search for"),
      path: z
        .string()
        .default(".")
        .describe(
          "The directory path to search in (default: current directory)"
        ),
      caseSensitive: z
        .boolean()
        .default(true)
        .describe("Whether the search should be case-sensitive"),
      includeLineNumbers: z
        .boolean()
        .default(true)
        .describe("Whether to include line numbers in results"),
      filePattern: z
        .string()
        .optional()
        .describe(
          "Optional file pattern to limit search (e.g., '*.ts', '*.js', '*.json')"
        ),
    })
  ),
  execute: async ({
    chatId,
    repositoryUrl,
    pattern,
    path,
    caseSensitive,
    includeLineNumbers,
    filePattern,
  }) => {
    let retryCount = 0;
    const maxRetries = 1;

    while (retryCount <= maxRetries) {
      try {
        // Get repositoryUrl from existing sandbox if not provided
        let actualRepositoryUrl = repositoryUrl;
        if (!actualRepositoryUrl) {
          const existing = sandboxByChatId.get(chatId);
          if (existing) {
            actualRepositoryUrl = existing.repositoryUrl;
          }
        }

        const sandbox = await getOrCreateSandbox(chatId, actualRepositoryUrl);

        // Build grep command
        const grepArgs: string[] = [];
        if (!caseSensitive) {
          grepArgs.push("-i");
        }
        if (includeLineNumbers) {
          grepArgs.push("-n");
        }
        grepArgs.push("-r");
        grepArgs.push(pattern);
        grepArgs.push(path);

        // If file pattern specified and not "*" (which means all files), use find + grep
        if (filePattern && filePattern !== "*") {
          const findResult = await sandbox.runCommand({
            cmd: "find",
            args: [path, "-type", "f", "-name", filePattern],
          });

          const findStdout = await findResult.stdout();
          const findStderr = await findResult.stderr();

          if (findResult.exitCode !== 0) {
            throw new Error(`Failed to find files: ${findStderr}`);
          }

          const files = findStdout
            .split("\n")
            .filter((f: string) => f.trim())
            .map((f: string) => f.trim());

          if (files.length === 0) {
            return {
              success: true,
              pattern,
              path,
              matches: [],
              message: `No files matching pattern '${filePattern}' found`,
            };
          }

          // Search each file
          const allMatches: Array<{
            file: string;
            line: string;
            lineNumber?: number;
          }> = [];

          for (const file of files) {
            const grepResult = await sandbox.runCommand({
              cmd: "grep",
              args: [
                ...(caseSensitive ? [] : ["-i"]),
                ...(includeLineNumbers ? ["-n"] : []),
                pattern,
                file,
              ],
            });

            const grepStdout = await grepResult.stdout();

            if (grepResult.exitCode === 0 && grepStdout) {
              const lines = grepStdout
                .split("\n")
                .filter((l: string) => l.trim());
              for (const line of lines) {
                if (includeLineNumbers) {
                  const match = line.match(/^(\d+):(.*)$/);
                  if (match && match[1] && match[2]) {
                    allMatches.push({
                      file,
                      line: match[2],
                      lineNumber: parseInt(match[1]),
                    });
                  } else {
                    allMatches.push({ file, line });
                  }
                } else {
                  allMatches.push({ file, line });
                }
              }
            }
          }

          return {
            success: true,
            pattern,
            path,
            filePattern,
            matches: allMatches,
            matchCount: allMatches.length,
          };
        } else {
          // Simple grep
          const result = await sandbox.runCommand({
            cmd: "grep",
            args: grepArgs,
          });

          const stdout = await result.stdout();
          const stderr = await result.stderr();

          // grep returns exit code 1 when no matches found, which is normal
          if (result.exitCode !== 0 && result.exitCode !== 1) {
            throw new Error(`Failed to search files: ${stderr}`);
          }

          const matches: Array<{
            file: string;
            line: string;
            lineNumber?: number;
          }> = [];

          if (stdout) {
            const lines = stdout.split("\n").filter((l: string) => l.trim());
            for (const line of lines) {
              if (includeLineNumbers) {
                // Format: file:lineNumber:content
                const match = line.match(/^([^:]+):(\d+):(.*)$/);
                if (match && match[1] && match[2] && match[3]) {
                  matches.push({
                    file: match[1],
                    line: match[3],
                    lineNumber: parseInt(match[2]),
                  });
                } else {
                  matches.push({ file: path, line });
                }
              } else {
                matches.push({ file: path, line });
              }
            }
          }

          return {
            success: true,
            pattern,
            path,
            matches,
            matchCount: matches.length,
          };
        }
      } catch (error: unknown) {
        // Check if this is a sandbox death error
        if (isSandboxDeadError(error) && retryCount < maxRetries) {
          console.error(
            `[Sandbox] Sandbox appears dead, removing from cache and retrying (attempt ${
              retryCount + 1
            }/${maxRetries + 1})`
          );
          const retryRepositoryUrl = await handleDeadSandbox(
            chatId,
            repositoryUrl
          );
          if (retryRepositoryUrl) {
            repositoryUrl = retryRepositoryUrl;
          }
          retryCount++;
          continue;
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";
        throw new Error(`Failed to search files: ${message}`);
      }
    }

    throw new Error(`Failed to search files after ${maxRetries + 1} attempts`);
  },
});

// Search command output tool
export const searchCommandOutputTool = tool({
  description: `Search through the stored output of previously executed commands in the sandbox.
  
  Use this to search for specific patterns, errors, or information in command outputs that were truncated.
  You can search by commandId (from runSandboxCommand), or search across all recent commands.
  
  This is especially useful for finding errors or specific information in large command outputs like 'npm install' or test results.`,
  inputSchema: zodSchema(
    z.object({
      chatId: z
        .string()
        .optional()
        .default("main")
        .describe(
          "A unique identifier for this conversation/chat session. Defaults to 'main' if not provided."
        ),
      pattern: z
        .string()
        .describe("The text pattern or regex to search for in command outputs"),
      commandId: z
        .string()
        .optional()
        .describe(
          "Optional: Search only in the output of a specific command (from runSandboxCommand's commandId). If not provided, searches all recent commands."
        ),
      searchStdout: z
        .boolean()
        .default(true)
        .describe("Whether to search in stdout"),
      searchStderr: z
        .boolean()
        .default(true)
        .describe("Whether to search in stderr"),
      caseSensitive: z
        .boolean()
        .default(false)
        .describe("Whether the search should be case-sensitive"),
      maxResults: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of matching lines to return"),
    })
  ),
  execute: async ({
    chatId,
    pattern,
    commandId,
    searchStdout,
    searchStderr,
    caseSensitive,
    maxResults,
  }) => {
    try {
      const outputs = commandOutputsByChatId.get(chatId) || [];

      if (outputs.length === 0) {
        return {
          success: true,
          message: `No command outputs found for chatId "${chatId}". Run some commands first.`,
          matches: [],
          matchCount: 0,
        };
      }

      // Filter by commandId if specified
      const commandsToSearch = commandId
        ? outputs.filter((o) => o.commandId === commandId)
        : outputs;

      if (commandsToSearch.length === 0) {
        return {
          success: true,
          message: commandId
            ? `No command found with commandId "${commandId}"`
            : `No commands found`,
          matches: [],
          matchCount: 0,
        };
      }

      // Build regex pattern
      const flags = caseSensitive ? "g" : "gi";
      const regex = new RegExp(pattern, flags);

      const matches: Array<{
        commandId: string;
        command: string;
        stream: "stdout" | "stderr";
        line: string;
        lineNumber: number;
      }> = [];

      for (const output of commandsToSearch) {
        if (searchStdout && output.stdout) {
          const lines = output.stdout.split("\n");
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              matches.push({
                commandId: output.commandId,
                command: output.command,
                stream: "stdout",
                line,
                lineNumber: index + 1,
              });
            }
          });
        }

        if (searchStderr && output.stderr) {
          const lines = output.stderr.split("\n");
          lines.forEach((line, index) => {
            if (regex.test(line)) {
              matches.push({
                commandId: output.commandId,
                command: output.command,
                stream: "stderr",
                line,
                lineNumber: index + 1,
              });
            }
          });
        }

        // Reset regex lastIndex for next iteration
        regex.lastIndex = 0;
      }

      // Limit results
      const limitedMatches = matches.slice(0, maxResults);

      return {
        success: true,
        pattern,
        commandId: commandId || "all",
        matches: limitedMatches,
        matchCount: matches.length,
        totalMatches: matches.length,
        limited: matches.length > maxResults,
        message:
          matches.length > maxResults
            ? `Found ${matches.length} matches, showing first ${maxResults}`
            : undefined,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      throw new Error(`Failed to search command output: ${message}`);
    }
  },
});

// Export all tools as an object for easy importing
export const sandboxTools = {
  runCommand: runSandboxCommandTool,
  listFiles: listSandboxFilesTool,
  readFile: readSandboxFileTool,
  searchFiles: searchSandboxFilesTool,
  searchCommandOutput: searchCommandOutputTool,
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
  // Also clean up command outputs
  commandOutputsByChatId.delete(chatId);
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
  commandOutputsByChatId.clear();
}
