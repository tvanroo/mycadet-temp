import { SEEDS, clientEnvironmentName } from "@mycadet/environments/seeds";

/**
 * The deployment environment this bundle was baked for. Vite statically
 * replaces `import.meta.env.VITE_ENVIRONMENT` at build time — the dev
 * release train bakes `dev`, production builds bake `production` (or leave
 * it unset). Mirrors the CLI's own environment-driven URL resolution
 * (`cli/src/lib/cloud-client.ts`): the build channel owns cloud routing,
 * never runtime injection.
 */
export function currentEnvironment() {
  return clientEnvironmentName(import.meta.env.VITE_ENVIRONMENT);
}

/** Cloud API base for this bundle's environment. */
export function currentCloudUrl(): string {
  return SEEDS[currentEnvironment()].cloudUrl;
}

/** Platform web (login UI) base for this bundle's environment. */
export function currentWebUrl(): string {
  return SEEDS[currentEnvironment()].webUrl;
}
