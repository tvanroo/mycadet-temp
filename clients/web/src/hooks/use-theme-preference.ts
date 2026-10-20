import { useEffect, useState } from "react";

import {
  applyThemePreference,
  readStoredThemePreference,
  type ThemePreference,
  writeStoredThemePreference,
} from "@/utils/theme-preferences";
import { syncNativeLaunchScreenTheme } from "@/runtime/native-launch-screen";
import { watchDeviceSetting } from "@/utils/device-settings";

/**
 * Shared theme-preference state used by both the compact `ThemeToggle` in the
 * sidebar preferences popover and the `ThemePicker` on Settings → General.
 * Keeps the two surfaces in sync (they read/write the same device setting)
 * without duplicating the effect chain.
 *
 * @returns the current theme and a setter that persists + applies the choice.
 */
export function useThemePreference() {
  const [theme, setTheme] = useState<ThemePreference>(() =>
    readStoredThemePreference(),
  );

  useEffect(() => {
    setTheme(readStoredThemePreference());
  }, []);

  useEffect(() => {
    return watchDeviceSetting("theme", () => {
      setTheme(readStoredThemePreference());
    });
  }, []);

  useEffect(() => {
    applyThemePreference(theme);
  }, [theme]);

  const setThemePreference = (next: ThemePreference) => {
    setTheme(next);
    writeStoredThemePreference(next);
    void syncNativeLaunchScreenTheme(next);
  };

  return { theme, setThemePreference } as const;
}
