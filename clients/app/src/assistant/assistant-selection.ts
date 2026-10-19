import { z } from "zod";

const SelectionStateSchema = z.object({
  assistantSelection: z.object({
    id: z.string().min(1),
    apiBaseUrl: z.string(),
  }),
});

/**
 * The shell resolves assistants same-origin — the origin serving the shell
 * routes `/v1` to the right control plane (the tunnel edge proxies it to
 * the local gateway; the desktop protocol forwards it; the cloud takeover
 * proxies it) — so a selection carries that base as its scope tag: state
 * captured under one tag must not apply where the tag differs.
 */
const SAME_ORIGIN_API_BASE = "/";

export function assistantSelectionState(id: string) {
  return {
    assistantSelection: {
      id,
      apiBaseUrl: SAME_ORIGIN_API_BASE,
    },
  };
}

export function selectedAssistantId(state: unknown): string | undefined {
  const parsed = SelectionStateSchema.safeParse(state);
  if (!parsed.success) {
    return undefined;
  }
  const selection = parsed.data.assistantSelection;
  return selection.apiBaseUrl === SAME_ORIGIN_API_BASE
    ? selection.id
    : undefined;
}
