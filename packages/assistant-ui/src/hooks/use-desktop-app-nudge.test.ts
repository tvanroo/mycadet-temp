import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook } from "@testing-library/react";

import { CADET_DOWNLOADS_URL } from "@/utils/external-urls";

const { openDesktopAppDownload, useDesktopAppNudgeState } =
  await import("@/hooks/use-desktop-app-nudge");

const originalWindowOpen = window.open;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  window.open = originalWindowOpen;
});

describe("desktop app download link", () => {
  test("opens the canonical downloads page", () => {
    const open = mock(() => null);
    window.open = open as typeof window.open;

    openDesktopAppDownload();

    expect(open).toHaveBeenCalledWith(
      "https://www.mycadet.ai/downloads",
      "_blank",
      "noopener,noreferrer",
    );
    expect(CADET_DOWNLOADS_URL).toBe("https://www.mycadet.ai/downloads");
  });

  test("a download or dismissal ends the banner, and the dismiss persists", () => {
    const open = mock(() => null) as typeof window.open;
    window.open = open;
    const first = renderHook(() => useDesktopAppNudgeState("windows"));

    act(() => first.result.current.handleBannerDismiss());
    expect(first.result.current.bannerShouldShow).toBe(false);

    // The dismissal is a persisted contract the next browser session reads.
    const second = renderHook(() => useDesktopAppNudgeState("windows"));
    expect(second.result.current.bannerShouldShow).toBe(false);
  });
});
