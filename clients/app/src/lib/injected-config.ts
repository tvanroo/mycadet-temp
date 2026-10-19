import { z } from "zod";

/** Where the cadet comes from — the same values `cadet hatch --remote` records. */
export type Remote = "local" | "docker" | "custom" | "cloud";

/**
 * The runtime config a shell injects (`(window as Window & { __CADET_CONFIG__?: unknown }).__CADET_CONFIG__`). This schema
 * is the single shape: readers parse the window through it instead of
 * re-declaring per-file object types.
 *
 * The URL fields are distinct origins in the topology, not synonyms:
 * `cloudUrl` is the cloud API base, `webUrl` the platform login UI the
 * localhost OAuth handoff bounces through, and `hubUrl` the cloud hub SPA
 * the pairing/settings pages link back to.
 */
export const InjectedConfigSchema = z.object({
  /** Nothing injected (SSR) or an unparseable config means the local cadet. */
  remote: z.enum(["local", "docker", "custom", "cloud"]).default("local"),
  /** Cloud API base (auth endpoints + assistant API). */
  cloudUrl: z.string().optional(),
  /** Platform login UI base for localhost OAuth handoff. */
  webUrl: z.string().optional(),
  /** Device id stamped by the Electron host (device management). */
  deviceId: z.string().optional(),
  /** Version of the shell bundle serving this page (stamped by the host). */
  version: z.string().optional(),
  /** Serving assistant's id (remote-web ingress configs only). */
  assistantId: z.string().optional(),
  /** Serving assistant's display name (remote-web ingress configs only). */
  assistantName: z.string().optional(),
  /**
   * Assistant API base the serving host injects — same-origin `/v1` for the
   * CLI's tunnel edge (nginx proxies it to the local gateway). Hosts that
   * resolve their own API base (the desktop, the cloud takeover) omit it and
   * the shell falls back to `cloudUrl`.
   */
  apiBaseUrl: z.string().optional(),
  /** Cloud web SPA base for this build's environment (remote-web ingress configs only). */
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
  const parsed = InjectedConfigSchema.safeParse(
    (window as Window & { __CADET_CONFIG__?: unknown }).__CADET_CONFIG__,
  );
  return parsed.success ? parsed.data : undefined;
}

/**
 * The assistant API base the shell resolves assistants through: the
 * host-injected same-origin base when one is stamped (the CLI's tunnel edge
 * injects `/v1`), else the host's cloud API base. A remote:local assistant
 * served by the tunnel edge therefore resolves from its own origin — the
 * cloud origin can neither see it nor answer with the credentials mode the
 * shell sends.
 */
export function assistantApiBaseUrl(
  config?: Pick<InjectedConfig, "apiBaseUrl" | "cloudUrl">,
): string | undefined {
  return config?.apiBaseUrl ?? config?.cloudUrl;
}
