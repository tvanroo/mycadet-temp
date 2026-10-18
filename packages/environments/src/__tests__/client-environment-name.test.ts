import { describe, expect, test } from "bun:test";

import { clientEnvironmentName, isEnvironmentName } from "../seeds.js";

describe("clientEnvironmentName", () => {
  test("passes through a known baked environment", () => {
    expect(clientEnvironmentName("dev")).toBe("dev");
    expect(clientEnvironmentName("production")).toBe("production");
    expect(clientEnvironmentName("staging")).toBe("staging");
  });

  test("falls back to production for unset or unknown values", () => {
    expect(clientEnvironmentName(undefined)).toBe("production");
    expect(clientEnvironmentName("")).toBe("production");
    expect(clientEnvironmentName("beta")).toBe("production");
  });

  test("isEnvironmentName rejects non-names", () => {
    expect(isEnvironmentName("dev")).toBe(true);
    expect(isEnvironmentName("local")).toBe(true);
    expect(isEnvironmentName("DEV")).toBe(false);
    expect(isEnvironmentName(null)).toBe(false);
    expect(isEnvironmentName(42)).toBe(false);
  });
});
