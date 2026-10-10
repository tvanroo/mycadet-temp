/**
 * Tests for `assistant conversations search`.
 *
 * Runs the real CLI command against a real AssistantIpcServer on this
 * process's own socket (the preload pins ASSISTANT_IPC_SOCKET_DIR to the
 * per-process tmp root): the command's real `cliIpcCall` connects, the
 * `conversations_search` route queries the real workspace DB, and assertions
 * read results back.
 *
 * Content matching rides the Qdrant-backed lexical index (external service —
 * it fails soft to title-only matching in tests), so these tests seed
 * title matches, the deterministic arm. The one failure-path test keeps the
 * documented process-boundary shim for `exitFromIpcResult` (the real one
 * ends the process; spreading the real module and replacing only that
 * function keeps the whole IPC stack real).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { Command } from "commander";

import { AssistantIpcServer } from "../../../ipc/assistant-server.js";
import * as realCliClient from "../../../ipc/cli-client.js";
import { createConversation } from "../../../persistence/conversation-crud.js";
import { initializeDb } from "../../../persistence/db-init.js";
import { reportIpcFailureWithoutExiting } from "../../__tests__/run-assistant-command.js";

// Process-boundary shim: the real `exitFromIpcResult` calls process.exit,
// which would kill the test runner. Everything else in the module — the real
// `cliIpcCall` included — stays real.
mock.module("../../../ipc/cli-client.js", () => ({
  ...realCliClient,
  exitFromIpcResult: (r: { error?: string; statusCode?: number }) => {
    reportIpcFailureWithoutExiting(r);
  },
}));

// The IPC route queries the real store — run the migration chain once so the
// workspace DB has its schema before the first command runs.
await initializeDb();

const { registerConversationsCommand } = await import("../conversations.js");

let server: AssistantIpcServer | null = null;

// The workspace DB persists across tests in this file-process, so every
// search seeds titles around a term unique to its own test.
function uniqueTerm(): string {
  return `flux-${crypto.randomUUID().slice(0, 8)}`;
}

async function startServer(): Promise<void> {
  server = new AssistantIpcServer({ watchdogIntervalMs: 0 });
  await server.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

afterEach(() => {
  server?.stop();
  server = null;
});

async function runSearch(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  process.stdout.write = ((chunk: unknown) => {
    stdoutChunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: unknown) => {
    stderrChunks.push(typeof chunk === "string" ? chunk : String(chunk));
    return true;
  }) as typeof process.stderr.write;

  const program = new Command();
  program.exitOverride();
  program.configureOutput({
    writeErr: (s) => {
      stderrChunks.push(s);
    },
    writeOut: (s) => {
      stdoutChunks.push(s);
    },
  });
  registerConversationsCommand(program);
  try {
    await program.parseAsync(["node", "assistant", "conversations", ...args]);
  } catch (err) {
    const isHelp =
      typeof err === "object" &&
      err !== null &&
      "code" in err &&
      (err as { code?: string }).code === "commander.helpDisplayed";
    if (!isHelp && (process.exitCode === 0 || process.exitCode === undefined)) {
      process.exitCode = 1;
    }
    if (
      !isHelp &&
      err instanceof Error &&
      !stderrChunks.some((s) => s.includes(err.message))
    ) {
      stderrChunks.push(err.message);
    }
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
  const code = Number(process.exitCode ?? 0);
  process.exitCode = 0;
  return {
    code,
    stdout: stdoutChunks.join(""),
    stderr: stderrChunks.join(""),
  };
}

beforeEach(() => {
  process.exitCode = 0;
});

afterEach(() => {
  process.exitCode = 0;
});

describe("conversations search", () => {
  test("finds a real conversation by title substring", async () => {
    await startServer();
    const term = uniqueTerm();
    const row = await createConversation({ title: `Quarterly ${term} review` });
    await createConversation({ title: "Unrelated planning" });
    const { code, stdout } = await runSearch(["search", term]);
    expect(code).toBe(0);
    expect(stdout).toContain(row.id);
    expect(stdout).toContain(`Quarterly ${term} review`);
    expect(stdout).not.toContain("Unrelated planning");
  });

  test("passes --limit through to the real query", async () => {
    await startServer();
    const term = uniqueTerm();
    const rows = [
      await createConversation({ title: `${term} one` }),
      await createConversation({ title: `${term} two` }),
      await createConversation({ title: `${term} three` }),
    ];
    const { code, stdout } = await runSearch(["search", term, "--limit", "2"]);
    expect(code).toBe(0);
    // Exactly two of the three seeded rows came back.
    const listed = rows.filter((r) => stdout.includes(r.id));
    expect(listed).toHaveLength(2);
  });

  test("prints a no-match line when the DB has no matches", async () => {
    await startServer();
    await createConversation({ title: "Unrelated planning" });
    const term = uniqueTerm();
    const { code, stdout } = await runSearch(["search", term]);
    expect(code).toBe(0);
    expect(stdout).toBe(`No conversations matched "${term}"\n`);
  });

  test("--json emits the real result payload", async () => {
    await startServer();
    const term = uniqueTerm();
    const row = await createConversation({ title: `${term} json` });
    const { code, stdout } = await runSearch(["search", term, "--json"]);
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as {
      query: string;
      results: Array<{
        conversationId: string;
        conversationTitle: string | null;
      }>;
    };
    expect(parsed.query).toBe(term);
    expect(parsed.results).toHaveLength(1);
    expect(parsed.results[0]).toMatchObject({
      conversationId: row.id,
      conversationTitle: `${term} json`,
    });
  });

  test("--json reports a real connect failure as { ok: false } and exits non-zero", async () => {
    // No server started: the real client surfaces the real connect error.
    const { code, stdout } = await runSearch(["search", "flux", "--json"]);
    expect(code).toBe(10);
    const parsed = JSON.parse(stdout) as { ok: boolean; error?: string };
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toContain("Could not connect to the assistant at");
  });

  test("rejects a whitespace-only term before IPC", async () => {
    await startServer();
    const { code, stderr } = await runSearch(["search", "   "]);
    expect(code).toBe(1);
    expect(stderr).toContain("Search term must be a non-empty string");
  });

  test("--json rejects a whitespace-only term as { ok: false }", async () => {
    await startServer();
    const { code, stdout } = await runSearch(["search", "   ", "--json"]);
    expect(code).toBe(1);
    expect(JSON.parse(stdout)).toMatchObject({
      ok: false,
      error: expect.stringContaining("Search term must be a non-empty string"),
    });
  });

  test("rejects a non-numeric --limit before IPC", async () => {
    await startServer();
    const { code, stderr } = await runSearch([
      "search",
      "flux",
      "--limit",
      "all",
    ]);
    expect(code).toBe(1);
    expect(stderr).toContain("Invalid --limit value");
  });

  test("search --help documents the term, --limit, and examples", async () => {
    const { code, stdout } = await runSearch(["search", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain(
      "Search conversations by title and message content",
    );
    expect(stdout).toContain("--limit");
    expect(stdout).toContain(
      'assistant conversations search "project planning"',
    );
    expect(stdout).toContain("--json");
  });
});
