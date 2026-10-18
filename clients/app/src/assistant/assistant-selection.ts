import { z } from "zod";

const SelectionStateSchema = z.object({
  assistantSelection: z.object({
    id: z.string().min(1),
  }),
});

/**
 * The hand-off state a chosen assistant rides through `navigate()`. The
 * stale-guard `apiBaseUrl` field is gone: the bundle's cloud URL is a pure
 * function of its baked environment, so there is no injected value it could
 * drift from.
 */
export function assistantSelectionState(id: string) {
  return { assistantSelection: { id } };
}

export function selectedAssistantId(state: unknown): string | undefined {
  const parsed = SelectionStateSchema.safeParse(state);
  if (!parsed.success) {
    return undefined;
  }
  return parsed.data.assistantSelection.id;
}
