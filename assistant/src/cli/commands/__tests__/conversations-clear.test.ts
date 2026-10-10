/**
 * Tests for `conversations clear` — destructive confirmation flow plus the
 * real clear.
 *
 * Runs the real CLI command against a real AssistantIpcServer on this
 * process's own socket (the preload pins ASSISTANT_IPC_SOCKET_DIR to the
 * per-process tmp root): the command's real `cliIpcCall` connects, the
 * `conversations_clear_cli` route really clears the workspace DB, and the
 * assertions read the store back. The readline mock only simulates the user
 * typing (an I/O harness, not a fake of the code under test).
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import { Command } from "commander";

import { AssistantIpcServer } from "../../../ipc/assistant-server.js";
import {
  createConversation,
  getConversation,
} from "../../../persistence/conversation-crud.js";
import { initializeDb } from "../../../persistence/db-init.js";

// The IPC route writes through the real store — run the migration chain once
// so the workspace DB has its schema before the first command runs.
await initializeDb();

const { registerConversationsCommand } = await import("../conversations.js");

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

/** Seed real conversations and return their ids. */
async function seedConversations(n: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const row = await createConversation({ title: `Clear me ${i}` });
    ids.push(row.id);
  }
  return ids;
}

// The CLI's "Cleared N" line counts ACTIVE daemon sessions (in-memory
// conversation objects), not DB rows; a workspace with rows but no active
// sessions reports "Cleared 0 conversations" while the route still really
// wipes the DB. Spinning active sessions requires a resolved default LLM
// provider (the providers/registry family, mocked elsewhere), so these tests
// pin the row-level contract: rows exist before, are gone after.

// null simulates EOF (Ctrl+D): readline emits close without answering.
let promptAnswer: string | null = "";
let prompted = false;
let stdoutOutput = "";
let stderrOutput = "";

function fakeInterface() {
  let onClose = () => {};
  return {
    question: (_q: string, cb: (a: string) => void) => {
      prompted = true;
      if (promptAnswer === null) {
        queueMicrotask(() => onClose());
      } else {
        cb(promptAnswer);
      }
    },
    on: (event: string, cb: () => void) => {
      if (event === "close") {
        onClose = cb;
      }
    },
    close: () => {},
  };
}
mock.module("node:readline", () => ({
  default: { createInterface: fakeInterface },
  createInterface: fakeInterface,
}));

async function runClear(args: string[]): Promise<number> {
  const program = new Command();
  program.exitOverride();
  program.configureOutput({ writeErr: () => {}, writeOut: () => {} });
  registerConversationsCommand(program);
  const origOut = process.stdout.write;
  const capture =
    (sink: string[]) =>
    (chunk: string | Uint8Array): boolean => {
      sink.push(
        typeof chunk === "string" ? chunk : new TextDecoder().decode(chunk),
      );
      return true;
    };
  const outSink: string[] = [];
  process.stdout.write = capture(outSink) as typeof process.stdout.write;
  try {
    await program.parseAsync([
      "node",
      "assistant",
      "conversations",
      "clear",
      ...args,
    ]);
  } finally {
    process.stdout.write = origOut;
  }
  stdoutOutput = outSink.join("");
  const code = Number(process.exitCode ?? 0);
  process.exitCode = 0;
  return code;
}

const savedIsTTY = process.stdin.isTTY;
const realStderrWrite = process.stderr.write.bind(process.stderr);

beforeEach(() => {
  prompted = false;
  stdoutOutput = "";
  stderrOutput = "";
  process.exitCode = 0;
  process.stderr.write = ((chunk: string) => {
    stderrOutput += chunk;
    return true;
  }) as typeof process.stderr.write;
});

afterEach(() => {
  process.stdin.isTTY = savedIsTTY;
  process.stderr.write = realStderrWrite;
});

describe("conversations clear", () => {
  test("interactive: Enter cancels without clearing", async () => {
    await startServer();
    const ids = await seedConversations(2);
    process.stdin.isTTY = true;
    promptAnswer = "";
    expect(await runClear([])).toBe(0);
    expect(prompted).toBe(true);
    expect(stdoutOutput).toContain("Cancelled");
    // Nothing was cleared.
    for (const id of ids) {
      expect(await getConversation(id)).not.toBeNull();
    }
  });

  test("interactive: y clears every conversation for real", async () => {
    await startServer();
    const ids = await seedConversations(3);
    process.stdin.isTTY = true;
    promptAnswer = "y";
    expect(await runClear([])).toBe(0);
    // The route accepted the destructive confirmation and really cleared.
    expect(stdoutOutput).toContain("Cleared 0 conversations");
    for (const id of ids) {
      expect(await getConversation(id)).toBeNull();
    }
  });

  test("non-TTY without --force fails fast naming the flag", async () => {
    await startServer();
    const ids = await seedConversations(1);
    process.stdin.isTTY = false;
    expect(await runClear([])).toBe(1);
    expect(prompted).toBe(false);
    expect(stderrOutput).toContain("--force");
    expect(await getConversation(ids[0]!)).not.toBeNull();
  });

  test("interactive: EOF cancels instead of hanging", async () => {
    await startServer();
    const ids = await seedConversations(1);
    process.stdin.isTTY = true;
    promptAnswer = null;
    expect(await runClear([])).toBe(0);
    expect(stdoutOutput).toContain("Cancelled");
    expect(await getConversation(ids[0]!)).not.toBeNull();
  });

  test("non-TTY with --force clears without prompting", async () => {
    await startServer();
    const ids = await seedConversations(3);
    process.stdin.isTTY = false;
    expect(await runClear(["--force"])).toBe(0);
    expect(prompted).toBe(false);
    expect(stdoutOutput).toContain("Cleared 0 conversations");
    for (const id of ids) {
      expect(await getConversation(id)).toBeNull();
    }
  });
});
