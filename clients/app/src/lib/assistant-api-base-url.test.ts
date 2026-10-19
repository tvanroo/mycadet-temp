import { describe, expect, test } from "bun:test";
import { assistantApiBaseUrl } from "./injected-config";

describe("assistantApiBaseUrl", () => {
  test("the tunnel edge's injected same-origin base wins over cloud", () => {
    expect(
      assistantApiBaseUrl({
        apiBaseUrl: "/v1",
        cloudUrl: "https://cloud.mycadet.ai",
      }),
    ).toBe("/v1");
  });

  test("hosts that resolve their own base fall back to cloudUrl", () => {
    expect(assistantApiBaseUrl({ cloudUrl: "https://cloud.mycadet.ai" })).toBe(
      "https://cloud.mycadet.ai",
    );
  });

  test("no host config resolves to nothing", () => {
    expect(assistantApiBaseUrl(undefined)).toBeUndefined();
    expect(assistantApiBaseUrl({})).toBeUndefined();
  });
});
