/**
 * Regression pin: scheduled retention cleanup must run while memory is
 * disabled.
 *
 * `runMemoryJobsOnce` used to gate the cleanup scheduler on the memory master
 * switch (`options.enableScheduledCleanup === true && memoryEnabled`), so an
 * install running with `memory.enabled: false` never enqueued a single
 * `prune_old_*` job — every retention knob
 * (`memory.cleanup.llmRequestLogRetentionMs`, `auditLog.retentionDays`,
 * `memory.cleanup.conversationRetentionDays`) was silently a no-op and its
 * table grew forever. The prune handlers are DB hygiene (batched DELETEs, no
 * embedding or LLM work), so the scheduler is now gated on
 * `memory.cleanup.enabled` alone and the memory-off claim filter includes the
 * cleanup job types (they ride the fast lane).
 *
 * Zero-leak: real config (set-config helper), real DB, real prune handlers —
 * no mock.module.
 */
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  setDefaultTimeout,
  test,
} from "bun:test";

import { eq } from "drizzle-orm";

import { setConfig } from "./helpers/set-config.js";

// beforeAll runs initializeDb(), which can exceed bun's 5s default hook
// timeout when the CI runner is saturated (one bun process per test file,
// workers = CPU count). Raise the file-level default so DB setup isn't
// killed mid-flight. Each test file runs in its own process, so this
// doesn't leak.
setDefaultTimeout(30_000);

const HOUR = 60 * 60 * 1000;

// ── Config seed (before the tested module reads config) ────────────

// Memory OFF (the stranded state), cleanup scheduler ON with a one-hour
// LLM-request-log retention — the shape that used to enqueue nothing at all.
// Re-seeded per test: the loader reads config.json lazily per getConfig(),
// and one describe flips cleanup.enabled off — without the re-seed that
// mutation would leak into the following tests.
const seedMemoryConfig = (cleanupEnabled: boolean): void => {
  setConfig("memory", {
    enabled: false,
    cleanup: { enabled: cleanupEnabled, llmRequestLogRetentionMs: HOUR },
  });
};

seedMemoryConfig(true);

import { resetCleanupScheduleThrottle } from "../persistence/cleanup-schedule-state.js";
import { getMemoryDb } from "../persistence/db-connection.js";
import { initializeDb } from "../persistence/db-init.js";
import { memoryJobs } from "../persistence/schema/index.js";
import { registerMemoryPluginJobHandlers } from "../plugins/defaults/memory/job-handler-registration.js";
import { runMemoryJobsOnce } from "../plugins/defaults/memory/jobs-worker.js";

const llmPruneRows = () => {
  const db = getMemoryDb();
  if (!db) {
    return [];
  }
  return db
    .select()
    .from(memoryJobs)
    .where(eq(memoryJobs.type, "prune_old_llm_request_logs"))
    .all();
};

describe("scheduled cleanup while memory is disabled", () => {
  beforeAll(async () => {
    registerMemoryPluginJobHandlers();
    await initializeDb();
  });

  beforeEach(() => {
    const db = getMemoryDb()!;
    db.run("DELETE FROM memory_jobs");
    resetCleanupScheduleThrottle();
    seedMemoryConfig(true);
  });

  test("the cleanup scheduler still enqueues retention prune jobs", async () => {
    const processed = await runMemoryJobsOnce({ enableScheduledCleanup: true });

    // The idle tick enqueues due cleanup jobs and claims nothing — the queue
    // was empty when the claim ran; the prune rows land after it.
    expect(processed).toBe(0);

    const rows = llmPruneRows();
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]!.status).toBe("pending");
    expect(JSON.parse(rows[0]!.payload)).toEqual({ retentionMs: HOUR });
  });

  test("cleanup disabled → nothing is enqueued while memory is off", async () => {
    setConfig("memory", {
      enabled: false,
      cleanup: { enabled: false, llmRequestLogRetentionMs: HOUR },
    });

    await runMemoryJobsOnce({ enableScheduledCleanup: true });

    expect(llmPruneRows()).toHaveLength(0);
  });

  test("the enqueued prune job is claimable and completes", async () => {
    await runMemoryJobsOnce({ enableScheduledCleanup: true });
    expect(llmPruneRows().length).toBeGreaterThan(0);

    // Second tick: the prune job is claimed (fast lane) and its real handler
    // runs against the real DB. The request-log table is empty, so the
    // handler deletes zero rows and completes without re-enqueueing.
    const processed = await runMemoryJobsOnce({ enableScheduledCleanup: true });
    expect(processed).toBeGreaterThan(0);

    const rows = llmPruneRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("completed");
  });
});
