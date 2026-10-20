import { afterEach, describe, expect, mock, test } from "bun:test";

// The heal runs where the user's terminal is — the foreground `cadet tunnel`
// command — so its stdin gate and its line reader are process boundaries the
// tests pin here, and the holder discovery/stop calls are the ngrok module's
// own (mocked to their recorded calls).
const realEnsureBinary = await import("../lib/ensure-binary.js");
const realNgrok = await import("../lib/tunnels/ngrok.js");

const promptLog: string[] = [];
let readAnswer = "n";
let holderPid: number | null = null;
const stoppedPids: number[] = [];
let stopResult = true;

mock.module("../lib/ensure-binary.js", () => ({
  ...realEnsureBinary,
  readLineText: (prompt: string): Promise<string> => {
    promptLog.push(prompt);
    return Promise.resolve(readAnswer);
  },
}));

mock.module("../lib/tunnels/ngrok.js", () => ({
  ...realNgrok,
  ngrokHolderPid: (): Promise<number | null> => Promise.resolve(holderPid),
  stopNgrokHolderPid: (pid: number): Promise<boolean> => {
    stoppedPids.push(pid);
    return Promise.resolve(stopResult);
  },
}));

const { offerStopNgrokHolder } = await import("../lib/tunnel.js");

const ONLINE_LOG = [
  "Starting ngrok tunnel to localhost:7841...",
  't=2026-10-19T15:20:19-0400 lvl=eror msg="session closing" obj=tunnels.session err="failed to start tunnel: The endpoint \'https://camping-trustful-fog.ngrok-free.dev\' is already online. Either\\n1. stop your existing endpoint first, or\\n2. start both endpoints with `--pooling-enabled` to load balance between them.\\r\\n\\r\\nERR_NGROK_334\\r\\n"',
].join("\n");

const OTHER_FAILURE_LOG = [
  "Starting ngrok tunnel to localhost:7841...",
  "creating tunnel session failed: dial tcp 3.219.x.x:443: connection refused",
].join("\n");

let stdinWasTty = false;
function withTty(tty: boolean): void {
  stdinWasTty = "isTTY" in process.stdin && process.stdin.isTTY;
  Object.defineProperty(process.stdin, "isTTY", {
    value: tty,
    configurable: true,
  });
}

afterEach(() => {
  Object.defineProperty(process.stdin, "isTTY", {
    value: stdinWasTty,
    configurable: true,
  });
  promptLog.length = 0;
  readAnswer = "n";
  holderPid = null;
  stoppedPids.length = 0;
  stopResult = true;
});

describe("offerStopNgrokHolder — the foreground confirm-first heal", () => {
  test("a log without the endpoint collision never prompts", async () => {
    withTty(true);
    holderPid = 4242;
    expect(await offerStopNgrokHolder(OTHER_FAILURE_LOG)).toBe(false);
    expect(promptLog).toEqual([]);
    expect(stoppedPids).toEqual([]);
  });

  test("a detached (non-TTY) stdin never prompts", async () => {
    withTty(false);
    holderPid = 4242;
    expect(await offerStopNgrokHolder(ONLINE_LOG)).toBe(false);
    expect(promptLog).toEqual([]);
    expect(stoppedPids).toEqual([]);
  });

  test("an unidentified holder is never prompted about", async () => {
    withTty(true);
    holderPid = null;
    expect(await offerStopNgrokHolder(ONLINE_LOG)).toBe(false);
    expect(promptLog).toEqual([]);
    expect(stoppedPids).toEqual([]);
  });

  test("a confirmed stop stops the holder and asks for a relaunch", async () => {
    withTty(true);
    holderPid = 4242;
    readAnswer = "y";
    expect(await offerStopNgrokHolder(ONLINE_LOG)).toBe(true);
    expect(promptLog).toEqual([
      "Stop the other ngrok tunnel and start a new one pointing at this installation? [Y/n] ",
    ]);
    expect(stoppedPids).toEqual([4242]);
  });

  test("a declined stop keeps the holder and stays failed", async () => {
    withTty(true);
    holderPid = 4242;
    readAnswer = "n";
    expect(await offerStopNgrokHolder(ONLINE_LOG)).toBe(false);
    expect(promptLog).toHaveLength(1);
    expect(stoppedPids).toEqual([]);
  });

  test("a failed stop stays failed", async () => {
    withTty(true);
    holderPid = 4242;
    readAnswer = "y";
    stopResult = false;
    expect(await offerStopNgrokHolder(ONLINE_LOG)).toBe(false);
    expect(stoppedPids).toEqual([4242]);
  });
});
