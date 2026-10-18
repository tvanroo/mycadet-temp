import { expect, test } from "bun:test";
import {
  assistantSelectionState,
  selectedAssistantId,
} from "./assistant-selection";

test("route selection round-trips through browser history state", () => {
  const state = assistantSelectionState("assistant-2");
  expect(selectedAssistantId(state)).toBe("assistant-2");
  expect(selectedAssistantId(assistantSelectionState("assistant-1"))).toBe(
    "assistant-1",
  );
});

test("malformed browser history never supplies an assistant selection", () => {
  for (const value of [
    null,
    {},
    { assistantSelection: null },
    { assistantSelection: { id: 123, apiBaseUrl: "/" } },
    { assistantSelection: { id: "", apiBaseUrl: "/" } },
  ]) {
    expect(selectedAssistantId(value)).toBeUndefined();
  }
});
