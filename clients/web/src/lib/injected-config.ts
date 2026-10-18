import { z } from "zod";

/** Where the cadet comes from — the same values `cadet hatch --remote` records. */
export type Remote = "local" | "docker" | "custom" | "cloud";

/**
 * The runtime config a shell injects (`window.__CADET_CONFIG__`). This schema
 * is the single shape: readers parse the window through it instead of
 * re-declaring per-file object types.
 *
 * Bundles resolve `cloudUrl`/`webUrl` from their baked environment (the
 * `@mycadet/environments` seeds, exactly like the CLI resolves its own) —
 * they are deliberately NOT injected. `hubUrl` is the public base URL the
 * serving nginx/tunnel edge is reachable at, stamped by the edge itself.
 */
export const InjectedConfigSchema = z.object({
  /** Nothing injected (SSR) or an unparseable config means the local cadet. */
  remote: z.enum(["local", "docker", "custom", "cloud"]).default("local"),
  /** Device id stamped by the Electron host (device management). */
  deviceId: z.string().optional(),
  /** Serving assistant's id (remote-web ingress configs only). */
  assistantId: z.string().optional(),
  /** Serving assistant's display name (remote-web ingress configs only). */
  assistantName: z.string().optional(),
  /** Public base URL the serving nginx/tunnel edge is reachable at
   *  (remote-web ingress configs only). */
  hubUrl: z.string().optional(),
});

export type InjectedConfig = z.infer<typeof InjectedConfigSchema>;

/**
 * The parsed injected config, or `undefined` when nothing usable was
 * injected (SSR, a host that injects nothing, or a config that doesn't
 * parse). The `remote` default lives in the schema, so any returned config
 * always carries one.
 */
export function readInjectedConfig(): InjectedConfig | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const parsed = InjectedConfigSchema.safeParse(window.__CADET_CONFIG__);
  return parsed.success ? parsed.data : undefined;
}
