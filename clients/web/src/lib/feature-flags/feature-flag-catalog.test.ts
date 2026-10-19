import { afterEach, describe, expect, test } from "bun:test";

import {
  ASSISTANT_FLAG_DEFAULTS,
  CLIENT_FLAG_DEFAULTS,
  getEnvFlagOverridesForScope,
  scopeIncludes,
} from "@/lib/feature-flags/feature-flag-catalog";

const originalWindow = (globalThis as Record<string, unknown>).window;

afterEach(() => {
  (globalThis as Record<string, unknown>).window = originalWindow;
});

describe("feature flag catalog", () => {
  test("exposes cadet hosted inference as an assistant flag defaulting off", () => {
    expect(ASSISTANT_FLAG_DEFAULTS.cadetHostedInference).toBe(false);
    expect("cadetHostedInference" in CLIENT_FLAG_DEFAULTS).toBe(false);
  });


















});

describe("getEnvFlagOverridesForScope", () => {
  test("returns empty bool and str maps when no overrides are present", () => {
    const result = getEnvFlagOverridesForScope("client");
    expect(result).toEqual({ bool: {}, str: {} });
  });

  test("filters client-scoped flags and separates bool/str", () => {
    (globalThis as Record<string, unknown>).window = {
      __CADET_FLAG_OVERRIDES__: {
        // client-only flag (boolean)
        "internal-thread-actions": true,
        // assistant-only flag (boolean) — should be excluded from client scope
        "cadet-hosted-inference": true,
      },
    };

    const result = getEnvFlagOverridesForScope("client");
    expect(result.bool).toEqual({ internalThreadActions: true });
    expect(result.str).toEqual({});
    expect(result.bool).not.toHaveProperty("cadetHostedInference");
  });

  test("boolean flags keep case-insensitive env coercion", () => {
    (globalThis as Record<string, unknown>).window = undefined;
    for (const raw of ["on", "ON"]) {
      process.env.VITE_CADET_FLAG_INTERNAL_THREAD_ACTIONS = raw;
      try {
        const result = getEnvFlagOverridesForScope("client");
        expect(result.bool.internalThreadActions).toBe(true);
        expect(result.str).not.toHaveProperty("internalThreadActions");
      } finally {
        delete process.env.VITE_CADET_FLAG_INTERNAL_THREAD_ACTIONS;
      }
    }
  });

  test("flags with scope 'both' appear for both client and assistant scopes", () => {
    (globalThis as Record<string, unknown>).window = {
      __CADET_FLAG_OVERRIDES__: {
        "sidebar-done": true,
      },
    };

    const clientResult = getEnvFlagOverridesForScope("client");
    const assistantResult = getEnvFlagOverridesForScope("assistant");

    expect(clientResult.bool).toEqual({ sidebarDone: true });
    expect(assistantResult.bool).toEqual({ sidebarDone: true });
  });
});

describe("scopeIncludes", () => {
  test("'both' includes client and assistant", () => {
    expect(scopeIncludes("both", "client")).toBe(true);
    expect(scopeIncludes("both", "assistant")).toBe(true);
  });

  test("'client' only includes client", () => {
    expect(scopeIncludes("client", "client")).toBe(true);
    expect(scopeIncludes("client", "assistant")).toBe(false);
  });

  test("'assistant' only includes assistant", () => {
    expect(scopeIncludes("assistant", "assistant")).toBe(true);
    expect(scopeIncludes("assistant", "client")).toBe(false);
  });
});
