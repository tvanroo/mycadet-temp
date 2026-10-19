import { expect, test } from "bun:test";
import {
  assistantSelectionState,
  selectedAssistantId,
} from "./assistant-selection";

test("selection state carries the same-origin base as its scope tag", () => {
  const state = assistantSelectionState("assistant-2");
  expect(state.assistantSelection.apiBaseUrl).toBe("/");
  expect(selectedAssistantId(state)).toBe("assistant-2");
});

test("a selection tagged with a foreign API base never resolves", () => {
  expect(
    selectedAssistantId({
      assistantSelection: {
        id: "assistant-2",
        apiBaseUrl: "https://cloud.mycadet.ai",
      },
    }),
  ).toBeUndefined();
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
