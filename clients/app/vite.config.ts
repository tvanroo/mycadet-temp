import fs from "node:fs";
import path from "node:path";
import {
  defineConfig,
  type ConfigEnv,
  type Plugin,
  type UserConfig,
} from "vite";
import { sharedViteConfig } from "../../packages/assistant-ui/vite.shared.config";

const APP_SRC = path.resolve(import.meta.dirname, "src");
const PKG_SRC = path.resolve(
  import.meta.dirname,
  "../../packages/assistant-ui/src",
);
const SUFFIXES = ["", ".ts", ".tsx", ".css", "/index.ts", "/index.tsx"];

// `@/` resolves the account surface's own sources first, then falls through
// to the assistant-ui package both clients are built from — the import
// spellings predate the split, so they are identical on either side.
function aliasFallback(): Plugin {
  return {
    name: "app-alias-fallback",
    enforce: "pre",
    resolveId(source) {
      if (!source.startsWith("@/")) return null;
      const rest = source.slice(2);
      for (const root of [APP_SRC, PKG_SRC]) {
        for (const suffix of SUFFIXES) {
          const candidate = path.join(root, rest + suffix);
          if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
            return candidate;
          }
        }
      }
      return null;
    },
  };
}

// The desktop renderer builds the shared assistant-ui config (base, dev
// proxy, chunk groups, public dir) and composes the account routes into the
// tree on top. The factory's `@/` alias is stripped: the fallback plugin
// handles both roots.
export default defineConfig((env) => {
  const shared = sharedViteConfig(env);
  return {
    ...shared,
    plugins: [...(shared.plugins ?? []), aliasFallback()],
    resolve: { ...shared.resolve, alias: [] },
  };
});
