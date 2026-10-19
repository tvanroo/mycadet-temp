import { afterEach, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, waitFor } from "@testing-library/react";

mock.module("@/hooks/use-is-org-ready", () => ({
  useOrgHeaderReadiness: () => "ready",
  useIsOrgReady: () => true,
}));

const { PermissionGuidePage } = await import("./permission-guide-page");
const { useAuthStore } = await import("@/stores/auth-store");
const { useClientFeatureFlagStore } =
  await import("@/stores/client-feature-flag-store");
const { writeStoredThemePreference } =
  await import("@/utils/theme-preferences");

const originalFetch = globalThis.fetch;
const initialAuthState = useAuthStore.getState();
const initialFlagState = useClientFeatureFlagStore.getState();
const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

afterEach(() => {
  cleanup();
  queryClient.clear();
  globalThis.fetch = originalFetch;
  useAuthStore.setState(initialAuthState, true);
  useClientFeatureFlagStore.setState(initialFlagState, true);
  localStorage.removeItem("device:theme");
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.classList.remove("dark");
});


