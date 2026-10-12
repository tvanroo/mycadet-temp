import { defineConfig, globalIgnores } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// The web module is the thin served entry over the @mycadet/assistant-ui
// package: its own surface is the HTML shell, the entry module, and the
// mobile/capacitor glue scripts. The assistant UI's lint rules — the domain
// ratchets, the typography and translation checks — live with that code in
// `packages/assistant-ui/eslint.config.mjs`.
const eslintConfig = defineConfig([
  ...tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  globalIgnores(["dist/**", "node_modules/**", "capacitor-shell/**"]),
]);

export default eslintConfig;
