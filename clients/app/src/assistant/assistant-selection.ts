import { z } from "zod";
import {
  assistantApiBaseUrl,
  type InjectedConfig,
} from "@app/lib/injected-config";

const SelectionStateSchema = z.object({
  assistantSelection: z.object({
    id: z.string().min(1),
    apiBaseUrl: z.string(),
  }),
});
type HostConfig = Pick<InjectedConfig, "apiBaseUrl" | "cloudUrl">;

export function assistantSelectionState(id: string, config: HostConfig) {
  return {
    assistantSelection: {
      id,
      apiBaseUrl: assistantApiBaseUrl(config) ?? "/",
    },
  };
}

export function selectedAssistantId(
  state: unknown,
  config: HostConfig,
): string | undefined {
  const parsed = SelectionStateSchema.safeParse(state);
  if (!parsed.success) {
    return undefined;
  }
  const selection = parsed.data.assistantSelection;
  return selection.apiBaseUrl === (assistantApiBaseUrl(config) ?? "/")
    ? selection.id
    : undefined;
}
