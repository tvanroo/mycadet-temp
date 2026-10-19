/**
 * Applies the user's stored theme preference on mount and keeps
 * the document in sync when the OS-level `prefers-color-scheme`
 * changes.
 *
 * Call this once from the root layout so theme is applied before
 * any child UI paints.
 */
import { useEffect } from "react";

import {
  applyThemePreference,
  readStoredThemePreference,
} from "@/utils/theme-preferences";

export function useAppTheme() {
  useEffect(() => {
    applyThemePreference(readStoredThemePreference());

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleMediaChange = () => {
      if (readStoredThemePreference() === "system") {
        applyThemePreference("system");
      }
    };

    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);
}
