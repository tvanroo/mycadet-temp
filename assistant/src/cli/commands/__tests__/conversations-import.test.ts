/**
 * Tests for the `assistant conversations import` CLI command.
 *
 * Runs the real CLI command against a real AssistantIpcServer on this
 * process's own socket (the preload pins ASSISTANT_IPC_SOCKET_DIR to the
 * per-process tmp root): the command's real `cliIpcCall` connects, the
 * `conversations_import` route really writes conversations, messages, and
 * source-key bindings into the workspace DB, and assertions read the store
 * back. The one failure-path test keeps the documented process-boundary shim
 * for `exitFromIpcResult` (the real one ends the process).
 *
 * Validates:
 *   - Valid input → the route imports the file's conversations for real
 *   - sourceKey → dedupe binding (re-import skips)
 *   - Empty conversations array → human output, no import
 *   - Invalid JSON / missing fields → client-side validation, exitCode = 1
 *   - IPC unreachable → exit shim, exitCode = 1
 *   - Success + --json → JSON output
 *   - --file <path> → reads from file
 *   - Missing file → error and exitCode = 1
 */

import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { Command } from "commander";

import { AssistantIpcServer } from "../../../ipc/assistant-server.js";
import * as realCliClient from "../../../ipc/cli-client.js";
import { getMessages } from "../../../persistence/conversation-crud.js";
import { listConversations } from "../../../persistence/conversation-queries.js";
import { getDb } from "../../../persistence/db-connection.js";
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

// The IPC route writes through the real store — run the migration chain once
// so the workspace DB has its schema before the first command runs.
await initializeDb();

const { registerConversationsImportCommand } =
  await import("../conversations-import.js");
const { applyCommandHelp } = await import("../../lib/cli-command-help.js");
const { conversationsHelp } = await import("../conversations.help.js");

let server: AssistantIpcServer | null = null;

async function startServer(): Promise<void> {
  server = new AssistantIpcServer({ watchdogIntervalMs: 0 });
  await server.start();
  await new Promise((resolve) => setTimeout(resolve, 50));
}

afterEach(() => {
  server?.stop();
  server = null;
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Temp directory used for file-based tests. */
let tmpDir: string;

function makeTmpFile(content: string, filename = "import.json"): string {
  const filePath = join(tmpDir, filename);
  writeFileSync(filePath, content, "utf-8");
  return filePath;
}

let stdoutOutput = "";
let stderrOutput = "";

async function runCommand(args: string[]): Promise<{ exitCode: number }> {
  process.exitCode = 0;
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];
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
  process.stdout.write = capture(stdoutChunks) as typeof process.stdout.write;
  process.stderr.write = capture(stderrChunks) as typeof process.stderr.write;
  try {
    const program = new Command();
    program.exitOverride();
    program.configureOutput({
      writeErr: () => {},
      writeOut: () => {},
    });
    const conversations = program.command("conversations");
    applyCommandHelp(conversations, conversationsHelp);
    registerConversationsImportCommand(conversations);
    await program.parseAsync(["node", "assistant", ...args]);
  } catch {
    if (process.exitCode === 0) {
      process.exitCode = 1;
    }
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
  }
  stdoutOutput = stdoutChunks.join("");
  stderrOutput = stderrChunks.join("");
  const exitCode = process.exitCode ?? 0;
  process.exitCode = 0;
  return { exitCode };
}

function findImportedRow(title: string): { id: string } | undefined {
  return listConversations().find((r) => r.title === title);
}

function jsonOut(): Record<string, unknown> {
  const line = stdoutOutput.split("\n").find((l) => l.startsWith("{"));
  if (!line) {
    throw new Error(`no JSON line in stdout: ${stdoutOutput.slice(0, 200)}`);
  }
  return JSON.parse(line) as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "conv-import-test-"));
  stdoutOutput = "";
  stderrOutput = "";
  process.exitCode = 0;
  // A fresh workspace auto-seeds default conversations and the DB persists
  // across tests in this file-process — wipe the conversation tables so each
  // test asserts against exactly what it imported.
  const db = getDb();
  db.run("DELETE FROM external_conversation_bindings");
  db.run("DELETE FROM messages");
  db.run("DELETE FROM conversations");
});

afterEach(() => {
  process.exitCode = 0;
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
});

// ---------------------------------------------------------------------------
// Valid import via --file
// ---------------------------------------------------------------------------

