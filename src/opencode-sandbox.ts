// opencode-sandbox.ts
import ms from "ms";
import { Sandbox } from "@vercel/sandbox";
import { setTimeout as sleep } from "timers/promises";
import { createOpencodeClient } from "@opencode-ai/sdk";

type CreateOpenCodeSandboxParams = {
  /** Public or private GitHub repo URL */
  repoUrl: string;

  /** Optional Git revision/branch */
  revision?: string;

  /** vCPUs to allocate to the sandbox (default 4) */
  vcpus?: number;

  /** How long the sandbox may live (default 30m) */
  timeoutMs?: number;

  /** Model ID to use when you send prompts (optional) */
  defaultModelId?: string; // e.g. "claude-3-5-sonnet-20241022"
};

export async function createOpenCodeClientForRepo(
  params: CreateOpenCodeSandboxParams
) {
  const {
    repoUrl,
    revision,
    vcpus = 4,
    timeoutMs = ms("30m"),
    defaultModelId = "openai/gpt-4o-mini",
  } = params;

  // 1. Create sandbox with your GitHub repo
  const sandbox = await Sandbox.create({
    source: {
      type: "git",
      url: repoUrl,
      ...(revision ? { revision } : {}),
    },
    resources: { vcpus },
    timeout: timeoutMs,
    ports: [4096], // OpenCode HTTP server port
    runtime: "node22",
  });

  console.log("[sandbox] Created:", sandbox.sandboxId);
  console.log("[sandbox] Installing OpenCode CLI globally...");

  // 3. Install OpenCode in the VM (requires sudo for global install)
  const installOpenCode = await sandbox.runCommand({
    cmd: "npm",
    args: ["install", "-g", "opencode-ai"],
    stdout: process.stdout,
    stderr: process.stderr,
    env: {
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN!,
    },
    sudo: true,
  });

  if (installOpenCode.exitCode !== 0) {
    throw new Error(
      `[sandbox] OpenCode install failed with code ${installOpenCode.exitCode}`
    );
  }

  console.log("[sandbox] Starting OpenCode server (opencode serve)...");

  // 4. Start OpenCode HTTP server in detached mode so it keeps running
  await sandbox.runCommand({
    cmd: "opencode",
    args: ["serve", "--hostname", "0.0.0.0", "--port", "4096"],
    stdout: process.stdout,
    stderr: process.stderr,
    detached: true,
    env: {
      VERCEL_OIDC_TOKEN: process.env.VERCEL_OIDC_TOKEN!,
    },
  });

  // Give the server a moment to boot (you can replace this with active health checks if you want)
  await sleep(3000);

  // 5. Exposed public URL for the sandbox port
  const baseUrl = sandbox.domain(4096);
  console.log("[sandbox] OpenCode server URL:", baseUrl);

  // 6. Connect with OpenCode SDK
  const client = createOpencodeClient({ baseUrl });

  // 7. Optionally configure Anthropic (or other provider) on the server
  console.log("[opencode] Configuring Anthropic API key via auth.set...");
  await client.auth.set({
    path: { id: "vercel" },
    body: { type: "api", key: process.env.VERCEL_OIDC_TOKEN! },
  });

  // 8. Optionally create a starter session so you can prompt immediately
  console.log("[opencode] Creating initial session...");
  const session = await client.session.create({
    body: { title: "Sandbox session" },
  });

  if (session.error) {
    throw new Error(`[opencode] Failed to create session: ${session.error}`);
  }

  console.log("[opencode] Session ID:", session.data.id);

  // Optionally send an initial prompt that references the repo
  if (defaultModelId) {
    console.log("[opencode] Sending initial prompt against the repo...");
    const promptResult = await client.session.prompt({
      path: { id: session.data.id },
      body: {
        model: {
          providerID: "vercel",
          modelID: defaultModelId,
        },
        parts: [
          {
            type: "text",
            text:
              "You are connected to a Vercel Sandbox VM that has this GitHub repo checked out. " +
              "You can read and modify files via your normal tools. Reply with a short summary " +
              "of the project structure before making any edits.",
          },
        ],
      },
    });

    if (promptResult.error) {
      throw new Error(
        `[opencode] Failed to send initial prompt: ${promptResult.error}`
      );
    }

    console.log(
      "[opencode] Initial prompt response:",
      JSON.stringify(promptResult.data, null, 2)
    );
  }

  // Return both the sandbox (so you can stop it later) and the OpenCode client
  return {
    sandbox,
    client,
    sessionId: session.data.id,
    baseUrl,
  };
}

/**
 * Example usage as a standalone script:
 *
 * node --env-file .env.local --experimental-strip-types ./opencode-sandbox.ts
 */
async function main() {
  const repoUrl = "https://github.com/AnswerOverflow/AnswerOverflow.git";
  const { sandbox, client, sessionId, baseUrl } =
    await createOpenCodeClientForRepo({
      repoUrl,

      defaultModelId: "openai/gpt-4o-mini",
    });

  console.log("[ready] OpenCode client is connected to:", baseUrl);
  console.log("[ready] Session ID:", sessionId);

  // When you're done, you can stop the sandbox:
  await sandbox.stop();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
