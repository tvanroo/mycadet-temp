/**
 * Tests for `conversations new --json` — the flag emits a machine-readable
 * result (incl. the new id) so callers can capture it without scraping the
 * log.
 *
 * Runs the real CLI command against a real AssistantIpcServer on this
 * process's own socket (the preload pins ASSISTANT_IPC_SOCKET_DIR to the
 * per-process tmp root): the command's real `cliIpcCall` connects over the
 * socket, the `conversation_create_cli` route creates a real conversation in
 * the workspace DB, and assertions read the store back.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { Command } from "commander";

import { AssistantIpcServer } from "../../../ipc/assistant-server.js";
import { getConversation } from "../../../persistence/conversation-crud.js";
import { initializeDb } from "../../../persistence/db-init.js";

// The IPC route writes through the real store — run the migration chain once
// so the workspace DB has its schema before the first command runs.
await initializeDb();

const { registerConversationsCommand } = await import("../conversations.js");

let server: AssistantIpcServer | null = null;

/** Boot a real IPC server on this process's socket for the calling test. */
async function startServer(): Promise<void> {
  server = new AssistantIpcServer({ watchdogIntervalMs: 0 });
  await server.start();
  // Let the listener settle before the client connects.
  await new Promise((resolve) => setTimeout(resolve, 50));
}

afterEach(() => {
  server?.stop();
  server = null;
});

interface RunResult {
  code: number;
  out: string;
  err: string;
}

async function runNew(args: string[]): Promise<RunResult> {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  registerConversationsCommand(program);
  // The real CLI logger writes plain message text to stdout (info) and
  // stderr (error) — capture the streams the commander plumbing leaves alone.
  const out: string[] = [];
  const err: string[] = [];
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;
  const capture =
    (sink: string[]) =>
    (chunk: string | Uint8Array): boolean => {
      sink.push(
        typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
      );
      return true;
    };
  process.stdout.write = capture(out) as typeof process.stdout.write;
  process.stderr.write = capture(err) as typeof process.stderr.write;
  try {
    await program.parseAsync(["node", "assistant", "conversations", ...args]);
  } catch {
    // commander's exitOverride throws on exit; the command's own
    // process.exitCode carries the status.
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  const code = Number(process.exitCode ?? 0);
  process.exitCode = 0;
  return { code, out: out.join(""), err: err.join("") };
}

/** Parse the last stdout line as JSON (the `--json` path emits one JSON line). */
function jsonOutput(r: RunResult): Record<string, unknown> {
  const lines = r.out.trim().split("\n");
  const last = lines[lines.length - 1];
  if (!last) {
    throw new Error("no stdout output captured");
  }
  return JSON.parse(last) as Record<string, unknown>;
}

let savedRunId: string | undefined;

beforeEach(() => {
  process.exitCode = 0;
  // Clear __SCHEDULE_RUN_ID so it can't leak conversationType into the body.
  savedRunId = process.env.__SCHEDULE_RUN_ID;
  delete process.env.__SCHEDULE_RUN_ID;
});

describe("conversations new --json", () => {
  test("--json emits a parseable result with the new conversation id", async () => {
    await startServer();
    const r = await runNew(["new", "GitHub watcher", "--json"]);
    expect(r.code).toBe(0);
    const parsed = jsonOutput(r);
    expect(parsed).toMatchObject({
      ok: true,
      title: "GitHub watcher",
      messagesInserted: 0,
    });
    expect(typeof parsed.id).toBe("string");
    expect(typeof parsed.conversationKey).toBe("string");
    // The conversation really exists in the workspace DB.
    const row = await getConversation(parsed.id as string);
    expect(row?.title).toBe("GitHub watcher");
  });

  test("without --json, prints the human line and not JSON", async () => {
    await startServer();
    const r = await runNew(["new", "Notes"]);
    expect(r.code).toBe(0);
    const lines = r.out.trim().split("\n");
    const last = lines[lines.length - 1] ?? "";
    expect(last).toMatch(
      /^Created conversation: Notes \(\S.+\), conversation key: \S+/,
    );
    // The parenthesized id in the human line is the real row's id.
    const id = last.match(/\(([^)]+)\)/)?.[1] ?? "";
    const row = await getConversation(id);
    expect(row?.title).toBe("Notes");
    expect(() => JSON.parse(last)).toThrow();
  });

  test("--json reports a real connect failure as { ok: false } and exits non-zero", async () => {
    // No server started: the real client must surface the real connect error.
    const r = await runNew(["new", "X", "--json"]);
    expect(r.code).toBe(1);
    const parsed = jsonOutput(r);
    expect(parsed.ok).toBe(false);
    expect(String(parsed.error)).toContain(
      "Could not connect to the assistant at",
    );
  });

  test("--json reports a seed-file error as { ok: false } before any IPC", async () => {
    await startServer();
    const r = await runNew([
      "new",
      "X",
      "--content-file",
      "/no/such/seed-file.json",
      "--json",
    ]);
    expect(r.code).toBe(1);
    const parsed = jsonOutput(r);
    expect(parsed).toMatchObject({ ok: false });
    // Validation fails client-side: the error names the seed file, not IPC.
    expect(String(parsed.error)).toContain("seed-file.json");
  });

  test("under a script-mode schedule, creates the conversation as scheduled", async () => {
    process.env.__SCHEDULE_RUN_ID = "run-9";
    await startServer();
    const r = await runNew(["new", "GitHub watcher", "--json"]);
    expect(r.code).toBe(0);
    const parsed = jsonOutput(r);
    expect(parsed.ok).toBe(true);
    // The scheduled type persisted on the real row.
    const row = await getConversation(parsed.id as string);
    expect(row?.conversationType).toBe("scheduled");
  });
});

afterEach(() => {
  if (savedRunId !== undefined) {
    process.env.__SCHEDULE_RUN_ID = savedRunId;
  }
  process.exitCode = 0;
});