describe("conversations import — valid input", () => {
  test("imports the conversations from --file for real", async () => {
    await startServer();
    const payload = {
      conversations: [
        {
          title: "Test Chat",
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi there!" },
          ],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(0);
    // The route really wrote the row and its messages.
    const row = findImportedRow("Test Chat");
    expect(row).toBeDefined();
    const messages = getMessages(row!.id);
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content ?? messages[0]).toBeDefined();
  });

  test("with sourceKey the re-import skips instead of duplicating", async () => {
    await startServer();
    const payload = {
      conversations: [
        {
          sourceKey: `chatgpt:${crypto.randomUUID()}`,
          title: "Exported Chat",
          createdAt: 1700000000000,
          messages: [{ role: "user", content: "Hello" }],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const first = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);
    expect(first.exitCode).toBe(0);
    expect(stdoutOutput).toContain("Imported 1 conversation(s)");

    // The sourceKey binding is real: the same file again is skipped.
    const second = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);
    expect(second.exitCode).toBe(0);
    expect(stdoutOutput).toContain("Skipped 1");
  });
});

// ---------------------------------------------------------------------------
// Empty conversations array
// ---------------------------------------------------------------------------

describe("conversations import — empty array", () => {
  test("prints the no-op line without importing", async () => {
    await startServer();
    const payload = { conversations: [] };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(0);
    expect(stdoutOutput).toContain("No conversations to import");
    expect(listConversations()).toHaveLength(0);
  });

  test("--json outputs JSON for empty array without importing", async () => {
    await startServer();
    const payload = { conversations: [] };
    const filePath = makeTmpFile(JSON.stringify(payload));

    await runCommand(["conversations", "import", "--file", filePath, "--json"]);

    const parsed = jsonOut();
    expect(parsed.ok).toBe(true);
    expect(parsed.imported).toBe(0);
    expect(listConversations()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Invalid JSON
// ---------------------------------------------------------------------------

describe("conversations import — invalid JSON", () => {
  test("fails client-side for invalid JSON, imports nothing", async () => {
    await startServer();
    const filePath = makeTmpFile("this is not json");

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(1);
    expect(listConversations()).toHaveLength(0);
  });

  test("--json outputs error JSON for invalid JSON", async () => {
    await startServer();
    const filePath = makeTmpFile("{bad json}");

    await runCommand(["conversations", "import", "--file", filePath, "--json"]);

    const parsed = jsonOut();
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

describe("conversations import — validation errors", () => {
  test("missing title fails client-side", async () => {
    await startServer();
    const payload = {
      conversations: [
        {
          messages: [{ role: "user", content: "Hello" }],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(1);
    expect(listConversations()).toHaveLength(0);
  });

  test("empty messages array fails client-side", async () => {
    await startServer();
    const payload = {
      conversations: [{ title: "Chat", messages: [] }],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(1);
    expect(listConversations()).toHaveLength(0);
  });

  test("missing message role fails client-side", async () => {
    await startServer();
    const payload = {
      conversations: [
        {
          title: "Chat",
          messages: [{ content: "Hello" }],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(1);
    expect(listConversations()).toHaveLength(0);
  });

  test("non-object input fails client-side", async () => {
    await startServer();
    const filePath = makeTmpFile(JSON.stringify([1, 2, 3]));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    expect(exitCode).toBe(1);
    expect(listConversations()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Missing file
// ---------------------------------------------------------------------------

describe("conversations import — file errors", () => {
  test("missing --file path fails naming the problem", async () => {
    await startServer();
    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      "/nonexistent/path/import.json",
    ]);

    expect(exitCode).toBe(1);
    expect(stderrOutput + stdoutOutput).toContain("File not found");
  });
});

// ---------------------------------------------------------------------------
// IPC unreachable
// ---------------------------------------------------------------------------

describe("conversations import — IPC error", () => {
  test("surfaces the real connect failure through the exit shim", async () => {
    // No server started: the real client fails to connect and the command
    // reports the failure (the shim keeps the runner alive).
    const payload = {
      conversations: [
        {
          title: "Test",
          messages: [{ role: "user", content: "Hello" }],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    const { exitCode } = await runCommand([
      "conversations",
      "import",
      "--file",
      filePath,
    ]);

    // Transport failures carry no statusCode → the real exit matrix yields 10.
    expect(exitCode).toBe(10);
    expect(stderrOutput).toContain("Could not connect to the assistant at");
  });
});

// ---------------------------------------------------------------------------
// Success output formats
// ---------------------------------------------------------------------------

describe("conversations import — output formats", () => {
  test("success without --json outputs a real human-readable summary", async () => {
    await startServer();
    const payload = {
      conversations: [
        {
          title: "Chat 1",
          messages: [{ role: "user", content: "Hello" }],
        },
        {
          title: "Chat 2",
          messages: [
            { role: "user", content: "One" },
            { role: "assistant", content: "Two" },
            { role: "user", content: "Three" },
          ],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    await runCommand(["conversations", "import", "--file", filePath]);

    expect(stdoutOutput).toContain("Imported 2 conversation(s)");
    expect(stdoutOutput).toContain("4 message(s)");
  });

  test("success with --json outputs the real structured result", async () => {
    await startServer();
    const payload = {
      conversations: [
        {
          title: "Chat",
          messages: [
            { role: "user", content: "Hello" },
            { role: "assistant", content: "Hi" },
            { role: "user", content: "How are you?" },
            { role: "assistant", content: "Fine" },
            { role: "user", content: "Bye" },
          ],
        },
      ],
    };
    const filePath = makeTmpFile(JSON.stringify(payload));

    await runCommand(["conversations", "import", "--file", filePath, "--json"]);

    const parsed = jsonOut();
    expect(parsed.ok).toBe(true);
    expect(parsed.imported).toBe(1);
    expect(parsed.messages).toBe(5);
  });
});
